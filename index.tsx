/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";

// --- Configuration & State ---

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;

if (API_KEY) {
    try {
        ai = new GoogleGenAI({ apiKey: API_KEY });
    } catch (e) {
        console.error("Failed to initialize GoogleGenAI", e);
    }
} else {
    console.warn("API_KEY environment variable not set. AI-powered hints will be disabled.");
}


interface AppState {
    a: number;
    b: number;
    activeTab: 'experiment' | 'game' | 'quiz';
    game: {
        secretA: number;
        secretB: number;
        points: { x: number; y: number }[];
        score: number;
    };
    quiz: {
        questions: QuizQuestion[];
        currentQuestionIndex: number;
        score: number;
        answered: boolean;
    };
}

interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation?: string;
}

const state: AppState = {
    a: 1,
    b: 0,
    activeTab: 'experiment',
    game: {
        secretA: 1,
        secretB: 2,
        points: [],
        score: 0,
    },
    quiz: {
        questions: [
            {
                question: "Nếu y = -2x + 3, đồ thị hàm số đi lên hay đi xuống?",
                options: ["Đi lên (đồng biến)", "Đi xuống (nghịch biến)"],
                correctAnswer: "Đi xuống (nghịch biến)",
            },
            {
                question: "Với hàm số y = ax + b, khi b = 0, đồ thị sẽ luôn đi qua điểm nào?",
                options: ["(0, 1)", "Gốc tọa độ (0, 0)", "(1, 0)"],
                correctAnswer: "Gốc tọa độ (0, 0)",
            },
            {
                question: "Trong hàm số y = 5x - 1, hệ số góc là bao nhiêu?",
                options: ["5", "-1", "1"],
                correctAnswer: "5",
            },
             {
                question: "Hai đường thẳng y = 2x + 1 và y = 2x - 3 có vị trí tương đối là gì?",
                options: ["Cắt nhau", "Song song", "Trùng nhau"],
                correctAnswer: "Song song",
            },
        ],
        currentQuestionIndex: 0,
        score: 0,
        answered: false,
    },
};

// --- DOM Element References ---
const appContainer = document.getElementById('app-container')!;

const tabButtons = {
    experiment: document.getElementById('tab-experiment')!,
    game: document.getElementById('tab-game')!,
    quiz: document.getElementById('tab-quiz')!,
};

const contentSections = {
    experiment: document.getElementById('experiment-section')!,
    game: document.getElementById('game-section')!,
    quiz: document.getElementById('quiz-section')!,
};

// Experiment Elements
const sliderA = document.getElementById('slider-a') as HTMLInputElement;
const sliderB = document.getElementById('slider-b') as HTMLInputElement;
const aValueSpan = document.getElementById('a-value')!;
const bValueSpan = document.getElementById('b-value')!;
const experimentCanvas = document.getElementById('graph-canvas') as HTMLCanvasElement;
const hintText = document.getElementById('hint-text')!;
const expCtx = experimentCanvas.getContext('2d')!;

// Game Elements
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const gameCtx = gameCanvas.getContext('2d')!;
const guessAInput = document.getElementById('guess-a') as HTMLInputElement;
const guessBInput = document.getElementById('guess-b') as HTMLInputElement;
const checkAnswerBtn = document.getElementById('check-answer-btn')!;
const newGameBtn = document.getElementById('new-game-btn')!;
const gameFeedback = document.getElementById('game-feedback')!;
const gameScoreSpan = document.getElementById('game-score')!;

// Quiz Elements
const quizQuestionEl = document.getElementById('quiz-question')!;
const quizOptionsEl = document.getElementById('quiz-options')!;
const quizFeedbackEl = document.getElementById('quiz-feedback')!;
const nextQuestionBtn = document.getElementById('next-question-btn')!;
const quizScoreSpan = document.getElementById('quiz-score')!;


// --- Graph Drawing Logic ---

const drawGridAndAxes = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const { width, height } = canvas;
    const scale = 20; // 20 pixels per unit
    const originX = width / 2;
    const originY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.beginPath();
    ctx.strokeStyle = '#f0f0f0';
    for (let x = scale; x < width; x += scale) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = scale; y < height; y += scale) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw axes
    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    // X-axis
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    // Y-axis
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);
    ctx.stroke();
    
    // Draw axis labels
    ctx.font = '12px Arial';
    ctx.fillStyle = '#333';
    ctx.fillText('x', width - 15, originY - 10);
    ctx.fillText('y', originX + 10, 15);
};

const drawFunction = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, a: number, b: number, color = '#4a90e2') => {
    const { width, height } = canvas;
    const scale = 20;
    const originX = width / 2;
    const originY = height / 2;

    const activeColor = getComputedStyle(appContainer).getPropertyValue('--active-color');

    ctx.beginPath();
    ctx.strokeStyle = color === '#4a90e2' ? activeColor : color;
    ctx.lineWidth = 3;

    const xMin = -originX / scale;
    const xMax = originX / scale;
    
    const y1 = -(a * xMin + b) * scale + originY;
    const y2 = -(a * xMax + b) * scale + originY;

    ctx.moveTo(0, y1);
    ctx.lineTo(width, y2);
    ctx.stroke();
};

const drawPoints = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, points: {x: number, y: number}[]) => {
    const { width, height } = canvas;
    const scale = 20;
    const originX = width / 2;
    const originY = height / 2;

    points.forEach(point => {
        const canvasX = originX + point.x * scale;
        const canvasY = originY - point.y * scale;

        ctx.beginPath();
        ctx.fillStyle = '#dc3545';
        ctx.arc(canvasX, canvasY, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        ctx.fillText(`(${point.x}, ${point.y})`, canvasX + 8, canvasY - 8);
    });
};


// --- Tab Management ---

const setActiveTab = (tab: AppState['activeTab']) => {
    state.activeTab = tab;
    
    // Update theme class on container
    appContainer.classList.remove('experiment-active', 'game-active', 'quiz-active');
    appContainer.classList.add(`${tab}-active`);

    Object.values(tabButtons).forEach(btn => btn.classList.remove('active'));
    Object.values(contentSections).forEach(sec => sec.classList.remove('active'));

    tabButtons[tab].classList.add('active');
    contentSections[tab].classList.add('active');
    
    if(tab === 'experiment') updateExperimentView();
    if(tab === 'game') updateGameView();
    if(tab === 'quiz') updateQuizView();
};


// --- Experiment Logic ---

const updateExperimentView = () => {
    drawGridAndAxes(expCtx, experimentCanvas);
    drawFunction(expCtx, experimentCanvas, state.a, state.b);

    aValueSpan.textContent = state.a.toFixed(1);
    bValueSpan.textContent = state.b.toFixed(1);

    if (state.a > 0) {
        hintText.textContent = "a > 0: Đồ thị đi lên (hàm số đồng biến).";
    } else if (state.a < 0) {
        hintText.textContent = "a < 0: Đồ thị đi xuống (hàm số nghịch biến).";
    } else {
        hintText.textContent = "a = 0: Đồ thị là đường thẳng song song với trục hoành.";
    }
};

const handleSliderChange = () => {
    state.a = parseFloat(sliderA.value);
    state.b = parseFloat(sliderB.value);
    updateExperimentView();
};


// --- Game Logic ---

const startNewGame = () => {
    // Generate integer a and b, a != 0
    state.game.secretA = Math.floor(Math.random() * 9) - 4;
    if (state.game.secretA === 0) state.game.secretA = 1; 

    state.game.secretB = Math.floor(Math.random() * 7) - 3;
    
    // Generate two distinct points
    const x1 = Math.floor(Math.random() * 3) - 1; // x can be -1, 0, 1
    let x2 = Math.floor(Math.random() * 4) - 2; // x can be -2, -1, 0, 1
    while (x2 === x1) {
        x2 = Math.floor(Math.random() * 4) - 2;
    }
    
    const y1 = state.game.secretA * x1 + state.game.secretB;
    const y2 = state.game.secretA * x2 + state.game.secretB;

    state.game.points = [{x: x1, y: y1}, {x: x2, y: y2}];
    
    guessAInput.value = '';
    guessBInput.value = '';
    gameFeedback.innerHTML = '';
    gameFeedback.className = 'feedback';
    
    updateGameView();
};

const updateGameView = () => {
    drawGridAndAxes(gameCtx, gameCanvas);
    // Draw the hidden function line for context, maybe slightly transparent
    drawFunction(gameCtx, gameCanvas, state.game.secretA, state.game.secretB, 'rgba(139, 92, 246, 0.2)'); 
    drawPoints(gameCtx, gameCanvas, state.game.points);
    gameScoreSpan.textContent = `Điểm: ${state.game.score}`;
};


const checkGameAnswer = async () => {
    const guessA = parseFloat(guessAInput.value);
    const guessB = parseFloat(guessBInput.value);

    if (isNaN(guessA) || isNaN(guessB)) {
        gameFeedback.textContent = 'Vui lòng nhập đủ cả hai giá trị a và b.';
        gameFeedback.className = 'feedback incorrect';
        return;
    }

    if (guessA === state.game.secretA && guessB === state.game.secretB) {
        state.game.score += 10;
        gameScoreSpan.textContent = `Điểm: ${state.game.score}`;
        gameFeedback.textContent = 'Chính xác! Bạn thật tuyệt vời! Bấm "Trò chơi mới" để tiếp tục.';
        gameFeedback.className = 'feedback correct';
        // Draw the correct line on top
        drawFunction(gameCtx, gameCanvas, state.game.secretA, state.game.secretB);
    } else {
        if (ai) {
            gameFeedback.textContent = 'Sai rồi. Đang nhờ AI trợ giúp...';
            gameFeedback.className = 'feedback loading';
            
            try {
                const prompt = `Một học sinh lớp 8 đang chơi game đoán hàm số bậc nhất y=ax+b.
                Hàm số đúng là y=${state.game.secretA}x + ${state.game.secretB}.
                Học sinh đoán là y=${guessA}x + ${guessB}.
                Các điểm cho trước trên đồ thị là (${state.game.points[0].x}, ${state.game.points[0].y}) và (${state.game.points[1].x}, ${state.game.points[1].y}).
                Hãy đưa ra một gợi ý ngắn gọn, thân thiện bằng tiếng Việt để giúp học sinh tìm ra đáp án đúng. Bắt đầu bằng "Gợi ý:". Ví dụ: "Gợi ý: Hãy thử tính hệ số góc 'a' từ hai điểm đã cho nhé!" hoặc "Gợi ý: Hãy xem đường thẳng cắt trục tung tại điểm nào để tìm 'b'."`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });

                gameFeedback.textContent = response.text;
                gameFeedback.className = 'feedback incorrect';
            } catch (error) {
                console.error(error);
                gameFeedback.textContent = "Gợi ý: Hãy kiểm tra lại cách tính hệ số góc 'a' và điểm cắt trục tung 'b'.";
                gameFeedback.className = 'feedback incorrect';
            }
        } else {
             gameFeedback.textContent = "Gợi ý: Hãy kiểm tra lại cách tính hệ số góc 'a' và điểm cắt trục tung 'b'.";
             gameFeedback.className = 'feedback incorrect';
        }
    }
};

// --- Quiz Logic ---

const loadQuizQuestion = () => {
    state.quiz.answered = false;
    const currentQ = state.quiz.questions[state.quiz.currentQuestionIndex];
    quizQuestionEl.textContent = currentQ.question;
    quizOptionsEl.innerHTML = '';
    quizFeedbackEl.innerHTML = '';
    quizFeedbackEl.className = 'feedback';
    nextQuestionBtn.style.display = 'none';

    currentQ.options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.addEventListener('click', () => handleQuizAnswer(option, button));
        quizOptionsEl.appendChild(button);
    });
};

const handleQuizAnswer = (selectedOption: string, selectedButton: HTMLButtonElement) => {
    if (state.quiz.answered) return;
    state.quiz.answered = true;

    const currentQ = state.quiz.questions[state.quiz.currentQuestionIndex];
    const isCorrect = selectedOption === currentQ.correctAnswer;

    if (isCorrect) {
        state.quiz.score += 10;
        quizScoreSpan.textContent = `Điểm: ${state.quiz.score}`;
        selectedButton.classList.add('correct');
        quizFeedbackEl.textContent = 'Chính xác!';
        quizFeedbackEl.className = 'feedback correct';
    } else {
        selectedButton.classList.add('incorrect');
        quizFeedbackEl.textContent = `Sai rồi. Đáp án đúng là: ${currentQ.correctAnswer}`;
        quizFeedbackEl.className = 'feedback incorrect';
        
        // Highlight correct answer
        const correctButton = Array.from(quizOptionsEl.children).find(
            btn => (btn as HTMLButtonElement).textContent === currentQ.correctAnswer
        ) as HTMLButtonElement;
        if(correctButton) correctButton.classList.add('correct');
    }

    // Disable all buttons
    Array.from(quizOptionsEl.children).forEach(btn => ((btn as HTMLButtonElement).disabled = true));
    
    if(state.quiz.currentQuestionIndex < state.quiz.questions.length - 1) {
        nextQuestionBtn.style.display = 'block';
    } else {
        quizFeedbackEl.textContent += " Bạn đã hoàn thành bài trắc nghiệm!";
    }
};

const loadNextQuestion = () => {
    if (state.quiz.currentQuestionIndex < state.quiz.questions.length - 1) {
        state.quiz.currentQuestionIndex++;
        loadQuizQuestion();
    }
};

const updateQuizView = () => {
    quizScoreSpan.textContent = `Điểm: ${state.quiz.score}`;
    loadQuizQuestion();
}


// --- Initialization ---

const initialize = () => {
    // Event Listeners
    sliderA.addEventListener('input', handleSliderChange);
    sliderB.addEventListener('input', handleSliderChange);

    Object.entries(tabButtons).forEach(([key, button]) => {
        button.addEventListener('click', () => setActiveTab(key as AppState['activeTab']));
    });
    
    newGameBtn.addEventListener('click', startNewGame);
    checkAnswerBtn.addEventListener('click', checkGameAnswer);

    nextQuestionBtn.addEventListener('click', loadNextQuestion);
    
    // Initial setup
    setActiveTab('experiment');
    startNewGame(); // Prepare the first game
};

initialize();