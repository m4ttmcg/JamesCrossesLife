(() => {
  "use strict";

  const STORAGE_KEY = "james-crosses-life.v1";
  const BOARD_COLS = 9;
  const CAMERA_LEAD_ROWS = 5;
  const MAX_LEADERBOARD = 7;
  const REMOTE_LEADERBOARD_LIMIT = 30;
  const PLAYER_NAME_MAX = 20;
  const LEADERBOARD_API_PATH = "/api/leaderboard";

  const DIFFICULTIES = {
    chill: { label: "Chill", targetRows: 22, speedMul: 0.78, density: 0.72, scoreMul: 0.9, safeEvery: 3 },
    classic: { label: "Classic", targetRows: 28, speedMul: 0.92, density: 1.0, scoreMul: 1.0, safeEvery: 4 },
    chaos: { label: "Chaos", targetRows: 34, speedMul: 1.08, density: 1.22, scoreMul: 1.35, safeEvery: 5 },
  };

  const SKINS = {
    classic: { label: "Classic James", shirt: "#3f7de1", pants: "#2b3857", skin: "#f0bf93" },
    varsity: { label: "Varsity James", shirt: "#c93d43", pants: "#293042", skin: "#f1be95" },
    hoodie: { label: "Hoodie James", shirt: "#505d74", pants: "#1e2433", skin: "#ebb287" },
    pajama: { label: "Pajama James", shirt: "#23a78f", pants: "#3a5cae", skin: "#f3c39a" },
  };

  const LANE_TYPES = [
    { key: "homework", laneColor: "#e3c768", laneShade: "#cfb45a", obstacle: "#6d5527", obstacleAccent: "#f6ecd0" },
    { key: "training", laneColor: "#d67070", laneShade: "#bf5959", obstacle: "#722b2b", obstacleAccent: "#ffd5d5" },
    { key: "chores", laneColor: "#6fa3de", laneShade: "#588bc4", obstacle: "#21476f", obstacleAccent: "#d4e7fb" },
  ];
  const OBSTACLE_VARIANTS = {
    homework: ["books", "worksheet", "pencilcase"],
    training: ["cone", "ball", "dumbbell"],
    chores: ["bucket", "basket", "mopkit"],
  };

  const dom = {
    canvas: document.getElementById("gameCanvas"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    sessionSummary: document.getElementById("sessionSummary"),
    summaryScore: document.getElementById("summaryScore"),
    summaryDifficulty: document.getElementById("summaryDifficulty"),
    summaryTime: document.getElementById("summaryTime"),
    startButton: document.getElementById("startButton"),
    secondaryButton: document.getElementById("secondaryButton"),
    pauseButton: document.getElementById("pauseButton"),
    quickMuteButton: document.getElementById("quickMuteButton"),
    fullscreenButton: document.getElementById("fullscreenButton"),
    toolbarNote: document.getElementById("toolbarNote"),
    difficultySelect: document.getElementById("difficultySelect"),
    skinSelect: document.getElementById("skinSelect"),
    soundToggle: document.getElementById("soundToggle"),
    musicToggle: document.getElementById("musicToggle"),
    hapticsToggle: document.getElementById("hapticsToggle"),
    playerNameInput: document.getElementById("playerNameInput"),
    leaderboardList: document.getElementById("leaderboardList"),
    leaderboardTitle: document.getElementById("leaderboardTitle"),
    leaderboardStatus: document.getElementById("leaderboardStatus"),
    resetScoresButton: document.getElementById("resetScoresButton"),
    furthestValue: document.getElementById("furthestValue"),
    tasksValue: document.getElementById("tasksValue"),
    bestScoreValue: document.getElementById("bestScoreValue"),
    winsValue: document.getElementById("winsValue"),
    gameShell: document.querySelector(".game-shell"),
    app: document.querySelector(".app"),
    dpadButtons: Array.from(document.querySelectorAll(".ctrl[data-dir]")),
  };

  if (!dom.canvas) return;

  const ctx = dom.canvas.getContext("2d");
  let dpr = 1;
  let raf = 0;
  let noteTimer = 0;
  let transientNote = "";
  const obstacleSprites = Object.create(null);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (v, m) => ((v % m) + m) % m;
  const hash01 = (s) => {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };
  const formatTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

  function loadObstacleSprites() {
    for (const names of Object.values(OBSTACLE_VARIANTS)) {
      for (const name of names) {
        if (obstacleSprites[name]) continue;
        const img = new Image();
        img.decoding = "async";
        img.datasetState = "loading";
        const embeddedMap = window.OBSTACLE_SPRITES_DATA || null;
        const candidates = [];
        if (embeddedMap && embeddedMap[name]) candidates.push(embeddedMap[name]);
        candidates.push(`assets/obstacles/${name}.png`);
        candidates.push(`assets/obstacles/${name}.svg`);
        img._srcCandidates = candidates;
        img._srcIndex = -1;
        const loadNextCandidate = () => {
          img._srcIndex += 1;
          if (img._srcIndex >= img._srcCandidates.length) {
            img.datasetState = "error";
            return;
          }
          img.datasetState = "loading";
          img.src = img._srcCandidates[img._srcIndex];
        };
        img.addEventListener("load", () => {
          img.datasetState = "loaded";
        });
        img.addEventListener("error", () => {
          loadNextCandidate();
        });
        loadNextCandidate();
        obstacleSprites[name] = img;
      }
    }
  }

  function nowISODate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function normalizePlayerName(value) {
    const raw = String(value || "").trim().replace(/\s+/g, " ");
    const cleaned = raw.replace(/[^a-zA-Z0-9 _.'-]/g, "");
    return cleaned.slice(0, PLAYER_NAME_MAX);
  }

  function isHttpPage() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function parseJSON(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function defaultStore() {
    return {
      settings: {
        difficulty: "classic",
        skin: "classic",
        playerName: "",
        sound: true,
        music: true,
        haptics: true,
        masterMuted: false,
      },
      stats: { bestScore: 0, wins: 0 },
      leaderboard: [],
    };
  }

  function loadStore() {
    const fallback = defaultStore();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = parseJSON(raw, fallback);
    const obj = parsed && typeof parsed === "object" ? parsed : {};
    return {
      settings: { ...fallback.settings, ...(obj.settings || {}) },
      stats: { ...fallback.stats, ...(obj.stats || {}) },
      leaderboard: Array.isArray(obj.leaderboard) ? obj.leaderboard.slice(0, MAX_LEADERBOARD) : [],
    };
  }

  const store = loadStore();
  const saveStore = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  const isSfxEnabled = () => !!(store.settings.sound && !store.settings.masterMuted);
  const isMusicEnabled = () => !!(store.settings.music && !store.settings.masterMuted);
  const remoteLeaderboard = {
    entries: [],
    status: "idle", // idle | loading | ready | unavailable | error
    message: "",
  };

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.musicTimer = 0;
      this.step = 0;
      this.supported = !!(window.AudioContext || window.webkitAudioContext);
    }
    ensure() {
      if (!this.supported) return null;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
      }
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    pulse(freq, dur, { type = "square", vol = 0.02, delay = 0, slideTo = 0 } = {}) {
      const ac = this.ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ac.destination);
      const t0 = ac.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      if (slideTo) {
        osc.frequency.setValueAtTime(freq, t0);
        osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }
    playSfx(name) {
      if (!isSfxEnabled()) return;
      if (name === "move") this.pulse(420, 0.06, { vol: 0.015, slideTo: 500 });
      else if (name === "bump") this.pulse(150, 0.07, { vol: 0.012, type: "triangle" });
      else if (name === "hit") this.pulse(140, 0.14, { vol: 0.03, type: "sawtooth", slideTo: 80 });
      else if (name === "downer") {
        this.pulse(330, 0.10, { vol: 0.016, type: "triangle", slideTo: 220 });
        this.pulse(196, 0.22, { vol: 0.022, type: "sawtooth", delay: 0.08, slideTo: 110 });
        this.pulse(146, 0.42, { vol: 0.026, type: "triangle", delay: 0.14, slideTo: 73 });
      }
      else if (name === "ui") this.pulse(520, 0.05, { vol: 0.012, type: "triangle" });
      else if (name === "pause") {
        this.pulse(330, 0.05, { vol: 0.012 });
        this.pulse(262, 0.06, { vol: 0.012, delay: 0.07 });
      } else if (name === "win") {
        this.pulse(392, 0.08, { vol: 0.02 });
        this.pulse(494, 0.08, { vol: 0.02, delay: 0.09 });
        this.pulse(587, 0.14, { vol: 0.022, delay: 0.18 });
      }
    }
    startMusic() {
      if (this.musicTimer || !isMusicEnabled()) return;
      this.ensure();
      const bass = [131, 131, 147, 165, 147, 131, 110, 123];
      const lead = [523, 659, 587, 659, 784, 659, 587, 523];
      this.musicTimer = window.setInterval(() => {
        if (!isMusicEnabled()) return;
        const i = this.step % bass.length;
        const vol = game.mode === "running" ? 0.01 : 0.006;
        this.pulse(bass[i], 0.16, { vol, type: "square" });
        this.pulse(lead[i], 0.09, { vol: vol * 0.75, type: "triangle", delay: 0.08 });
        this.step += 1;
      }, 240);
    }
    stopMusic() {
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = 0;
      }
    }
    syncMusic() {
      if (isMusicEnabled()) this.startMusic();
      else this.stopMusic();
    }
  }

  const audio = new AudioEngine();

  function haptic(pattern) {
    if (!store.settings.haptics || !navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {}
  }

  const game = {
    mode: "intro",
    world: null,
    player: { row: 0, col: Math.floor(BOARD_COLS / 2) },
    cameraRow: 0,
    elapsedMs: 0,
    lastTickMs: 0,
    furthest: 0,
    tasksDodged: 0,
    dodgedRows: new Set(),
    score: 0,
    lastResult: null,
    moveAnim: null,
  };

  const currentDifficultyKey = () => (DIFFICULTIES[store.settings.difficulty] ? store.settings.difficulty : "classic");
  const currentSkinKey = () => (SKINS[store.settings.skin] ? store.settings.skin : "classic");
  const laneAt = (row) => (game.world ? game.world.lanes[row] || null : null);

  function buildWorld(diffKey) {
    const diff = DIFFICULTIES[diffKey] || DIFFICULTIES.classic;
    const lanes = [];
    lanes[0] = { kind: "start" };
    for (let row = 1; row < diff.targetRows; row += 1) {
      if (row <= 2 || row % diff.safeEvery === 0 || row % 9 === 0) {
        lanes[row] = { kind: "safe" };
        continue;
      }
      const type = LANE_TYPES[Math.floor(hash01(row * 7.17) * LANE_TYPES.length) % LANE_TYPES.length];
      const dir = hash01(row * 1.37 + 11) > 0.5 ? 1 : -1;
      const speed = (0.78 + hash01(row * 2.53 + 19) * 0.95 + Math.min(row, 30) * 0.008) * diff.speedMul;
      const cycleLen = BOARD_COLS + 5 + Math.floor(hash01(row * 4.31 + 3) * 6);
      const count = clamp(Math.round(2 + diff.density + hash01(row * 5.11 + 9) * 1.8), 2, 5);
      const spacing = cycleLen / count;
      const widthBias = type.key === "homework" ? 1.15 : type.key === "training" ? 1.0 : 1.25;
      const items = [];
      for (let i = 0; i < count; i += 1) {
        const seed = row * 100 + i * 13;
        const width = clamp(0.85 + hash01(seed) * widthBias, 0.85, Math.max(1.05, spacing - 1.65));
        const jitter = (hash01(seed + 7) - 0.5) * 0.35;
        const variants = OBSTACLE_VARIANTS[type.key] || ["box"];
        items.push({
          base: i * spacing + jitter,
          width,
          variant: variants[(row + i) % variants.length],
          seed,
        });
      }
      lanes[row] = { kind: "obstacle", type, dir, speed, cycleLen, offset: hash01(row * 8.91 + 5) * cycleLen, items };
    }
    lanes[diff.targetRows] = { kind: "goal" };
    return { targetRows: diff.targetRows, lanes, difficultyKey: diffKey };
  }

  function getRunTimeMs() {
    return game.mode === "running" ? game.elapsedMs + Math.max(0, performance.now() - game.lastTickMs) : game.elapsedMs;
  }

  function computeScore() {
    const diff = DIFFICULTIES[game.world?.difficultyKey || "classic"] || DIFFICULTIES.classic;
    const timeBonus = Math.max(0, 220 - Math.floor((getRunTimeMs() / 1000) * 4));
    return Math.max(0, Math.round((game.furthest * 60 + game.tasksDodged * 35 + timeBonus) * diff.scoreMul));
  }

  function updateHud() {
    dom.furthestValue.textContent = String(game.furthest);
    dom.tasksValue.textContent = String(game.tasksDodged);
    dom.bestScoreValue.textContent = String(store.stats.bestScore || 0);
    dom.winsValue.textContent = String(store.stats.wins || 0);
  }

  function refreshToolbarNote() {
    if (transientNote) return (dom.toolbarNote.textContent = transientNote);
    dom.toolbarNote.textContent =
      game.mode === "running" ? "Swipe on the board to move James." :
      game.mode === "paused" ? "Paused. Resume or restart from the overlay." :
      game.mode === "win" ? "Couch unlocked. Try a higher difficulty." :
      game.mode === "gameover" ? "Responsibilities got him. Tap Start to retry." :
      "Choose settings, then tap Start Game.";
  }

  function setToolbarNote(msg, ttlMs = 0) {
    clearTimeout(noteTimer);
    noteTimer = 0;
    transientNote = msg || "";
    refreshToolbarNote();
    if (msg && ttlMs > 0) {
      noteTimer = window.setTimeout(() => {
        transientNote = "";
        refreshToolbarNote();
      }, ttlMs);
    }
  }

  function updateOverlayForMode() {
    const diffKey = game.world?.difficultyKey || currentDifficultyKey();
    const diffLabel = DIFFICULTIES[diffKey]?.label || "Classic";
    const timeMs = game.lastResult ? game.lastResult.timeMs : getRunTimeMs();
    const score = game.lastResult ? game.lastResult.score : computeScore();
    dom.summaryScore.textContent = String(score || 0);
    dom.summaryDifficulty.textContent = diffLabel;
    dom.summaryTime.textContent = formatTime(timeMs || 0);

    if (game.mode === "intro") {
      dom.overlay.classList.remove("hidden");
      dom.overlayTitle.textContent = "James Needs a Break";
      dom.overlayText.textContent = "Swipe or use arrows/WASD to cross a week of responsibilities and reach the couch + Xbox.";
      dom.sessionSummary.hidden = true;
      dom.secondaryButton.hidden = true;
      dom.startButton.textContent = "Start Game";
    } else if (game.mode === "paused") {
      dom.overlay.classList.remove("hidden");
      dom.overlayTitle.textContent = "Paused";
      dom.overlayText.textContent = "Take a breather. Resume this run or restart with your current settings.";
      dom.sessionSummary.hidden = false;
      dom.secondaryButton.hidden = false;
      dom.secondaryButton.textContent = "Resume";
      dom.startButton.textContent = "Restart Run";
    } else if (game.mode === "gameover") {
      dom.overlay.classList.remove("hidden");
      dom.overlayTitle.textContent = "James Got Stuck";
      dom.overlayText.textContent = "A wave of responsibilities caught him. Adjust your settings or try another route.";
      dom.sessionSummary.hidden = false;
      dom.secondaryButton.hidden = true;
      dom.startButton.textContent = "Try Again";
    } else if (game.mode === "win") {
      dom.overlay.classList.remove("hidden");
      dom.overlayTitle.textContent = "Xbox Time Unlocked";
      dom.overlayText.textContent = "James made it through chores, homework, and practice. Queue up another run.";
      dom.sessionSummary.hidden = false;
      dom.secondaryButton.hidden = true;
      dom.startButton.textContent = "Play Again";
    } else {
      dom.overlay.classList.add("hidden");
    }
    refreshToolbarNote();
  }

  function renderLocalLeaderboard() {
    dom.leaderboardTitle.textContent = "Local Best Runs";
    dom.leaderboardStatus.textContent = "Server leaderboard unavailable. Showing local runs saved on this device.";
    dom.leaderboardList.innerHTML = "";
    if (!store.leaderboard.length) {
      const li = document.createElement("li");
      li.textContent = "No runs saved yet. Finish a game to record local scores.";
      dom.leaderboardList.appendChild(li);
      return;
    }
    for (const entry of store.leaderboard) {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = String(entry.score);
      li.appendChild(strong);
      li.append(` - ${entry.difficulty} - ${formatTime(entry.timeMs)} - ${entry.win ? "Win" : "Out"} - ${entry.date}`);
      dom.leaderboardList.appendChild(li);
    }
  }

  function renderRemoteLeaderboard() {
    dom.leaderboardTitle.textContent = "Global Top 30";
    dom.leaderboardStatus.textContent =
      remoteLeaderboard.status === "loading" ? "Connecting to server leaderboard..." :
      remoteLeaderboard.status === "ready" ? "Server leaderboard loaded." :
      remoteLeaderboard.message || "Server leaderboard unavailable. Showing local runs.";
    dom.leaderboardList.innerHTML = "";
    if (!remoteLeaderboard.entries.length) {
      const li = document.createElement("li");
      li.textContent = "No global scores yet. Set a player name and finish a run to claim the first spot.";
      dom.leaderboardList.appendChild(li);
      return;
    }
    for (const [index, entry] of remoteLeaderboard.entries.entries()) {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${index + 1}. ${entry.name}`;
      li.appendChild(strong);
      li.append(` - ${entry.score} - ${entry.difficulty} - ${formatTime(entry.timeMs)} - ${entry.win ? "Win" : "Out"}`);
      dom.leaderboardList.appendChild(li);
    }
  }

  function renderLeaderboard() {
    if (remoteLeaderboard.status === "loading" || remoteLeaderboard.status === "ready") {
      renderRemoteLeaderboard();
      return;
    }
    renderLocalLeaderboard();
  }

  async function fetchRemoteLeaderboard() {
    if (!isHttpPage()) {
      remoteLeaderboard.status = "unavailable";
      remoteLeaderboard.message = "Open via a local server or deployment to use the global leaderboard.";
      renderLeaderboard();
      return;
    }
    remoteLeaderboard.status = "loading";
    remoteLeaderboard.message = "";
    renderLeaderboard();
    try {
      const response = await fetch(LEADERBOARD_API_PATH, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const entries = Array.isArray(data?.entries) ? data.entries : [];
      remoteLeaderboard.entries = entries.slice(0, REMOTE_LEADERBOARD_LIMIT).map((entry) => ({
        name: normalizePlayerName(entry.name || entry.playerName || "Anonymous") || "Anonymous",
        score: Number(entry.score) || 0,
        difficulty: String(entry.difficulty || "Classic"),
        timeMs: Math.max(0, Number(entry.timeMs) || 0),
        win: !!entry.win,
      }));
      remoteLeaderboard.status = "ready";
      remoteLeaderboard.message = "";
    } catch {
      remoteLeaderboard.status = "error";
      remoteLeaderboard.message = "Server leaderboard could not be reached. Showing local runs.";
    }
    renderLeaderboard();
  }

  async function submitRemoteLeaderboardScore(payload) {
    if (!isHttpPage()) return false;
    const playerName = normalizePlayerName(store.settings.playerName);
    if (!playerName) return false;
    try {
      const response = await fetch(LEADERBOARD_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: playerName,
          score: payload.score,
          difficulty: payload.difficulty,
          timeMs: payload.timeMs,
          win: payload.win,
          date: payload.date,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data?.entries)) {
        remoteLeaderboard.entries = data.entries.slice(0, REMOTE_LEADERBOARD_LIMIT).map((entry) => ({
          name: normalizePlayerName(entry.name || entry.playerName || "Anonymous") || "Anonymous",
          score: Number(entry.score) || 0,
          difficulty: String(entry.difficulty || "Classic"),
          timeMs: Math.max(0, Number(entry.timeMs) || 0),
          win: !!entry.win,
        }));
        remoteLeaderboard.status = "ready";
        remoteLeaderboard.message = "";
        renderLeaderboard();
      } else {
        void fetchRemoteLeaderboard();
      }
      return true;
    } catch {
      if (remoteLeaderboard.status !== "ready") {
        remoteLeaderboard.status = "error";
        remoteLeaderboard.message = "Server leaderboard could not be reached. Showing local runs.";
        renderLeaderboard();
      }
      return false;
    }
  }
  function syncSettingsControls() {
    dom.difficultySelect.value = currentDifficultyKey();
    dom.skinSelect.value = currentSkinKey();
    dom.playerNameInput.value = normalizePlayerName(store.settings.playerName);
    dom.soundToggle.checked = !!store.settings.sound;
    dom.musicToggle.checked = !!store.settings.music;
    dom.hapticsToggle.checked = !!store.settings.haptics;
  }

  function syncToolbarButtons() {
    const muted = !!store.settings.masterMuted;
    dom.quickMuteButton.textContent = muted ? "Audio Off" : "Audio On";
    dom.quickMuteButton.setAttribute("aria-pressed", String(muted));
    const fullscreen = !!document.fullscreenElement;
    dom.fullscreenButton.textContent = fullscreen ? "Exit Fullscreen" : "Fullscreen";
    dom.fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    const paused = game.mode === "paused";
    dom.pauseButton.textContent = paused ? "Resume" : "Pause";
    dom.pauseButton.setAttribute("aria-pressed", String(paused));
  }

  function resizeCanvas() {
    const rect = dom.canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (dom.canvas.width !== w || dom.canvas.height !== h) {
      dom.canvas.width = w;
      dom.canvas.height = h;
    }
  }

  function getLayout() {
    const width = dom.canvas.width;
    const height = dom.canvas.height;
    const tile = Math.max(18 * dpr, Math.floor(Math.min(width / BOARD_COLS, height / 11)));
    const boardWidth = tile * BOARD_COLS;
    const x0 = Math.floor((width - boardWidth) / 2);
    const visibleRows = Math.ceil(height / tile) + 1;
    return { width, height, tile, boardWidth, x0, visibleRows };
  }

  function laneObstaclePositions(lane, timeSec) {
    const phase = lane.offset + lane.dir * lane.speed * timeSec;
    const out = [];
    for (const item of lane.items) {
      const p = mod(item.base + phase, lane.cycleLen);
      out.push({ x: p, w: item.width, variant: item.variant, seed: item.seed });
      out.push({ x: p - lane.cycleLen, w: item.width, variant: item.variant, seed: item.seed });
    }
    return out;
  }

  function playerRect() {
    return { x: game.player.col + 0.16, w: 0.68 };
  }

  function checkCollision() {
    if (!game.world || game.mode !== "running") return false;
    const lane = laneAt(game.player.row);
    if (!lane || lane.kind !== "obstacle") return false;
    const pr = playerRect();
    const timeSec = getRunTimeMs() / 1000;
    for (const obs of laneObstaclePositions(lane, timeSec)) {
      if (obs.x < pr.x + pr.w && obs.x + obs.w > pr.x) return true;
    }
    return false;
  }

  function resetRunState() {
    game.player = { row: 0, col: Math.floor(BOARD_COLS / 2) };
    game.cameraRow = 0;
    game.elapsedMs = 0;
    game.lastTickMs = performance.now();
    game.furthest = 0;
    game.tasksDodged = 0;
    game.dodgedRows = new Set();
    game.score = 0;
    game.lastResult = null;
    game.moveAnim = null;
    updateHud();
  }

  function startNewRun() {
    const diffKey = currentDifficultyKey();
    game.world = buildWorld(diffKey);
    resetRunState();
    game.mode = "running";
    audio.playSfx("ui");
    audio.syncMusic();
    haptic(10);
    updateOverlayForMode();
    syncToolbarButtons();
    setToolbarNote(`${DIFFICULTIES[diffKey].label} run started. Reach the couch row.`, 2200);
  }

  function pauseRun() {
    if (game.mode !== "running") return;
    game.elapsedMs += Math.max(0, performance.now() - game.lastTickMs);
    game.mode = "paused";
    audio.playSfx("pause");
    audio.syncMusic();
    updateOverlayForMode();
    syncToolbarButtons();
    setToolbarNote("Run paused.", 1600);
  }

  function resumeRun() {
    if (game.mode !== "paused") return;
    game.mode = "running";
    game.lastTickMs = performance.now();
    audio.playSfx("ui");
    audio.syncMusic();
    updateOverlayForMode();
    syncToolbarButtons();
    setToolbarNote("Back in it.", 1400);
  }

  function finalizeRun(win) {
    if (game.mode !== "running") return;
    game.elapsedMs += Math.max(0, performance.now() - game.lastTickMs);
    game.mode = win ? "win" : "gameover";
    game.score = computeScore();
    const diffLabel = DIFFICULTIES[game.world?.difficultyKey || "classic"]?.label || "Classic";
    game.lastResult = { score: game.score, timeMs: game.elapsedMs, difficulty: diffLabel, win };

    if (game.score > (store.stats.bestScore || 0)) store.stats.bestScore = game.score;
    if (win) store.stats.wins = (store.stats.wins || 0) + 1;

    store.leaderboard.push({
      score: game.score,
      difficulty: diffLabel,
      timeMs: Math.round(game.elapsedMs),
      win,
      date: nowISODate(),
    });
    store.leaderboard.sort((a, b) => (b.score - a.score) || (a.timeMs - b.timeMs));
    store.leaderboard = store.leaderboard.slice(0, MAX_LEADERBOARD);
    const completedRun = {
      name: normalizePlayerName(store.settings.playerName),
      score: game.score,
      difficulty: diffLabel,
      timeMs: Math.round(game.elapsedMs),
      win,
      date: nowISODate(),
    };
    saveStore();
    updateHud();
    renderLeaderboard();
    if (win) {
      audio.playSfx("win");
      haptic([30, 35, 50]);
      setToolbarNote("Win saved to local leaderboard.", 2200);
    } else {
      audio.playSfx("downer");
      audio.playSfx("hit");
      haptic([25, 30, 25]);
      setToolbarNote("Run over. Stats saved locally.", 2200);
    }
    audio.syncMusic();
    updateOverlayForMode();
    syncToolbarButtons();
    if (completedRun.name) {
      void submitRemoteLeaderboardScore(completedRun);
    } else if (isHttpPage()) {
      setToolbarNote("Set a player name to submit runs to the global leaderboard.", 2600);
    }
  }

  function tryMove(dir) {
    if (game.mode !== "running" || !game.world) return false;
    let row = game.player.row;
    let col = game.player.col;
    if (dir === "up") row += 1;
    if (dir === "down") row -= 1;
    if (dir === "left") col -= 1;
    if (dir === "right") col += 1;

    if (row < 0 || col < 0 || col >= BOARD_COLS) {
      audio.playSfx("bump");
      haptic(8);
      return false;
    }

    const prevRow = game.player.row;
    const prevCol = game.player.col;
    game.player.row = Math.min(row, game.world.targetRows);
    game.player.col = col;
    game.moveAnim = {
      fromRow: prevRow,
      fromCol: prevCol,
      toRow: game.player.row,
      toCol: game.player.col,
      startMs: performance.now(),
      durationMs: 110,
      dir,
    };
    if (game.player.row > game.furthest) game.furthest = game.player.row;
    const lane = laneAt(game.player.row);
    if (lane?.kind === "obstacle" && !game.dodgedRows.has(game.player.row)) {
      game.dodgedRows.add(game.player.row);
      game.tasksDodged += 1;
    }
    if (game.player.row >= game.world.targetRows) return finalizeRun(true), true;
    if (checkCollision()) return finalizeRun(false), true;
    audio.playSfx("move");
    haptic(6);
    updateHud();
    return true;
  }
  function roundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawCircleStroke(x, y, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  function drawObstacleSpriteTile(img, cx, cy, size, rotation) {
    if (!img) return false;
    const ready = img.complete && ((img.naturalWidth && img.naturalWidth > 0) || (img.width && img.width > 0));
    if (!ready) return false;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    try {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } catch {
      ctx.restore();
      return false;
    }
    ctx.restore();
    return true;
  }

  function drawLaneBackground(layout, y, lane, even) {
    if (lane?.kind === "goal") {
      ctx.fillStyle = "#b8e2a8";
      ctx.fillRect(layout.x0, y, layout.boardWidth, layout.tile);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(layout.x0, y + layout.tile * 0.55, layout.boardWidth, layout.tile * 0.1);
      return;
    }
    if (lane?.kind === "safe" || lane?.kind === "start") {
      ctx.fillStyle = even ? "#8ccf7a" : "#7dc56c";
      ctx.fillRect(layout.x0, y, layout.boardWidth, layout.tile);
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let i = 0; i < BOARD_COLS; i += 2) {
        ctx.fillRect(layout.x0 + i * layout.tile, y + layout.tile * 0.75, layout.tile, layout.tile * 0.05);
      }
      return;
    }
    if (lane?.kind === "obstacle") {
      ctx.fillStyle = lane.type.laneColor;
      ctx.fillRect(layout.x0, y, layout.boardWidth, layout.tile);
      ctx.fillStyle = lane.type.laneShade;
      ctx.fillRect(layout.x0, y + layout.tile * 0.66, layout.boardWidth, layout.tile * 0.18);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(layout.x0, y + layout.tile * 0.18, layout.boardWidth, layout.tile * 0.05);
      return;
    }
    ctx.fillStyle = even ? "#93c87b" : "#86be70";
    ctx.fillRect(layout.x0, y, layout.boardWidth, layout.tile);
  }

  function drawObstacle(layout, y, lane, obs) {
    const x = layout.x0 + obs.x * layout.tile;
    const w = obs.w * layout.tile;
    if (x + w < layout.x0 - layout.tile || x > layout.x0 + layout.boardWidth + layout.tile) return;
    const h = layout.tile * 0.68;
    const oy = y + layout.tile * 0.16;
    const cardX = x + 2 * dpr;
    const cardW = Math.max(6 * dpr, w - 4 * dpr);
    ctx.fillStyle = "rgba(10, 14, 22, 0.14)";
    roundedRect(cardX, oy + h * 0.06, cardW, h, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    roundedRect(cardX, oy, cardW, h, 6 * dpr);
    ctx.fill();
    ctx.strokeStyle = "rgba(23,26,31,0.10)";
    ctx.lineWidth = Math.max(1, dpr);
    roundedRect(cardX, oy, cardW, h, 6 * dpr);
    ctx.stroke();

    const img = obstacleSprites[obs.variant];
    const slotSize = Math.min(h * 0.84, layout.tile * 0.72);
    const slots = clamp(Math.floor((cardW - 8 * dpr) / (slotSize * 0.78)), 1, 3);
    const contentW = slots * slotSize + (slots - 1) * (slotSize * 0.12);
    const startX = cardX + (cardW - contentW) / 2 + slotSize / 2;
    const centerY = oy + h * 0.5;
    let drewAny = false;
    for (let i = 0; i < slots; i += 1) {
      const cx = startX + i * slotSize * 1.12;
      const rot = ((obs.seed || 0) % 7 - 3) * 0.015 + (i - (slots - 1) / 2) * 0.025;
      drewAny = drawObstacleSpriteTile(img, cx, centerY, slotSize, rot) || drewAny;
    }

    if (!drewAny) {
      ctx.fillStyle = lane.type.obstacle;
      roundedRect(cardX + cardW * 0.18, oy + h * 0.24, cardW * 0.64, h * 0.52, 4 * dpr);
      ctx.fill();
      ctx.fillStyle = lane.type.obstacleAccent;
      ctx.fillRect(cardX + cardW * 0.28, oy + h * 0.38, cardW * 0.44, Math.max(2 * dpr, 1));
      ctx.fillRect(cardX + cardW * 0.24, oy + h * 0.52, cardW * 0.52, Math.max(2 * dpr, 1));
    }
  }

  function drawGoalCouch(layout, y) {
    const cx = layout.x0 + layout.boardWidth * 0.5;
    const couchW = layout.tile * 3.2;
    const couchH = layout.tile * 0.72;
    ctx.fillStyle = "#7146b6";
    roundedRect(cx - couchW / 2, y + layout.tile * 0.22, couchW, couchH, 10 * dpr);
    ctx.fill();
    ctx.fillStyle = "#5b3793";
    ctx.fillRect(cx - couchW / 2, y + layout.tile * 0.62, couchW, layout.tile * 0.2);
    ctx.fillRect(cx - couchW / 2 + 8 * dpr, y + layout.tile * 0.12, couchW - 16 * dpr, layout.tile * 0.2);
    const consoleX = cx + couchW * 0.64;
    ctx.fillStyle = "#2a3348";
    roundedRect(consoleX, y + layout.tile * 0.36, layout.tile * 0.58, layout.tile * 0.34, 5 * dpr);
    ctx.fill();
    ctx.fillStyle = "#6de17d";
    ctx.beginPath();
    ctx.arc(consoleX + layout.tile * 0.46, y + layout.tile * 0.53, layout.tile * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(layout, timeSec) {
    const skin = SKINS[currentSkinKey()] || SKINS.classic;
    let drawCol = game.player.col;
    let drawRow = game.player.row;
    let hop = 0;
    if (game.moveAnim) {
      const t = clamp((performance.now() - game.moveAnim.startMs) / game.moveAnim.durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      drawCol = game.moveAnim.fromCol + (game.moveAnim.toCol - game.moveAnim.fromCol) * eased;
      drawRow = game.moveAnim.fromRow + (game.moveAnim.toRow - game.moveAnim.fromRow) * eased;
      hop = Math.sin(t * Math.PI) * layout.tile * 0.14;
      if (t >= 1) game.moveAnim = null;
    }
    const idleBob = Math.sin(timeSec * 8) * layout.tile * 0.02;
    const x = layout.x0 + drawCol * layout.tile;
    const y = layout.height - (drawRow - game.cameraRow + 1) * layout.tile + idleBob - hop;
    const px = x + layout.tile * 0.17;
    const py = y + layout.tile * 0.12;
    const pw = layout.tile * 0.66;
    const ph = layout.tile * 0.76;
    const stride = game.moveAnim ? Math.sin(((performance.now() - game.moveAnim.startMs) / game.moveAnim.durationMs) * Math.PI) * pw * 0.06 : 0;
    ctx.fillStyle = skin.pants;
    roundedRect(px + pw * 0.1, py + ph * 0.5, pw * 0.8, ph * 0.35, 5 * dpr);
    ctx.fill();
    ctx.fillStyle = skin.pants;
    ctx.fillRect(px + pw * 0.18 - stride, py + ph * 0.7, pw * 0.12, ph * 0.16);
    ctx.fillRect(px + pw * 0.58 + stride, py + ph * 0.7, pw * 0.12, ph * 0.16);
    ctx.fillStyle = skin.shirt;
    roundedRect(px, py + ph * 0.2, pw, ph * 0.4, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = skin.skin;
    ctx.beginPath();
    ctx.arc(px + pw * 0.5, py + ph * 0.13, ph * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#151a23";
    const eyeY = py + ph * 0.12;
    ctx.fillRect(px + pw * 0.38, eyeY, Math.max(1, 1.5 * dpr), Math.max(1, 1.5 * dpr));
    ctx.fillRect(px + pw * 0.57, eyeY, Math.max(1, 1.5 * dpr), Math.max(1, 1.5 * dpr));
  }

  function drawProgress(layout) {
    if (!game.world) return;
    const p = clamp(game.player.row / game.world.targetRows, 0, 1);
    const barW = Math.min(layout.boardWidth, 320 * dpr);
    const x = layout.x0 + (layout.boardWidth - barW) / 2;
    const y = 8 * dpr;
    ctx.fillStyle = "rgba(20,24,31,0.16)";
    roundedRect(x, y, barW, 12 * dpr, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = "#e1692a";
    roundedRect(x, y, barW * p, 12 * dpr, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = "rgba(20,24,31,0.75)";
    ctx.font = `${Math.round(10 * dpr)}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`Row ${game.player.row}/${game.world.targetRows}`, x, y + 24 * dpr);

  }

  function render() {
    resizeCanvas();
    const layout = getLayout();
    if (!game.world) game.world = buildWorld(currentDifficultyKey());
    const timeSec = getRunTimeMs() / 1000;

    ctx.clearRect(0, 0, layout.width, layout.height);
    const bg = ctx.createLinearGradient(0, 0, 0, layout.height);
    bg.addColorStop(0, "#f8f4ea");
    bg.addColorStop(1, "#d9efe1");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, layout.width, layout.height);

    const targetCamera = clamp(game.player.row - CAMERA_LEAD_ROWS, 0, Math.max(0, game.world.targetRows - 8));
    game.cameraRow += (targetCamera - game.cameraRow) * 0.18;

    const firstRow = Math.max(0, Math.floor(game.cameraRow) - 1);
    const lastRow = Math.min(game.world.targetRows, firstRow + layout.visibleRows + 1);
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = layout.height - (row - game.cameraRow + 1) * layout.tile;
      const lane = laneAt(row);
      drawLaneBackground(layout, y, lane, row % 2 === 0);
      if (lane?.kind === "obstacle") {
        for (const obs of laneObstaclePositions(lane, timeSec)) drawObstacle(layout, y, lane, obs);
      }
      if (lane?.kind === "goal") drawGoalCouch(layout, y);
    }

    ctx.strokeStyle = "rgba(20,24,31,0.08)";
    ctx.lineWidth = Math.max(1, dpr);
    for (let c = 0; c <= BOARD_COLS; c += 1) {
      const x = layout.x0 + c * layout.tile;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, layout.height);
      ctx.stroke();
    }

    drawPlayer(layout, timeSec);
    drawProgress(layout);
    if (game.mode === "paused") {
      ctx.fillStyle = "rgba(9,12,18,0.18)";
      ctx.fillRect(layout.x0, 0, layout.boardWidth, layout.height);
    }
  }

  function loop(ts) {
    if (!game.lastTickMs) game.lastTickMs = ts;
    if (game.mode === "running") {
      const dt = Math.min(50, Math.max(0, ts - game.lastTickMs));
      game.elapsedMs += dt;
      game.lastTickMs = ts;
      if (checkCollision()) finalizeRun(false);
    } else {
      game.lastTickMs = ts;
    }
    render();
    raf = requestAnimationFrame(loop);
  }
  function queueDirection(dir) {
    if (game.mode !== "running") return;
    audio.ensure();
    tryMove(dir);
  }

  function togglePause() {
    audio.ensure();
    if (game.mode === "running") return pauseRun();
    if (game.mode === "paused") return resumeRun();
    setToolbarNote("Start a run before using pause.", 1600);
    audio.playSfx("bump");
  }

  function toggleMasterMute() {
    store.settings.masterMuted = !store.settings.masterMuted;
    audio.playSfx("ui");
    audio.syncMusic();
    saveStore();
    syncToolbarButtons();
    setToolbarNote(store.settings.masterMuted ? "Audio muted." : "Audio enabled.", 1500);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        const target = dom.gameShell || dom.app || document.documentElement;
        if (target.requestFullscreen) await target.requestFullscreen();
      }
    } catch {
      setToolbarNote("Fullscreen is not available in this browser.", 2000);
    }
    syncToolbarButtons();
  }

  function onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter") {
      if (["intro", "gameover", "win"].includes(game.mode)) {
        event.preventDefault();
        audio.ensure();
        startNewRun();
        return;
      }
      if (game.mode === "paused") {
        event.preventDefault();
        audio.ensure();
        resumeRun();
        return;
      }
    }
    if (key === "escape" || key === "p") {
      event.preventDefault();
      togglePause();
      return;
    }
    const dir =
      key === "arrowup" || key === "w" ? "up" :
      key === "arrowdown" || key === "s" ? "down" :
      key === "arrowleft" || key === "a" ? "left" :
      key === "arrowright" || key === "d" ? "right" : "";
    if (!dir) return;
    event.preventDefault();
    queueDirection(dir);
  }

  function wireSwipe() {
    let tracking = false;
    let sx = 0;
    let sy = 0;
    dom.canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      tracking = true;
      sx = e.clientX;
      sy = e.clientY;
      if (dom.canvas.setPointerCapture) {
        try { dom.canvas.setPointerCapture(e.pointerId); } catch {}
      }
    });
    dom.canvas.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      const threshold = 22;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      queueDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    });
    dom.canvas.addEventListener("pointercancel", () => { tracking = false; });
  }

  function bindUI() {
    dom.startButton.addEventListener("click", () => {
      audio.ensure();
      startNewRun();
    });
    dom.secondaryButton.addEventListener("click", () => {
      audio.ensure();
      if (game.mode === "paused") resumeRun();
    });
    dom.pauseButton.addEventListener("click", togglePause);
    dom.quickMuteButton.addEventListener("click", () => {
      audio.ensure();
      toggleMasterMute();
    });
    dom.fullscreenButton.addEventListener("click", () => {
      audio.ensure();
      toggleFullscreen();
    });

    dom.difficultySelect.addEventListener("change", () => {
      store.settings.difficulty = dom.difficultySelect.value;
      saveStore();
      if (game.mode !== "running" && game.mode !== "paused") game.world = buildWorld(currentDifficultyKey());
      updateOverlayForMode();
      render();
      setToolbarNote(`${DIFFICULTIES[currentDifficultyKey()].label} selected${game.mode === "running" ? " (next run)." : "."}`, 2200);
    });
    dom.skinSelect.addEventListener("change", () => {
      store.settings.skin = dom.skinSelect.value;
      saveStore();
      audio.playSfx("ui");
      render();
      setToolbarNote(`${SKINS[currentSkinKey()].label} selected.`, 1600);
    });
    dom.playerNameInput.addEventListener("change", () => {
      const normalized = normalizePlayerName(dom.playerNameInput.value);
      dom.playerNameInput.value = normalized;
      store.settings.playerName = normalized;
      saveStore();
      if (normalized) {
        setToolbarNote(`Player name set to ${normalized}.`, 1800);
        if (isHttpPage()) void fetchRemoteLeaderboard();
      } else {
        setToolbarNote("Player name cleared. Global leaderboard submissions disabled.", 2200);
      }
    });
    dom.soundToggle.addEventListener("change", () => {
      store.settings.sound = !!dom.soundToggle.checked;
      saveStore();
      audio.playSfx("ui");
      setToolbarNote(store.settings.sound ? "Sound effects on." : "Sound effects off.", 1600);
    });
    dom.musicToggle.addEventListener("change", () => {
      store.settings.music = !!dom.musicToggle.checked;
      saveStore();
      audio.playSfx("ui");
      audio.syncMusic();
      setToolbarNote(store.settings.music ? "Music on." : "Music off.", 1600);
    });
    dom.hapticsToggle.addEventListener("change", () => {
      store.settings.haptics = !!dom.hapticsToggle.checked;
      saveStore();
      if (store.settings.haptics) haptic(8);
      setToolbarNote(store.settings.haptics ? "Haptics on." : "Haptics off.", 1600);
    });

    dom.resetScoresButton.addEventListener("click", () => {
      if (!window.confirm("Reset local leaderboard and best score on this device?")) return;
      store.leaderboard = [];
      store.stats.bestScore = 0;
      store.stats.wins = 0;
      saveStore();
      updateHud();
      renderLeaderboard();
      audio.playSfx("ui");
      updateOverlayForMode();
      setToolbarNote("Local scores reset.", 1800);
    });

    for (const btn of dom.dpadButtons) {
      const dir = btn.dataset.dir;
      if (!dir) continue;
      btn.addEventListener("click", () => {
        audio.ensure();
        queueDirection(dir);
      });
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game.mode === "running") pauseRun();
    });
    document.addEventListener("fullscreenchange", syncToolbarButtons);
    window.addEventListener("resize", render);
    window.addEventListener("orientationchange", () => setTimeout(render, 80));
    wireSwipe();
  }

  function init() {
    loadObstacleSprites();
    syncSettingsControls();
    updateHud();
    renderLeaderboard();
    game.world = buildWorld(currentDifficultyKey());
    updateOverlayForMode();
    syncToolbarButtons();
    bindUI();
    render();
    void fetchRemoteLeaderboard();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("beforeunload", () => {
    if (raf) cancelAnimationFrame(raf);
    audio.stopMusic();
  });

  init();
})();

