/* ============================
   TVL / IronGlass Lens Quiz
   Super simpele versie:
   - Haalt echte image-bestanden uit GitHub map
   - Pakt 10 random JPG's
   - Dropdowns starten leeg/placeholder
   - Lens -> toont alleen bestaande focals
   - Lens + focal -> toont alleen bestaande T-stops
   ============================ */

const GITHUB_API_IMAGES =
  "https://api.github.com/repos/tvlmedia/IronGlass/contents/images?ref=main";

const QUIZ_LENGTH = 10;

const ENABLED_LENSES = [
  "IronGlass Red P",
  "IronGlass Sovjet MKII",
  "IronGlass Zeiss Jena",
  "IronGlass Sovjet Medium Format"
  // "IronGlass Titan Zoom" // geheim, dus uit
];

const LENS_SLUG_TO_LABEL = {
  "ironglass_red_p": "IronGlass Red P",
  "ironglass_sovjet_mkii": "IronGlass Sovjet MKII",
  "ironglass_zeiss_jena": "IronGlass Zeiss Jena",
  "ironglass_sovjet_medium_format": "IronGlass Sovjet Medium Format",
  "ironglass_titan_zoom": "IronGlass Titan Zoom"
};

const LENSES = Object.values(LENS_SLUG_TO_LABEL).filter(l =>
  ENABLED_LENSES.includes(l)
);

const UI_FOCALS = ["20mm", "28mm", "35mm", "50mm", "85mm", "120mm"];

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
  },
  "IronGlass Titan Zoom": {
    text: "Cleaner zoom lens with large sensor coverage."
  }
};

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
let imagePool = [];
let currentIndex = 0;
let score = 0;
let maxScore = 10;
let history = [];
let locked = false;

/* ============================
   Helpers
   ============================ */

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function unique(arr) {
  return [...new Set(arr)];
}

function getDifficulty() {
  return document.querySelector("input[name='difficulty']:checked")?.value || "easy";
}

function pointsPerQuestion() {
  if (difficulty === "easy") return 1;
  if (difficulty === "medium") return 2;
  return 3;
}

function tstopFromFilePart(part) {
  return String(part).replace(/_/g, ".");
}

function cleanFocalLabel(focal) {
  return String(focal || "").replace(/_m(35|50)$/i, "");
}

/*
  File focal naar jouw UI focal.
  Dus Red P 58mm = 50mm in de quiz.
*/
function uiFocalFromFileFocal(slug, fileFocal) {
  const f = String(fileFocal);

  if (slug === "ironglass_red_p") {
    if (f === "37mm") return "35mm";
    if (f === "58mm") return "50mm";
    if (f === "85mm") return "85mm";
  }

  if (slug === "ironglass_sovjet_mkii") {
    if (f === "20mm") return "20mm";
    if (f === "28mm") return "28mm";
    if (f === "37mm") return "35mm";
    if (f === "58mm") return "50mm";
    if (f === "85mm") return "85mm";
    if (f === "135mm") return "120mm";
  }

  if (slug === "ironglass_zeiss_jena") {
    if (f === "20mm") return "20mm";
    if (f === "28mm") return "28mm";
    if (f === "35mm") return "35mm";
    if (f === "50mm") return "50mm";
    if (f === "80mm") return "85mm";
    if (f === "120mm") return "120mm";
  }

  if (slug === "ironglass_sovjet_medium_format") {
    if (f === "30mm") return "28mm";
    if (f === "35mm") return "35mm";
    if (f === "45mm_m35") return "35mm";
    if (f === "45mm_m50") return "50mm";
    if (f === "65mm") return "50mm";
    if (f === "80mm") return "85mm";
    if (f === "90mm") return "85mm";
    if (f === "120mm") return "120mm";
  }

  return cleanFocalLabel(f);
}

function readableScene(suffix) {
  if (suffix === "noflare") return "No flare";
  if (suffix === "flare") return "Flare";
  if (suffix === "doubleflare") return "Double flare";
  if (suffix === "bokeh") return "Bokeh";
  return suffix;
}

function focalSort(a, b) {
  const ai = UI_FOCALS.indexOf(a);
  const bi = UI_FOCALS.indexOf(b);

  if (ai !== -1 && bi !== -1) return ai - bi;
  return parseFloat(a) - parseFloat(b);
}

function tstopSort(a, b) {
  return parseFloat(a) - parseFloat(b);
}

/*
  Parse filenames zoals:
  ironglass_red_p_37mm_t2_9_bokeh.jpg
  ironglass_red_p_37mm_t2_9_bokeh_c.jpg
  ironglass_zeiss_jena_50mm_t2_8_noflare_c.jpg
*/
function parseQuizImage(file) {
  const name = file.name || "";
  const url = file.download_url || "";

  if (!name.toLowerCase().endsWith(".jpg")) return null;
  if (!name.startsWith("ironglass_")) return null;

  const match = name.match(/^(.+?)_(\d+mm(?:_m\d+)?)_t([\d_]+)_(noflare|flare|doubleflare|bokeh)(?:_c)?\.jpg$/i);

  if (!match) return null;

  const slug = match[1].toLowerCase();
  const fileFocal = match[2];
  const tStop = tstopFromFilePart(match[3]);
  const suffix = match[4].toLowerCase();

  const lens = LENS_SLUG_TO_LABEL[slug];

  if (!lens) return null;
  if (!ENABLED_LENSES.includes(lens)) return null;

  return {
    lens,
    slug,
    uiFocal: uiFocalFromFileFocal(slug, fileFocal),
    fileFocal,
    actualFocal: cleanFocalLabel(fileFocal),
    tStop,
    suffix,
    scene: readableScene(suffix),
    url,
    name
  };
}

/*
  Als er zowel normale als _c versie is, kies liever _c.
*/
function preferCorrectedVersions(items) {
  const map = new Map();

  for (const item of items) {
    const baseKey = item.name.replace(/_c\.jpg$/i, ".jpg");
    const existing = map.get(baseKey);

    if (!existing) {
      map.set(baseKey, item);
      continue;
    }

    const itemIsCorrected = /_c\.jpg$/i.test(item.name);
    const existingIsCorrected = /_c\.jpg$/i.test(existing.name);

    if (itemIsCorrected && !existingIsCorrected) {
      map.set(baseKey, item);
    }
  }

  return [...map.values()];
}

/* ============================
   GitHub image loading
   ============================ */

async function loadImagePoolFromGitHub() {
  startButton.textContent = "Bestanden ophalen...";

  const res = await fetch(GITHUB_API_IMAGES, {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const files = await res.json();

  const parsed = files
    .map(parseQuizImage)
    .filter(Boolean);

  const cleaned = preferCorrectedVersions(parsed);

  console.log("Alle parsed quiz images:", parsed.length);
  console.log("Na _c voorkeur:", cleaned.length);
  console.log(cleaned);

  return cleaned;
}

async function buildQuizQuestions() {
  imagePool = await loadImagePoolFromGitHub();

  if (!imagePool.length) {
    console.warn("Geen quiz images gevonden. Check filenames/regex.");
    return [];
  }

  return shuffle(imagePool).slice(0, QUIZ_LENGTH);
}

/* ============================
   Dynamic dropdown logic
   ============================ */

function fillSelectWithPlaceholder(select, placeholder, values, formatter = v => v) {
  if (!select) return;

  select.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  ph.disabled = true;
  ph.selected = true;
  select.appendChild(ph);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    select.appendChild(option);
  });
}

function getAvailableLensesFromPool() {
  return unique(imagePool.map(q => q.lens))
    .filter(l => ENABLED_LENSES.includes(l));
}

function getAvailableFocalsForLens(lens) {
  return unique(
    imagePool
      .filter(q => q.lens === lens)
      .map(q => q.uiFocal)
      .filter(Boolean)
  ).sort(focalSort);
}

function getAvailableTStopsForLensAndFocal(lens, uiFocal) {
  return unique(
    imagePool
      .filter(q => q.lens === lens && q.uiFocal === uiFocal)
      .map(q => q.tStop)
      .filter(Boolean)
  ).sort(tstopSort);
}

function resetGuessDropdowns() {
  const lenses = getAvailableLensesFromPool();

  fillSelectWithPlaceholder(
    lensSelect,
    "Guess your lens",
    lenses.length ? lenses : LENSES
  );

  fillSelectWithPlaceholder(
    focalSelect,
    "Guess focal length",
    []
  );

  fillSelectWithPlaceholder(
    tstopSelect,
    "Guess T-stop",
    [],
    value => `T${value}`
  );

  focalSelect.disabled = true;
  tstopSelect.disabled = true;
}

function updateFocalOptionsAfterLensChoice() {
  const lens = lensSelect.value;

  fillSelectWithPlaceholder(
    focalSelect,
    "Guess focal length",
    []
  );

  fillSelectWithPlaceholder(
    tstopSelect,
    "Guess T-stop",
    [],
    value => `T${value}`
  );

  focalSelect.disabled = true;
  tstopSelect.disabled = true;

  if (!lens) return;

  const focals = getAvailableFocalsForLens(lens);

  fillSelectWithPlaceholder(
    focalSelect,
    "Guess focal length",
    focals
  );

  focalSelect.disabled = false;

  /*
    Bij Easy is focal verborgen, maar we hoeven hem niet te gebruiken.
    Bij Medium/Hard moet user bewust kiezen.
  */
}

function updateTStopOptionsAfterFocalChoice() {
  const lens = lensSelect.value;
  const focal = focalSelect.value;

  fillSelectWithPlaceholder(
    tstopSelect,
    "Guess T-stop",
    [],
    value => `T${value}`
  );

  tstopSelect.disabled = true;

  if (!lens || !focal) return;

  const tstops = getAvailableTStopsForLensAndFocal(lens, focal);

  fillSelectWithPlaceholder(
    tstopSelect,
    "Guess T-stop",
    tstops,
    value => `T${value}`
  );

  tstopSelect.disabled = false;
}

function applyDifficultyUI() {
  focalField.classList.toggle("hidden", difficulty === "easy");
  tstopField.classList.toggle("hidden", difficulty !== "hard");
}

function validateGuessBeforeCheck() {
  if (!lensSelect.value) {
    alert("Kies eerst een lens.");
    return false;
  }

  if (difficulty !== "easy" && !focalSelect.value) {
    alert("Kies eerst een focal length.");
    return false;
  }

  if (difficulty === "hard" && !tstopSelect.value) {
    alert("Kies eerst een T-stop.");
    return false;
  }

  return true;
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

  try {
    questions = await buildQuizQuestions();
  } catch (err) {
    console.error(err);
    alert("Quiz kon de GitHub images niet ophalen. Check console.");
    startButton.disabled = false;
    startButton.textContent = "Start quiz";
    return;
  }

  if (questions.length < QUIZ_LENGTH) {
    alert(`Niet genoeg beelden gevonden. Gevonden: ${questions.length}`);
    startButton.disabled = false;
    startButton.textContent = "Start quiz";
    return;
  }

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

  imageLoader.textContent = "Foto laden...";
  imageLoader.classList.remove("hidden");

  quizImage.style.opacity = "0";
  quizImage.removeAttribute("src");

  quizImage.onload = () => {
    imageLoader.classList.add("hidden");
    quizImage.style.opacity = "1";
  };

  quizImage.onerror = () => {
    console.error("Image kon niet laden:", q.url, q);
    imageLoader.textContent = "Foto kon niet laden. Klik volgende.";
    checkButton.classList.add("hidden");
    nextButton.classList.remove("hidden");
  };

  quizImage.src = q.url;

  resetGuessDropdowns();
}

function checkAnswer() {
  if (locked) return;
  if (!validateGuessBeforeCheck()) return;

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
  const {
    q,
    guessedLens,
    guessedFocal,
    guessedTStop,
    lensGood,
    focalGood,
    tstopGood,
    roundScore
  } = data;

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

  const sceneText = q.scene
    ? `<br><small>Scene: ${q.scene}</small>`
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
      ${sceneText}
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

lensSelect.addEventListener("change", updateFocalOptionsAfterLensChoice);
focalSelect.addEventListener("change", updateTStopOptionsAfterFocalChoice);

/* ============================
   Initial
   ============================ */

resetGuessDropdowns();
