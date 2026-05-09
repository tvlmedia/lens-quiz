/* ============================
   TVL / IronGlass Lens Quiz
   - Loads real image files from GitHub
   - 10 rounds
   - Spreads lenses as evenly as possible
   - No exact same image twice in one game
   - Dropdowns start with placeholders
   - Lens -> only existing focals
   - Lens + focal -> only existing T-stops
   - Uses REAL focal lengths from filenames
   - If a user gets something wrong, they must write a memory note
   - End screen shows all mistakes + notes + images
   - Click result image = lightbox
   - Export mistakes PDF
   ============================ */

const GITHUB_API_IMAGES =
  "https://api.github.com/repos/tvlmedia/IronGlass/contents/images?ref=main";

const QUIZ_LENGTH = 10;

const ENABLED_LENSES = [
  "IronGlass Red P",
  "IronGlass Sovjet MKII",
  "IronGlass Zeiss Jena",
  "IronGlass Sovjet Medium Format",
  "IronGlass Titan Zoom"
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

const UI_FOCALS = [
  "20mm",
  "28mm",
  "29mm",
  "30mm",
  "35mm",
  "37mm",
  "45mm",
  "50mm",
  "58mm",
  "65mm",
  "80mm",
  "85mm",
  "90mm",
  "120mm",
  "135mm"
];

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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

function isRoundMistake(roundScore) {
  return roundScore < pointsPerQuestion();
}

function getMistakes() {
  return history.filter(h => isRoundMistake(h.roundScore));
}

function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tstopFromFilePart(part) {
  return String(part).replace(/_/g, ".");
}

function cleanFocalLabel(focal) {
  return String(focal || "").replace(/_m(35|50)$/i, "");
}

function uiFocalFromFileFocal(slug, fileFocal) {
  return cleanFocalLabel(fileFocal);
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

function parseQuizImage(file) {
  const name = file.name || "";
  const url = file.download_url || "";

  if (!name.toLowerCase().endsWith(".jpg")) return null;
  if (!name.startsWith("ironglass_")) return null;

  const match = name.match(
    /^(.+?)_(\d+mm(?:_m\d+)?)_t([\d_]+)_(noflare|flare|doubleflare|bokeh)(?:_c)?\.jpg$/i
  );

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
   Lightbox
   ============================ */

function openImageLightbox(url, title = "") {
  let lightbox = document.getElementById("imageLightbox");

  if (!lightbox) {
    lightbox = document.createElement("div");
    lightbox.id = "imageLightbox";
    lightbox.className = "image-lightbox";
    lightbox.innerHTML = `
      <button class="image-lightbox-close" type="button">×</button>
      <div class="image-lightbox-inner">
        <img id="imageLightboxImg" alt="">
        <div id="imageLightboxTitle" class="image-lightbox-title"></div>
      </div>
    `;
    document.body.appendChild(lightbox);

    lightbox.addEventListener("click", (e) => {
      if (
        e.target === lightbox ||
        e.target.classList.contains("image-lightbox-close")
      ) {
        lightbox.classList.remove("active");
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        lightbox.classList.remove("active");
      }
    });
  }

  const img = document.getElementById("imageLightboxImg");
  const titleEl = document.getElementById("imageLightboxTitle");

  img.src = url;
  img.alt = title;
  titleEl.textContent = title;

  lightbox.classList.add("active");
}

/* ============================
   PDF export
   ============================ */

function loadImageForPdf(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = reject;

    img.src = url;
  });
}

function fitContain(sw, sh, bw, bh) {
  const s = Math.min(bw / sw, bh / sh);

  return {
    w: sw * s,
    h: sh * s,
    x: (bw - sw * s) / 2,
    y: (bh - sh * s) / 2
  };
}

async function exportMistakesPdf() {
  const mistakes = getMistakes();

  if (!mistakes.length) {
    alert("No mistakes to export.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF is not loaded.");
    return;
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4"
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const margin = 32;
  const accent = [255, 106, 0];

  function drawHeader(title, subtitle = "") {
    pdf.setFillColor(0, 0, 0);
    pdf.rect(0, 0, pageW, pageH, "F");

    pdf.setTextColor(...accent);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("TVL RENTAL / IRONGLASS LENS QUIZ", margin, 34);

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(28);
    pdf.text(title, margin, 70);

    if (subtitle) {
      pdf.setTextColor(170, 170, 170);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text(subtitle, margin, 94);
    }
  }

  drawHeader(
    "Mistakes & Memory Notes",
    `Score: ${score} / ${maxScore} points - ${difficulty.toUpperCase()} mode`
  );

  pdf.setTextColor(220, 220, 220);
  pdf.setFontSize(12);

  let y = 130;

  pdf.text(`Total mistakes: ${mistakes.length}`, margin, y);
  y += 28;

  mistakes.forEach((item, index) => {
    const q = item.question;

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${index + 1}. ${q.lens} - ${q.uiFocal} - T${q.tStop}`, margin, y);

    pdf.setTextColor(...accent);
    pdf.setFontSize(11);
    pdf.text(q.scene || "", pageW - margin - 110, y);

    y += 20;

    pdf.setTextColor(170, 170, 170);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    const note = item.note || "No note written";
    const lines = pdf.splitTextToSize(`Note: ${note}`, pageW - margin * 2 - 20);

    pdf.text(lines, margin + 12, y);
    y += Math.min(lines.length * 12, 48) + 18;

    if (y > pageH - 80 && index < mistakes.length - 1) {
      pdf.addPage();
      drawHeader("Mistakes & Memory Notes");
      y = 120;
    }
  });

  for (let i = 0; i < mistakes.length; i++) {
    const item = mistakes[i];
    const q = item.question;

    pdf.addPage();
    drawHeader(
      `Mistake ${i + 1}`,
      `${q.lens} - ${q.uiFocal} - T${q.tStop} - ${q.scene || ""}`
    );

    const imageBox = {
      x: margin,
      y: 120,
      w: 360,
      h: 270
    };

    try {
      const img = await loadImageForPdf(q.url);
      const fit = fitContain(img.naturalWidth, img.naturalHeight, imageBox.w, imageBox.h);

      pdf.addImage(
        img,
        "JPEG",
        imageBox.x + fit.x,
        imageBox.y + fit.y,
        fit.w,
        fit.h
      );
    } catch (e) {
      pdf.setTextColor(255, 80, 80);
      pdf.text("Image could not be loaded.", imageBox.x, imageBox.y + 20);
    }

    const textX = imageBox.x + imageBox.w + 32;
    let textY = imageBox.y + 10;

    const guessedParts = [
      item.guessedLens || "No lens",
      item.guessedFocal || "No focal",
      item.guessedTStop ? `T${item.guessedTStop}` : "No T-stop"
    ];

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(255, 255, 255);
    pdf.text("Correct:", textX, textY);
    textY += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(180, 180, 180);
    pdf.text(`${q.lens} - ${q.uiFocal} - T${q.tStop}`, textX, textY);
    textY += 34;

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text("Your guess:", textX, textY);
    textY += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(180, 180, 180);
    pdf.text(guessedParts.join(" - "), textX, textY);
    textY += 34;

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text("Your memory note:", textX, textY);
    textY += 18;

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(180, 180, 180);

    const noteLines = pdf.splitTextToSize(
      item.note || "No note written",
      pageW - textX - margin
    );

    pdf.text(noteLines, textX, textY);
  }

  const fileName = `IronGlass_Lens_Quiz_Mistakes_${difficulty}_${score}_of_${maxScore}.pdf`;
  pdf.save(fileName);
}

/* ============================
   GitHub image loading
   ============================ */

async function loadImagePoolFromGitHub() {
  startButton.textContent = "Loading files...";

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

  console.log("Parsed quiz images:", parsed.length);
  console.log("After _c preference:", cleaned.length);
  console.log(cleaned);

  return cleaned;
}

async function buildQuizQuestions() {
  imagePool = await loadImagePoolFromGitHub();

  if (!imagePool.length) {
    console.warn("No quiz images found. Check filenames/regex.");
    return [];
  }

  const byLens = new Map();

  for (const item of shuffle(imagePool)) {
    if (!byLens.has(item.lens)) {
      byLens.set(item.lens, []);
    }

    byLens.get(item.lens).push(item);
  }

  const availableLensNames = ENABLED_LENSES.filter(lens =>
    byLens.has(lens) && byLens.get(lens).length
  );

  const picked = [];
  const usedImageNames = new Set();

  let lensCycle = shuffle(availableLensNames);

  while (picked.length < QUIZ_LENGTH && availableLensNames.length) {
    if (!lensCycle.length) {
      lensCycle = shuffle(availableLensNames);
    }

    const lens = lensCycle.shift();
    const options = byLens.get(lens).filter(item => !usedImageNames.has(item.name));

    if (!options.length) {
      const index = availableLensNames.indexOf(lens);
      if (index !== -1) availableLensNames.splice(index, 1);
      continue;
    }

    const choice = pickRandom(options);
    usedImageNames.add(choice.name);
    picked.push(choice);
  }

  console.log("Picked questions:", picked);

  return picked;
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
    alert("Please choose a lens first.");
    return false;
  }

  if (difficulty !== "easy" && !focalSelect.value) {
    alert("Please choose a focal length first.");
    return false;
  }

  if (difficulty === "hard" && !tstopSelect.value) {
    alert("Please choose a T-stop first.");
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
  startButton.textContent = "Loading quiz...";

  try {
    questions = await buildQuizQuestions();
  } catch (err) {
    console.error(err);
    alert("The quiz could not load the GitHub images. Check the console.");
    startButton.disabled = false;
    startButton.textContent = "Start quiz";
    return;
  }

  if (questions.length < QUIZ_LENGTH) {
    alert(`Not enough images found. Found: ${questions.length}. Check if your image filenames match the parser.`);
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

  roundTitle.textContent = `Round ${currentIndex + 1} / ${QUIZ_LENGTH}`;

  feedbackBox.classList.add("hidden");
  feedbackBox.innerHTML = "";

  checkButton.classList.remove("hidden");
  nextButton.classList.add("hidden");
  nextButton.disabled = false;
  nextButton.classList.remove("disabled");

  imageLoader.textContent = "Loading image...";
  imageLoader.classList.remove("hidden");

  quizImage.style.opacity = "0";
  quizImage.removeAttribute("src");

  quizImage.onload = () => {
    imageLoader.classList.add("hidden");
    quizImage.style.opacity = "1";
  };

  quizImage.onerror = () => {
    console.error("Image could not load:", q.url, q);
    imageLoader.textContent = "Image could not load. Click next.";
    checkButton.classList.add("hidden");
    nextButton.classList.remove("hidden");
    nextButton.disabled = false;
    nextButton.classList.remove("disabled");
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

  const resultEntry = {
    question: q,
    guessedLens,
    guessedFocal,
    guessedTStop,
    lensGood,
    focalGood,
    tstopGood,
    roundScore,
    note: ""
  };

  history.push(resultEntry);

  renderFeedback({
    q,
    guessedLens,
    guessedFocal,
    guessedTStop,
    lensGood,
    focalGood,
    tstopGood,
    roundScore,
    historyEntry: resultEntry
  });

  checkButton.classList.add("hidden");
  nextButton.classList.remove("hidden");

  if (isRoundMistake(roundScore)) {
    nextButton.disabled = true;
    nextButton.classList.add("disabled");
  } else {
    nextButton.disabled = false;
    nextButton.classList.remove("disabled");
  }
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
    roundScore,
    historyEntry
  } = data;

  const possible = pointsPerQuestion();
  const mistake = isRoundMistake(roundScore);

  const focalLine = difficulty !== "easy"
    ? `
      <div class="feedback-line">
        <strong>Focal</strong>
        <span class="${focalGood ? "good" : "bad"}">
          ${focalGood ? "Correct" : `Wrong — you chose ${escapeHTML(guessedFocal)}`}
        </span>
      </div>
    `
    : "";

  const tstopLine = difficulty === "hard"
    ? `
      <div class="feedback-line">
        <strong>T-stop</strong>
        <span class="${tstopGood ? "good" : "bad"}">
          ${tstopGood ? "Correct" : `Wrong — you chose T${escapeHTML(guessedTStop)}`}
        </span>
      </div>
    `
    : "";

  const sceneText = q.scene
    ? `<br><small>Scene: ${escapeHTML(q.scene)}</small>`
    : "";

  const noteBox = mistake
    ? `
      <div class="mistake-note-box">
        <label>
          <span>Memory note required</span>
          <textarea
            id="mistakeNoteInput"
            rows="4"
            placeholder="What could help you recognize this next time? Example: softer contrast, wild flare, smoother faces, larger format feel..."
          ></textarea>
        </label>
        <small id="noteRequirementText" class="note-warning">
          Write a short note before going to the next image.
        </small>
      </div>
    `
    : "";

  feedbackBox.innerHTML = `
    <h3>${roundScore} / ${possible} points</h3>

    <div class="feedback-line">
      <strong>Lens</strong>
      <span class="${lensGood ? "good" : "bad"}">
        ${lensGood ? "Correct" : `Wrong — you chose ${escapeHTML(guessedLens)}`}
      </span>
    </div>

    ${focalLine}
    ${tstopLine}

    <div class="correct-answer">
      <strong>Correct answer:</strong><br>
      ${escapeHTML(q.lens)} — ${escapeHTML(q.uiFocal)} — T${escapeHTML(q.tStop)}
      ${sceneText}
      <br><br>
      <small>${escapeHTML(lensDescriptions[q.lens]?.text || "")}</small>
    </div>

    ${noteBox}
  `;

  feedbackBox.classList.remove("hidden");

  if (mistake) {
    const noteInput = document.getElementById("mistakeNoteInput");
    const noteRequirementText = document.getElementById("noteRequirementText");

    noteInput.addEventListener("input", () => {
      const value = noteInput.value.trim();
      historyEntry.note = value;

      const valid = value.length >= 3;

      nextButton.disabled = !valid;
      nextButton.classList.toggle("disabled", !valid);

      if (valid) {
        noteRequirementText.textContent = "Saved. You can continue.";
        noteRequirementText.classList.add("good-note");
      } else {
        noteRequirementText.textContent = "Write a short note before going to the next image.";
        noteRequirementText.classList.remove("good-note");
      }
    });
  }
}

function nextQuestion() {
  if (nextButton.disabled) return;

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

  resultTitle.textContent = `${score} / ${maxScore} points`;
  resultText.textContent = `You scored ${pct}% in ${difficulty.toUpperCase()} mode.`;

  const lensHits = history.filter(h => h.lensGood).length;
  const focalHits = history.filter(h => h.focalGood).length;
  const tstopHits = history.filter(h => h.tstopGood).length;

  const mistakes = getMistakes();

  let rows = `
    <div class="breakdown-row">
      <span>Lens correct</span>
      <strong>${lensHits} / ${QUIZ_LENGTH}</strong>
    </div>
  `;

  if (difficulty !== "easy") {
    rows += `
      <div class="breakdown-row">
        <span>Focal length correct</span>
        <strong>${focalHits} / ${QUIZ_LENGTH}</strong>
      </div>
    `;
  }

  if (difficulty === "hard") {
    rows += `
      <div class="breakdown-row">
        <span>T-stop correct</span>
        <strong>${tstopHits} / ${QUIZ_LENGTH}</strong>
      </div>
    `;
  }

  if (mistakes.length) {
    rows += `
      <div class="mistakes-summary">
        <div class="mistakes-summary-top">
          <h2>Your mistakes & memory notes</h2>
          <button id="exportPdfButton" class="secondary-button" type="button">
            Export mistakes PDF
          </button>
        </div>

        ${mistakes.map((item, index) => {
          const q = item.question;

          const guessedParts = [
            item.guessedLens || "No lens",
            item.guessedFocal || "No focal",
            item.guessedTStop ? `T${item.guessedTStop}` : "No T-stop"
          ];

          return `
            <div class="mistake-card mistake-card-with-image">
              <button
                class="mistake-image-wrap mistake-image-button"
                type="button"
                data-img="${escapeHTML(q.url)}"
                data-title="${escapeHTML(`${q.lens} - ${q.uiFocal} - T${q.tStop}`)}"
              >
                <img
                  src="${escapeHTML(q.url)}"
                  alt="${escapeHTML(q.lens)} ${escapeHTML(q.uiFocal)} T${escapeHTML(q.tStop)}"
                  loading="lazy"
                >
              </button>

              <div class="mistake-content">
                <div class="mistake-card-top">
                  <strong>Mistake ${index + 1}</strong>
                  <span>${escapeHTML(q.scene || "")}</span>
                </div>

                <p>
                  <strong>Correct:</strong><br>
                  ${escapeHTML(q.lens)} — ${escapeHTML(q.uiFocal)} — T${escapeHTML(q.tStop)}
                </p>

                <p>
                  <strong>Your guess:</strong><br>
                  ${escapeHTML(guessedParts.join(" — "))}
                </p>

                <p>
                  <strong>Your memory note:</strong><br>
                  ${escapeHTML(item.note || "No note written")}
                </p>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  } else {
    rows += `
      <div class="mistakes-summary">
        <h2>No mistakes</h2>
        <p class="perfect-score">Clean run. No memory notes needed.</p>
      </div>
    `;
  }

  breakdownBox.innerHTML = rows;

  const exportButton = document.getElementById("exportPdfButton");
  if (exportButton) {
    exportButton.addEventListener("click", exportMistakesPdf);
  }

  document.querySelectorAll(".mistake-image-button").forEach(button => {
    button.addEventListener("click", () => {
      openImageLightbox(
        button.dataset.img,
        button.dataset.title
      );
    });
  });
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
