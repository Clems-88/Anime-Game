// ===== Settings (edit these) =====
const GAME_NAME = "AniGuess";
const SITE_URL = "https://clems-88.github.io/Anime-Game/";
const LAUNCH_DATE = "2026-10-21";       // puzzle #1 is on this date (UTC)
const SHUFFLE_SEED = 12345;             // never change after launch: it would change past puzzles

const NUM_CLUES = 4;
const MAX_GUESSES = 5; // 4 clues + 1 final guess with the anime revealed
const STATE_KEY = "aniguess-state";
const STATS_KEY = "aniguess-stats";
const DAY_MS = 24 * 60 * 60 * 1000;

// ===== Storage helpers (localStorage may be blocked) =====
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Ignore: the game still works, it just won't remember progress.
  }
}

// ===== Daily character =====

// Small seeded random number generator, so the order is the same for everyone.
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The day index (0 = launch day) from which a character can be picked.
// Launch characters have no "added" date. Characters with an "added" date
// are only eligible from the day AFTER it, so adding one never changes
// today's puzzle or any earlier one.
function firstEligibleDay(c, launch) {
  if (!c.added) return 0;
  const added = Date.parse(c.added + "T00:00:00Z");
  if (isNaN(added)) {
    console.warn(`Ignoring ${c.name}: "added" should look like "2026-11-02"`);
    return Infinity;
  }
  return Math.max(0, Math.floor((added - launch) / DAY_MS) + 1);
}

// Works out the character for every day from launch up to dayIndex, one day
// at a time. Each day's pick depends only on the characters that were
// eligible on that day and the days before it, so past puzzles never change.
// Rules: every eligible character is used once before any repeats (a
// "cycle"), and two characters from the same anime are never back to back.
function characterForDay(characters, dayIndex) {
  const launch = Date.parse(LAUNCH_DATE + "T00:00:00Z");
  const all = characters
    .map(c => ({ c, from: firstEligibleDay(c, launch) }))
    .sort((a, b) => a.c.name.localeCompare(b.c.name)); // file order doesn't matter

  const used = new Set();
  let prev = null;
  for (let d = 0; d <= dayIndex; d++) {
    const eligible = all.filter(x => x.from <= d).map(x => x.c);
    const differentAnime = list => list.filter(c => !prev || c.anime !== prev.anime);

    let options = differentAnime(eligible.filter(c => !used.has(c.name)));
    if (options.length === 0) {
      // Cycle finished (or only yesterday's anime is left): start a new cycle.
      used.clear();
      options = differentAnime(eligible);
      if (options.length === 0) options = eligible; // only one anime exists
    }

    // Prefer the anime with the most unused characters left, so a cycle
    // doesn't end with several characters from the same show.
    const left = {};
    for (const c of options) left[c.anime] = (left[c.anime] || 0) + 1;
    const most = Math.max(...Object.values(left));
    const best = options.filter(c => left[c.anime] === most);

    const rand = seededRandom(SHUFFLE_SEED * 100003 + d);
    prev = best[Math.floor(rand() * best.length)];
    used.add(prev.name);
  }
  return prev;
}

function todayIndex() {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const launch = Date.parse(LAUNCH_DATE + "T00:00:00Z");
  return Math.max(0, Math.floor((todayUtc - launch) / DAY_MS));
}

// ===== Game state =====
let characters = [];
let answer = null;
let puzzleNumber = 0;
let state = null; // { puzzle, guesses: [names], status: "playing" | "won" | "lost" }
let stats = null; // { played, wins, currentStreak, bestStreak, lastWonPuzzle }

const $ = id => document.getElementById(id);

async function init() {
  try {
    const res = await fetch("characters.json");
    characters = await res.json();
  } catch (e) {
    $("loading").textContent = "Couldn't load characters.json. Are you running a local server? (See README)";
    return;
  }

  const index = todayIndex();
  answer = characterForDay(characters, index);
  puzzleNumber = index + 1;

  stats = load(STATS_KEY, { played: 0, wins: 0, currentStreak: 0, bestStreak: 0, lastWonPuzzle: null });
  // Missed a day (or lost) since the last win? The streak is broken.
  if (stats.lastWonPuzzle === null || stats.lastWonPuzzle < puzzleNumber - 1) {
    stats.currentStreak = 0;
  }

  state = load(STATE_KEY, null);
  if (!state || state.puzzle !== puzzleNumber) {
    state = { puzzle: puzzleNumber, guesses: [], status: "playing" };
    save(STATE_KEY, state);
  }

  $("puzzle-number").textContent = `${GAME_NAME} #${puzzleNumber}`;
  $("loading").classList.add("hidden");
  setupInput();
  render();
}

function makeGuess(name) {
  if (state.status !== "playing") return;
  state.guesses.push(name);

  if (name === answer.name) {
    finish(true);
  } else if (state.guesses.length >= MAX_GUESSES) {
    finish(false);
  }
  save(STATE_KEY, state);
  render();

  // Visual effects only
  if (state.status === "won") celebrateWin();
  else if (state.status === "lost") showLoss();
  else wrongGuessFx();
}

function finish(won) {
  state.status = won ? "won" : "lost";
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak = stats.lastWonPuzzle === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
    stats.lastWonPuzzle = puzzleNumber;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  save(STATS_KEY, stats);
}

// ===== Rendering =====
function render() {
  if (state.status === "playing") {
    renderGame();
  } else {
    $("game").classList.add("hidden");
    renderResult();
  }
  updateMascot();
}

function renderGame() {
  $("game").classList.remove("hidden");
  const wrong = state.guesses.length;

  const left = MAX_GUESSES - wrong;
  $("guesses-left").textContent = left === 1 ? "Final guess!" : `${left} guesses left`;
  $("guesses-left").classList.toggle("final", left === 1);

  const clueList = $("clues");
  const shown = Math.min(wrong + 1, NUM_CLUES);
  // Only add new clues so earlier ones don't re-animate.
  const firstNew = clueList.children.length;
  while (clueList.children.length < shown) {
    const i = clueList.children.length;
    const li = document.createElement("li");
    li.className = "clue";
    li.style.animationDelay = `${(i - firstNew) * 150}ms`; // stagger when several appear at once
    li.innerHTML = `<span class="clue-label">Clue ${i + 1}</span>`;
    li.append(answer.clues[i]);
    clueList.appendChild(li);
  }

  const reveal = $("anime-reveal");
  if (wrong >= NUM_CLUES) {
    reveal.innerHTML = `<span class="clue-label">This character is from</span>`;
    reveal.append(answer.anime);
    reveal.classList.remove("hidden");
  }

  const past = $("past-guesses");
  past.innerHTML = "";
  for (const g of state.guesses.slice().reverse()) {
    const li = document.createElement("li");
    li.textContent = g;
    past.appendChild(li);
  }
}

function shareGrid() {
  const squares = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    const g = state.guesses[i];
    if (g === undefined) squares.push("⬜");
    else squares.push(g === answer.name ? "🟩" : "🟥");
  }
  return squares.join("");
}

function renderResult() {
  $("result").classList.remove("hidden");
  const won = state.status === "won";
  const title = $("result-title");
  title.textContent = won ? "You got it!" : "Not this time";
  title.classList.toggle("lost", !won);
  $("result").classList.toggle("lost", !won);
  $("result-name").textContent = answer.name;
  $("result-anime").textContent = answer.anime;
  $("result-grid").textContent = shareGrid();
  $("result-guesses").textContent = won
    ? `Solved in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}`
    : `Used all ${MAX_GUESSES} guesses`;

  $("stat-played").textContent = stats.played;
  $("stat-winpct").textContent = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  $("stat-streak").textContent = stats.currentStreak;
  $("stat-best").textContent = stats.bestStreak;

  $("share-button").onclick = share;
  startCountdown();
}

// ===== Share =====
async function share() {
  const text = `${GAME_NAME} #${puzzleNumber} ${shareGrid()}\n${SITE_URL}`;
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (e) {
    // Fallback for older browsers / non-https pages.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { copied = document.execCommand("copy"); } catch (e2) { copied = false; }
    ta.remove();
  }
  showToast(copied ? "Copied to clipboard!" : "Couldn't copy, sorry");
}

let toastTimer = null;
function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2000);
}

// ===== Countdown to next UTC midnight =====
let countdownTimer = null;
function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const now = Date.now();
    const next = (Math.floor(now / DAY_MS) + 1) * DAY_MS;
    const diff = next - now;
    if (diff <= 1000) {
      clearInterval(countdownTimer);
      setTimeout(() => location.reload(), 1500);
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    $("countdown").textContent = [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ===== Autocomplete input =====
function setupInput() {
  const input = $("guess-input");
  const list = $("suggestions");
  const button = $("guess-button");
  const allNames = characters.map(c => c.name).sort((a, b) => a.localeCompare(b));
  let matches = [];
  let active = -1;

  const exactName = () => allNames.find(n => n.toLowerCase() === input.value.trim().toLowerCase());

  function updateButton() {
    const name = exactName();
    button.disabled = !name || state.guesses.includes(name);
  }

  function showList() {
    const q = input.value.trim().toLowerCase();
    active = -1;
    list.innerHTML = "";
    if (!q) {
      list.classList.add("hidden");
      return;
    }
    matches = allNames.filter(n => n.toLowerCase().includes(q) && !state.guesses.includes(n));
    if (matches.length === 0) {
      list.classList.add("hidden");
      return;
    }
    matches.forEach((name, i) => {
      const li = document.createElement("li");
      li.textContent = name;
      li.setAttribute("role", "option");
      // mousedown fires before the input loses focus
      li.addEventListener("mousedown", e => {
        e.preventDefault();
        choose(i);
      });
      list.appendChild(li);
    });
    list.classList.remove("hidden");
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.classList.toggle("active", i === active));
    if (active >= 0) list.children[active].scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    input.value = matches[i];
    list.classList.add("hidden");
    updateButton();
    input.focus();
  }

  input.addEventListener("input", () => {
    showList();
    updateButton();
  });

  input.addEventListener("keydown", e => {
    const open = !list.classList.contains("hidden");
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
      highlight();
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      highlight();
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      list.classList.add("hidden");
    }
  });

  input.addEventListener("blur", () => list.classList.add("hidden"));

  $("guess-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = exactName();
    if (!name || state.guesses.includes(name)) return;
    input.value = "";
    list.classList.add("hidden");
    button.disabled = true;
    makeGuess(name);
  });
}

// ===== Visual effects (no game logic below this line) =====
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BUBBLE_LINES = {
  curious: "Who could it be…?",
  nervous: ["Eep! Not them!", "Hmm… not quite!", "So close… maybe?", "Don't give up!"],
  final: "Last chance! You've got this!",
  happy: "SUGOI! You got it!",
  sad: "Aww… see you tomorrow!",
};

function updateMascot() {
  const wrong = state.guesses.length;
  let mood, line;
  if (state.status === "won") { mood = "happy"; line = BUBBLE_LINES.happy; }
  else if (state.status === "lost") { mood = "sad"; line = BUBBLE_LINES.sad; }
  else if (wrong === 0) { mood = "curious"; line = BUBBLE_LINES.curious; }
  else {
    mood = "nervous";
    line = wrong >= NUM_CLUES ? BUBBLE_LINES.final : BUBBLE_LINES.nervous[(wrong - 1) % BUBBLE_LINES.nervous.length];
  }
  $("mascot").setAttribute("data-mood", mood);
  const bubble = $("bubble");
  if (bubble.textContent !== line) {
    bubble.textContent = line;
    restartClass(bubble, "pop");
  }
}

// Re-trigger a CSS animation class.
function restartClass(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function wrongGuessFx() {
  restartClass($("game"), "shake");
  restartClass($("flash"), "on");
  restartClass($("mascot"), "jitter");
  if (navigator.vibrate && !reduceMotion) navigator.vibrate(120);
}

let bannerTimer = null;
function showBanner(text, cls, ms) {
  const banner = $("banner");
  $("banner-text").textContent = text;
  banner.className = "banner " + cls;
  const hide = () => banner.classList.add("hidden");
  banner.onclick = hide;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hide, ms);
}

function celebrateWin() {
  showBanner("SUGOI!", "win", 2300);
  confetti();
}

function showLoss() {
  restartClass($("flash"), "on");
  showBanner("Not this time…", "lose", 2500);
}

function confetti() {
  if (reduceMotion) return;
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  const colors = ["#ff2e88", "#00e5ff", "#ffe14d", "#ffffff", "#2bff88"];
  const parts = [];
  for (let i = 0; i < 160; i++) {
    const fromLeft = i % 2 === 0;
    parts.push({
      x: fromLeft ? -10 : W + 10,
      y: H * 0.65,
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9),
      vy: -(9 + Math.random() * 11),
      size: 6 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
    });
  }
  const start = performance.now();
  function frame(t) {
    const elapsed = t - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 3200);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < 3200) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

// Slowly drifting sakura petals in the background (drawn, no images).
function startPetals() {
  if (reduceMotion) return;
  const canvas = $("petals");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W, H;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const petals = Array.from({ length: 18 }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    s: 5 + Math.random() * 7,
    vy: 0.3 + Math.random() * 0.6,
    vx: 0.2 + Math.random() * 0.5,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.02,
    sway: Math.random() * Math.PI * 2,
  }));

  function frame() {
    if (!document.hidden) {
      ctx.clearRect(0, 0, W, H);
      for (const p of petals) {
        p.sway += 0.015;
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.sway) * 0.4;
        p.rot += p.vr;
        if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        if (p.x > W + 20) p.x = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, 0.6 + 0.4 * Math.abs(Math.sin(p.sway)));
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#ff9ecb";
        ctx.beginPath();
        ctx.moveTo(0, -p.s);
        ctx.bezierCurveTo(p.s, -p.s, p.s, p.s * 0.6, 0, p.s);
        ctx.bezierCurveTo(-p.s, p.s * 0.6, -p.s, -p.s, 0, -p.s);
        ctx.fill();
        ctx.restore();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

startPetals();
init();
