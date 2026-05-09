/* ============================
   TVL / IronGlass Lens Quiz
   ============================ */

const IMG_BASE = "https://raw.githubusercontent.com/tvlmedia/IronGlass/main/images/";

const QUIZ_LENGTH = 10;

/*
  Zet geheime lenzen hier uit.
  Titan staat dus bewust NIET aan.
*/
const ENABLED_LENSES = [
  "IronGlass Red P",
  "IronGlass Sovjet MKII",
  "IronGlass Zeiss Jena",
  "IronGlass Sovjet Medium Format"
];

const UI_FOCALS = ["20mm", "28mm", "35mm", "50mm", "85mm", "120mm"];

const LENSES = [
  "IronGlass Red P",
  "IronGlass Sovjet MKII",
  "IronGlass Zeiss Jena",
  "IronGlass Sovjet Medium Format"
];

const notes = {
  "ironglass_sovjet_mkii_120mm": "135mm",
  "ironglass_sovjet_mkii_50mm": "58mm",
  "ironglass_sovjet_mkii_35mm": "37mm",

  "ironglass_red_p_50mm": "58mm",
  "ironglass_red_p_35mm": "37mm",

  "ironglass_zeiss_jena_85mm": "80mm",

  "ironglass_sovjet_medium_format_28mm": "30mm"
};

const MEASURED_TSTOPS = {
  "ironglass_sovjet_medium_format": {
    "120mm": ["4", "2.9"],
    "90mm":  ["4"],
    "80mm":  ["4", "2.9"],
    "65mm":  ["4", "3.8"],
    "45mm_m35": ["4", "3.9"],
    "45mm_m50": ["4", "3.9"],
    "35mm":  ["4", "2.9"],
    "30mm":  ["4", "3.8"]
  },

  "ironglass_zeiss_jena": {
    "120mm": ["4", "2.9"],
    "80mm":  ["4", "2.8", "1.9"],
    "50mm":  ["4", "2.8", "1.9"],
    "35mm":  ["4", "2.8", "2.5"],
    "28mm":  ["4", "2.9"],
    "20mm":  ["4", "2.9"]
  },

  "ironglass_sovjet_mkii": {
    "135mm": ["4", "2.9"],
    "85mm":  ["4", "2.8", "2", "1.6"],
    "58mm":  ["4", "2.9", "2.1"],
    "37mm":  ["4", "2.9"],
    "28mm":  ["4", "3.6"],
    "20mm":  ["4", "3.6"]
  },

  "ironglass_red_p": {
    "85mm":  ["4", "2.8", "2.1"],
    "58mm":  ["4", "2.8", "2.1"],
    "37mm":  ["4", "2.9"]
  }
};

const ALT_FOCAL_OPTIONS = {
  "ironglass_sovjet_medium_format": {
    "85mm": ["80mm", "90mm"],
    "50mm": ["65mm", "45mm_m50"],
    "35mm": ["35mm", "45mm_m35"]
  }
};

const lensDescriptions = {
  "IronGlass Red P": {
    text: "Extremely vintage Soviet optics with single coating, heavy character, flare and distortion."
  },
  "IronGlass Zeiss Jena": {
    text: "Soft vintage signature without heavy distortion or wild flares. Character while keeping faces natural."
  },
  "IronGlass Sovjet MKII": {
    text: "Heavily-tweaked vintage Soviet lenses with extreme character, flare and distortion."
  },
  "IronGlass Sovjet Medium Format": {
    text: "Large-format Soviet glass with vintage character and medium-format coverage."
  }
};

/*
  Modes die in jouw map bestaan:
  - noflare
  - flare
  - doubleflare
  - bokeh

  We pakken bewust ook _c.jpg eerst, want die zijn exposure corrected.
*/
const SCENES = [
  { scene: "portrait", suffix: "noflare" },
  { scene: "portrait", suffix: "flare" },
  { scene: "portrait", suffix: "doubleflare" },
  { scene: "bokeh", suffix: "bokeh" }
];

/* ============================
   DOM
   ============================ */

const startScreen = document.getElementById("startScreen");
const quizScreen = document.getElementById("quizScreen");
const resultScreen = document.getElementById("resultScreen");

const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");

const roundTitle = document.getElementById("roundTitle");
const liveScore = document.getElementById("liveScore");

const quizImage = document.getElementById("quizImage");
const imageLoader = document.getElementById("imageLoader");

const lensSelect = document.getElementById("lensSelect");
const focalSelect = document.getElementById("focalSelect");
const tstopSelect = document.getElementById("tstopSelect");

const focalField = document.getElementById("focalField");
const tstopField = document.getElementById("tstopField");

const checkButton = document.getElementById("checkButton");
const nextButton = document.getElementById("nextButton");
const feedbackBox = document.getElementById("feedbackBox");

const resultTitle = document.getElementById("resultTitle");
const resultText = document.getElementById("resultText");
const breakdownBox = document.getElementById("breakdownBox");

/* ============================
   State
   ============================ */

let difficulty = "easy";
let questions = [];
let currentIndex = 0;
let score = 0;
let maxScore = 10;
let history = [];
let locked = false;

/* ============================
   Helpers
   ============================ */

function slugFromLabel(label = "") {
  return String(label).toLowerCase().replace(/\s+/g, "_");
}

function aliasFor(lensSlug, nominalFocal) {
  return notes[`${lensSlug}_${nominalFocal}`] || nominalFocal;
}

function fileTStop(t) {
  return String(t).replace(/\./g, "_");
}

function cleanFocalLabel(focal) {
  return String(focal || "").replace(/_m(35|50)$/i, "");
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function unique(arr) {
  return [...new Set(arr)];
}

function imageExists(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function getDifficulty() {
  return document.querySelector("input[name='difficulty']:checked")?.value || "easy";
}

function pointsPerQuestion() {
  if (difficulty === "easy") return 1;
  if (difficulty === "medium") return 2;
  return 3;
}

function getAllTStopsForDropdown() {
  const all = [];

  for (const slug of Object.keys(MEASURED_TSTOPS)) {
    for (const focal of Object.keys(MEASURED_TSTOPS[slug])) {
      all.push(...MEASURED_TSTOPS[slug][focal]);
    }
  }

  return unique(all)
    .map(String)
    .sort((a, b) => parseFloat(a) - parseFloat(b));
}

function getEffectiveFocals(lensSlug, uiFocal) {
  const alt = ALT_FOCAL_OPTIONS?.[lensSlug]?.[uiFocal];

  if (alt && alt.length) {
    return alt;
  }

  return [aliasFor(lensSlug, uiFocal)];
}

function getStopsFor(lensSlug, fileFocal) {
  return MEASURED_TSTOPS?.[lensSlug]?.[fileFocal] || [];
}

function buildImageUrlCandidates({ lensSlug, fileFocal, tStop, suffix }) {
  const t = fileTStop(tStop);
  const base = `${lensSlug}_${fileFocal}_t${t}`;

  if (suffix === "bokeh") {
    return [
      `${IMG_BASE}${base}_bokeh_c.jpg`,
      `${IMG_BASE}${base}_bokeh.jpg`
    ];
  }

  return [
    `${IMG_BASE}${base}_${suffix}_c.jpg`,
    `${IMG_BASE}${base}_${suffix}.jpg`
  ];
}

async function firstExistingImage(candidates) {
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await imageExists(url);
    if (ok) return url;
  }

  return null;
}

/* ============================
   Build quiz image pool
   ============================ */

async function buildQuizPool() {
  const pool = [];

  for (const lensLabel of ENABLED_LENSES) {
    const lensSlug = slugFromLabel(lensLabel);

    for (const uiFocal of UI_FOCALS) {
      const fileFocals = getEffectiveFocals(lensSlug, uiFocal);

      for (const fileFocal of fileFocals) {
        const stops = getStopsFor(lensSlug, fileFocal);

        if (!stops.length) continue;

        for (const tStop of stops) {
          for (const scene of SCENES) {
            const candidates = buildImageUrlCandidates({
              lensSlug,
              fileFocal,
              tStop,
              suffix: scene.suffix
            });

            // Check of hij bestaat.
            // Dit is iets trager bij start, maar voorkomt kapotte quizvragen.
            // eslint-disable-next-line no-await-in-loop
            const url = await firstExistingImage(candidates);

            if (!url) continue;

            pool.push({
              lens: lensLabel,
              slug: lensSlug,
              uiFocal,
              fileFocal,
              displayFocal: cleanFocalLabel(uiFocal),
              actualFocal: cleanFocalLabel(fileFocal),
              tStop: String(tStop),
              scene: scene.scene,
              suffix: scene.suffix,
              url
            });
          }
        }
      }
    }
  }

  return pool;
}

/* ============================
   UI setup
   ============================ */

function fillSelect(select, values, formatter = v => v) {
  select.innerHTML = "";

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    select.appendChild(option);
  });
}

function setupDropdowns() {
  fillSelect(lensSelect, LENSES.filter(l => ENABLED_LENSES.includes(l)));

  fillSelect(focalSelect, UI_FOCALS);

  fillSelect(tstopSelect, getAllTStopsForDropdown(), value => `T${value}`);
}

function applyDifficultyUI() {
  focalField.classList.toggle("hidden", difficulty === "easy");
  tstopField.classList.toggle("hidden", difficulty !== "hard");
}

/* ============================
   Quiz flow
   ============================ */

async function startQuiz() {
  difficulty = getDifficulty();
  currentIndex = 0;
  score = 0;
  history = [];
  locked = false;

  maxScore = QUIZ_LENGTH * pointsPerQuestion();

  startButton.disabled = true;
  startButton.textContent = "Quiz laden...";

  const pool = await buildQuizPool();

  if (pool.length < QUIZ_LENGTH) {
    alert(`Niet genoeg werkende beelden gevonden. Gevonden: ${pool.length}`);
    startButton.disabled = false;
    startButton.textContent = "Start quiz";
    return;
  }

  questions = shuffle(pool).slice(0, QUIZ_LENGTH);

  setupDropdowns();
  applyDifficultyUI();

  liveScore.textContent = String(score);

  startScreen.classList.add("hidden");
  resultScreen.classList.add("hidden");
  quizScreen.classList.remove("hidden");

  startButton.disabled = false;
  startButton.textContent = "Start quiz";

  showQuestion();
}

function showQuestion() {
  locked = false;

  const q = questions[currentIndex];

  roundTitle.textContent = `Ronde ${currentIndex + 1} / ${QUIZ_LENGTH}`;

  feedbackBox.classList.add("hidden");
  feedbackBox.innerHTML = "";

  checkButton.classList.remove("hidden");
  nextButton.classList.add("hidden");

  imageLoader.classList.remove("hidden");
  quizImage.style.opacity = "0";

  quizImage.onload = () => {
    imageLoader.classList.add("hidden");
    quizImage.style.opacity = "1";
  };

  quizImage.onerror = () => {
    imageLoader.textContent = "Foto kon niet laden. Klik volgende.";
    checkButton.classList.add("hidden");
    nextButton.classList.remove("hidden");
  };

  quizImage.src = q.url;

  randomizeGuesses();
}

function randomizeGuesses() {
  const enabled = LENSES.filter(l => ENABLED_LENSES.includes(l));

  lensSelect.value = pickRandom(enabled);
  focalSelect.value = pickRandom(UI_FOCALS);

  const stops = getAllTStopsForDropdown();
  tstopSelect.value = pickRandom(stops);
}

function checkAnswer() {
  if (locked) return;
  locked = true;

  const q = questions[currentIndex];

  const guessedLens = lensSelect.value;
  const guessedFocal = focalSelect.value;
  const guessedTStop = tstopSelect.value;

  const lensGood = guessedLens === q.lens;
  const focalGood = guessedFocal === q.uiFocal;
  const tstopGood = guessedTStop === q.tStop;

  let roundScore = 0;

  if (difficulty === "easy") {
    if (lensGood) roundScore += 1;
  }

  if (difficulty === "medium") {
    if (lensGood) roundScore += 1;
    if (focalGood) roundScore += 1;
  }

  if (difficulty === "hard") {
    if (lensGood) roundScore += 1;
    if (focalGood) roundScore += 1;
    if (tstopGood) roundScore += 1;
  }

  score += roundScore;
  liveScore.textContent = String(score);

  history.push({
    question: q,
    guessedLens,
    guessedFocal,
    guessedTStop,
    lensGood,
    focalGood,
    tstopGood,
    roundScore
  });

  renderFeedback({
    q,
    guessedLens,
    guessedFocal,
    guessedTStop,
    lensGood,
    focalGood,
    tstopGood,
    roundScore
  });

  checkButton.classList.add("hidden");
  nextButton.classList.remove("hidden");
}

function renderFeedback(data) {
  const { q, guessedLens, guessedFocal, guessedTStop, lensGood, focalGood, tstopGood, roundScore } = data;

  const possible = pointsPerQuestion();

  const focalLine = difficulty !== "easy"
    ? `
      <div class="feedback-line">
        <strong>Focal</strong>
        <span class="${focalGood ? "good" : "bad"}">
          ${focalGood ? "Goed" : `Fout — jij koos ${guessedFocal}`}
        </span>
      </div>
    `
    : "";

  const tstopLine = difficulty === "hard"
    ? `
      <div class="feedback-line">
        <strong>T-stop</strong>
        <span class="${tstopGood ? "good" : "bad"}">
          ${tstopGood ? "Goed" : `Fout — jij koos T${guessedTStop}`}
        </span>
      </div>
    `
    : "";

  const actualFocalText = q.actualFocal !== q.uiFocal
    ? `<br><small>Werkelijke/file focal: ${q.actualFocal}</small>`
    : "";

  feedbackBox.innerHTML = `
    <h3>${roundScore} / ${possible} punten</h3>

    <div class="feedback-line">
      <strong>Lens</strong>
      <span class="${lensGood ? "good" : "bad"}">
        ${lensGood ? "Goed" : `Fout — jij koos ${guessedLens}`}
      </span>
    </div>

    ${focalLine}
    ${tstopLine}

    <div class="correct-answer">
      <strong>Correct antwoord:</strong><br>
      ${q.lens} — ${q.uiFocal} — T${q.tStop}
      ${actualFocalText}
      <br><br>
      <small>${lensDescriptions[q.lens]?.text || ""}</small>
    </div>
  `;

  feedbackBox.classList.remove("hidden");
}

function nextQuestion() {
  currentIndex++;

  if (currentIndex >= QUIZ_LENGTH) {
    showResults();
    return;
  }

  showQuestion();
}

function showResults() {
  quizScreen.classList.add("hidden");
  resultScreen.classList.remove("hidden");

  const pct = Math.round((score / maxScore) * 100);

  resultTitle.textContent = `${score} / ${maxScore} punten`;
  resultText.textContent = `Je had ${pct}% goed in ${difficulty.toUpperCase()} mode.`;

  const lensHits = history.filter(h => h.lensGood).length;
  const focalHits = history.filter(h => h.focalGood).length;
  const tstopHits = history.filter(h => h.tstopGood).length;

  let rows = `
    <div class="breakdown-row">
      <span>Lens goed</span>
      <strong>${lensHits} / ${QUIZ_LENGTH}</strong>
    </div>
  `;

  if (difficulty !== "easy") {
    rows += `
      <div class="breakdown-row">
        <span>Focal length goed</span>
        <strong>${focalHits} / ${QUIZ_LENGTH}</strong>
      </div>
    `;
  }

  if (difficulty === "hard") {
    rows += `
      <div class="breakdown-row">
        <span>T-stop goed</span>
        <strong>${tstopHits} / ${QUIZ_LENGTH}</strong>
      </div>
    `;
  }

  breakdownBox.innerHTML = rows;
}

function restartQuiz() {
  resultScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");
}

/* ============================
   Events
   ============================ */

startButton.addEventListener("click", startQuiz);
restartButton.addEventListener("click", restartQuiz);
checkButton.addEventListener("click", checkAnswer);
nextButton.addEventListener("click", nextQuestion);

/* ============================
   Initial
   ============================ */

setupDropdowns();
