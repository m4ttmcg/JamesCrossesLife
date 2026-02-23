(() => {
  "use strict";

  const STORAGE_KEY = "james-crosses-life.v1";
  const BOARD_COLS = 9;
  const CAMERA_LEAD_ROWS = 5;
  const MAX_LEADERBOARD = 7;

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
    leaderboardList: document.getElementById("leaderboardList"),
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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (v, m) => ((v % m) + m) % m;
  const hash01 = (s) => {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };
  const formatTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

  function nowISODate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
        items.push({ base: i * spacing + jitter, width });
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

  function renderLeaderboard() {
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
      li.append(` · ${entry.difficulty} · ${formatTime(entry.timeMs)} · ${entry.win ? "Win" : "Out"} · ${entry.date}`);
      dom.leaderboardList.appendChild(li);
    }
  }

  function syncSettingsControls() {
    dom.difficultySelect.value = currentDifficultyKey();
    dom.skinSelect.value = currentSkinKey();
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
      out.push({ x: p, w: item.width });
      out.push({ x: p - lane.cycleLen, w: item.width });
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
    saveStore();
    updateHud();
    renderLeaderboard();
    if (win) {
      audio.playSfx("win");
      haptic([30, 35, 50]);
      setToolbarNote("Win saved to local leaderboard.", 2200);
    } else {
      audio.playSfx("hit");
      haptic([25, 30, 25]);
      setToolbarNote("Run over. Stats saved locally.", 2200);
    }
    audio.syncMusic();
    updateOverlayForMode();
    syncToolbarButtons();
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

    game.player.row = Math.min(row, game.world.targetRows);
    game.player.col = col;
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
    ctx.fillStyle = lane.type.obstacle;
    roundedRect(x + 2 * dpr, oy, Math.max(6 * dpr, w - 4 * dpr), h, 6 * dpr);
    ctx.fill();
    ctx.fillStyle = lane.type.obstacleAccent;
    if (lane.type.key === "homework") {
      const lineH = Math.max(1, Math.floor(dpr));
      ctx.fillRect(x + w * 0.16, oy + h * 0.28, w * 0.68, lineH);
      ctx.fillRect(x + w * 0.16, oy + h * 0.47, w * 0.56, lineH);
      ctx.fillRect(x + w * 0.16, oy + h * 0.66, w * 0.62, lineH);
    } else if (lane.type.key === "training") {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, oy + h * 0.82);
      ctx.lineTo(x + w * 0.5, oy + h * 0.2);
      ctx.lineTo(x + w * 0.82, oy + h * 0.82);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x + w * 0.2, oy + h * 0.25, w * 0.6, h * 0.12);
      ctx.fillRect(x + w * 0.27, oy + h * 0.45, w * 0.46, h * 0.12);
      ctx.fillRect(x + w * 0.34, oy + h * 0.65, w * 0.32, h * 0.12);
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
    const bob = Math.sin(timeSec * 8) * layout.tile * 0.02;
    const x = layout.x0 + game.player.col * layout.tile;
    const y = layout.height - (game.player.row - game.cameraRow + 1) * layout.tile + bob;
    const px = x + layout.tile * 0.17;
    const py = y + layout.tile * 0.12;
    const pw = layout.tile * 0.66;
    const ph = layout.tile * 0.76;
    ctx.fillStyle = skin.pants;
    roundedRect(px + pw * 0.1, py + ph * 0.5, pw * 0.8, ph * 0.35, 5 * dpr);
    ctx.fill();
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
      if (!window.confirm("Reset local leaderboard and best score?")) return;
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
    syncSettingsControls();
    updateHud();
    renderLeaderboard();
    game.world = buildWorld(currentDifficultyKey());
    updateOverlayForMode();
    syncToolbarButtons();
    bindUI();
    render();
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("beforeunload", () => {
    if (raf) cancelAnimationFrame(raf);
    audio.stopMusic();
  });

  init();
})();
