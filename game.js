// ===== Settings (edit these) =====
const GAME_NAME = "AniGuess";
const SITE_URL = "https://example.com"; // placeholder: replace with your real site link
const LAUNCH_DATE = "2026-10-15";       // puzzle #1 is on this date (UTC)
const SHUFFLE_SEED = 12345;             // change to get a different daily order

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

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds a fixed, shuffled order where two characters from the same anime
// are never back to back (as long as the data makes that possible).
function buildDailyOrder(characters) {
  const rand = seededRandom(SHUFFLE_SEED);
  const groups = {};
  for (const c of characters) {
    (groups[c.anime] = groups[c.anime] || []).push(c);
  }
  const pools = shuffle(Object.keys(groups).sort(), rand).map(anime => ({
    anime,
    items: shuffle(groups[anime], rand),
  }));

  const order = [];
  let lastAnime = null;
  while (order.length < characters.length) {
    let options = pools.filter(p => p.items.length > 0 && p.anime !== lastAnime);
    if (options.length === 0) options = pools.filter(p => p.items.length > 0);
    // Prefer the anime with the most characters left, so we don't get stuck at the end.
    const most = Math.max(...options.map(p => p.items.length));
    const best = options.filter(p => p.items.length === most);
    const pick = best[Math.floor(rand() * best.length)];
    order.push(pick.items.pop());
    lastAnime = pick.anime;
  }
  return order;
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

  const order = buildDailyOrder(characters);
  const index = todayIndex();
  answer = order[index % order.length];
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
}

function renderGame() {
  $("game").classList.remove("hidden");
  const wrong = state.guesses.length;

  const left = MAX_GUESSES - wrong;
  $("guesses-left").textContent = left === 1 ? "Final guess!" : `${left} guesses left`;

  const clueList = $("clues");
  const shown = Math.min(wrong + 1, NUM_CLUES);
  // Only add new clues so earlier ones don't re-animate.
  while (clueList.children.length < shown) {
    const i = clueList.children.length;
    const li = document.createElement("li");
    li.className = "clue";
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

init();
