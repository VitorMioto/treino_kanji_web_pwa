"use strict";

const REQUIRED_COLUMNS = ["palavra", "correta", "opcao2", "opcao3", "opcao4", "traducao"];

const state = {
  questions: [],
  gameQuestions: [],
  currentIndex: 0,
  correct: 0,
  wrong: 0,
  answeredCurrent: false,
  selectedOption: null,
  remainingSeconds: 0,
  timerId: null,
};

const elements = {
  screens: document.querySelectorAll(".screen"),
  homeScreen: document.querySelector("#home-screen"),
  gameScreen: document.querySelector("#game-screen"),
  resultScreen: document.querySelector("#result-screen"),
  brandLink: document.querySelector("#brand-link"),
  csvInput: document.querySelector("#csv-input"),
  fileDrop: document.querySelector("#file-drop"),
  fileStatus: document.querySelector("#file-status"),
  minutesInput: document.querySelector("#minutes-input"),
  secondsInput: document.querySelector("#seconds-input"),
  startButton: document.querySelector("#start-button"),
  questionProgress: document.querySelector("#question-progress"),
  progressBar: document.querySelector("#progress-bar"),
  timer: document.querySelector("#timer"),
  questionWord: document.querySelector("#question-word"),
  translation: document.querySelector("#translation"),
  answers: document.querySelector("#answers"),
  nextButton: document.querySelector("#next-button"),
  scoreRing: document.querySelector("#score-ring"),
  scorePercentage: document.querySelector("#score-percentage"),
  resultAnswered: document.querySelector("#result-answered"),
  resultCorrect: document.querySelector("#result-correct"),
  resultWrong: document.querySelector("#result-wrong"),
  playAgainButton: document.querySelector("#play-again-button"),
  toast: document.querySelector("#toast"),
};

elements.csvInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) importCsv(file);
});

elements.fileDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.fileDrop.classList.add("dragging");
});

elements.fileDrop.addEventListener("dragleave", () => {
  elements.fileDrop.classList.remove("dragging");
});

elements.fileDrop.addEventListener("drop", (event) => {
  event.preventDefault();
  elements.fileDrop.classList.remove("dragging");
  const [file] = event.dataTransfer.files;
  if (file) importCsv(file);
});

[elements.minutesInput, elements.secondsInput].forEach((input) => {
  input.addEventListener("input", updateStartButton);
});

elements.startButton.addEventListener("click", startGame);
elements.nextButton.addEventListener("click", nextQuestion);
elements.playAgainButton.addEventListener("click", returnHome);
elements.brandLink.addEventListener("click", (event) => {
  event.preventDefault();
  returnHome();
});

async function importCsv(file) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    showToast("Escolha um arquivo com extensão .csv.");
    return;
  }

  try {
    const content = await file.text();
    state.questions = parseQuestions(content);
    elements.fileDrop.classList.add("loaded");
    elements.fileStatus.textContent = `${file.name} · ${state.questions.length} perguntas`;
    showToast("CSV importado com sucesso.");
  } catch (error) {
    state.questions = [];
    elements.fileDrop.classList.remove("loaded");
    elements.fileStatus.textContent = "Nenhum arquivo importado";
    showToast(error.message || "Não foi possível importar o CSV.");
  }
  updateStartButton();
}

function parseQuestions(content) {
  const rows = parseCsv(content).filter((row) => row.some((value) => value.trim()));
  if (rows.length === 0) throw new Error("O CSV está vazio.");

  const headers = rows[0].map(normalizeHeader);
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) throw new Error(`Coluna obrigatória ausente: ${column}.`);
  }

  const indexes = Object.fromEntries(REQUIRED_COLUMNS.map((column) => [column, headers.indexOf(column)]));
  const maxIndex = Math.max(...Object.values(indexes));
  const questions = rows.slice(1).map((values, index) => {
    const lineNumber = index + 2;
    if (values.length <= maxIndex) throw new Error(`Linha ${lineNumber} possui colunas insuficientes.`);

    const get = (column) => values[indexes[column]].trim();
    const question = {
      palavra: get("palavra"),
      correta: get("correta"),
      opcoesIncorretas: [get("opcao2"), get("opcao3"), get("opcao4")],
      traducao: get("traducao"),
    };

    const valuesToValidate = [question.palavra, question.correta, ...question.opcoesIncorretas, question.traducao];
    if (valuesToValidate.some((value) => !value)) throw new Error(`Linha ${lineNumber} possui campos vazios.`);
    return question;
  });

  if (questions.length === 0) throw new Error("O CSV não possui perguntas válidas.");
  return questions;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ";" && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error("CSV possui aspas sem fechamento.");
  row.push(field);
  rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return value.trim().replace(/^\uFEFF/, "").toLowerCase();
}

function selectedDuration() {
  const minutes = clamp(Number.parseInt(elements.minutesInput.value, 10) || 0, 0, 999);
  const seconds = clamp(Number.parseInt(elements.secondsInput.value, 10) || 0, 0, 59);
  return minutes * 60 + seconds;
}

function updateStartButton() {
  elements.startButton.disabled = state.questions.length === 0 || selectedDuration() === 0;
}

function startGame() {
  const duration = selectedDuration();
  if (!state.questions.length || duration === 0) return;

  state.gameQuestions = shuffle([...state.questions]);
  state.currentIndex = 0;
  state.correct = 0;
  state.wrong = 0;
  state.remainingSeconds = duration;
  state.answeredCurrent = false;
  state.selectedOption = null;

  showScreen(elements.gameScreen);
  renderQuestion();
  renderTimer();
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 1000);
}

function renderQuestion() {
  const question = state.gameQuestions[state.currentIndex];
  const position = state.currentIndex + 1;
  elements.questionProgress.textContent = `Pergunta ${position} de ${state.gameQuestions.length}`;
  elements.progressBar.style.width = `${(position / state.gameQuestions.length) * 100}%`;
  elements.questionWord.textContent = question.palavra;
  elements.translation.textContent = "";
  elements.nextButton.classList.remove("visible");
  elements.nextButton.textContent = position === state.gameQuestions.length ? "Finalizar" : "Próxima";
  elements.answers.replaceChildren();

  const options = shuffle([question.correta, ...question.opcoesIncorretas]);
  for (const option of options) {
    const button = document.createElement("button");
    button.className = "answer-button";
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => answerQuestion(option));
    elements.answers.append(button);
  }
}

function answerQuestion(option) {
  if (state.answeredCurrent) return;
  state.answeredCurrent = true;
  state.selectedOption = option;

  const question = state.gameQuestions[state.currentIndex];
  if (option === question.correta) state.correct += 1;
  else state.wrong += 1;

  for (const button of elements.answers.children) {
    button.disabled = true;
    if (button.textContent === question.correta) button.classList.add("correct");
    else if (button.textContent === option) button.classList.add("wrong");
  }

  elements.translation.textContent = question.traducao;
  elements.nextButton.classList.add("visible");
}

function nextQuestion() {
  if (state.currentIndex >= state.gameQuestions.length - 1) {
    finishGame();
    return;
  }
  state.currentIndex += 1;
  state.answeredCurrent = false;
  state.selectedOption = null;
  renderQuestion();
}

function tick() {
  state.remainingSeconds -= 1;
  if (state.remainingSeconds <= 0) {
    state.remainingSeconds = 0;
    renderTimer();
    finishGame();
    return;
  }
  renderTimer();
}

function renderTimer() {
  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  elements.timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  elements.timer.classList.toggle("urgent", state.remainingSeconds <= 10);
}

function finishGame() {
  clearInterval(state.timerId);
  state.timerId = null;
  const answered = state.correct + state.wrong;
  const percentage = answered === 0 ? 0 : (state.correct / answered) * 100;

  elements.scorePercentage.textContent = `${percentage.toFixed(1)}%`;
  elements.scoreRing.style.background = `conic-gradient(var(--primary) ${percentage}%, #e5ece9 0)`;
  elements.resultAnswered.textContent = answered;
  elements.resultCorrect.textContent = state.correct;
  elements.resultWrong.textContent = state.wrong;
  showScreen(elements.resultScreen);
}

function returnHome() {
  clearInterval(state.timerId);
  state.timerId = null;
  showScreen(elements.homeScreen);
}

function showScreen(screen) {
  elements.screens.forEach((item) => item.classList.toggle("active", item === screen));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimeout;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("./service-worker.js")
            .then(() => {
                console.log("Treino Kanji Web - Service Worker registrado");
            })
            .catch((error) => {
                console.error("Erro ao registrar Service Worker:", error);
            });
    });
}