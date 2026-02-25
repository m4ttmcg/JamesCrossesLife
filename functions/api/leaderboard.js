import { BLOCKED_EXACT_NAMES, BLOCKED_TERMS } from "../_lib/blocked-terms.js";

const MAX_ENTRIES = 30;
const NAME_MAX = 20;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeName(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  const cleaned = raw.replace(/[^a-zA-Z0-9 _.'-]/g, "");
  return cleaned.slice(0, NAME_MAX);
}

function normalizeForModeration(value) {
  const leetMap = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
    "!": "i",
  };
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[013457@$!]/g, (ch) => leetMap[ch] || ch)
    .replace(/[^a-z0-9]/g, "");
}

function moderationTokens(value) {
  const leetMap = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
    "!": "i",
  };
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[013457@$!]/g, (ch) => leetMap[ch] || ch)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const BLOCKED_TERM_NORMALIZED = BLOCKED_TERMS.map((term) => normalizeForModeration(term)).filter(Boolean);
const BLOCKED_EXACT_NORMALIZED = new Set(BLOCKED_EXACT_NAMES.map((term) => normalizeForModeration(term)).filter(Boolean));

function isBlockedPlayerName(name) {
  const normalizedJoined = normalizeForModeration(name);
  if (!normalizedJoined) return false;
  const tokens = moderationTokens(name);

  if (BLOCKED_EXACT_NORMALIZED.has(normalizedJoined)) return true;
  if (tokens.some((token) => BLOCKED_EXACT_NORMALIZED.has(token))) return true;

  for (const blocked of BLOCKED_TERM_NORMALIZED) {
    if (!blocked) continue;
    if (normalizedJoined === blocked) return true; // catches "f.u.c.k" -> "fuck"
    if (tokens.includes(blocked)) return true; // catches "fuck-you" tokenized
  }

  return false;
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.player_name,
    score: Number(row.score) || 0,
    difficulty: row.difficulty || "Classic",
    timeMs: Number(row.time_ms) || 0,
    win: !!row.is_win,
    date: row.run_date || "",
    createdAt: row.created_at || "",
  };
}

async function fetchTopEntries(db) {
  const result = await db
    .prepare(
      `SELECT id, player_name, score, difficulty, time_ms, is_win, run_date, created_at
       FROM leaderboard_scores
       ORDER BY score DESC, time_ms ASC, created_at ASC
       LIMIT ?`
    )
    .bind(MAX_ENTRIES)
    .all();
  return (result.results || []).map(mapRow);
}

async function pruneToTop(db) {
  await db.exec(`
    DELETE FROM leaderboard_scores
    WHERE id NOT IN (
      SELECT id FROM leaderboard_scores
      ORDER BY score DESC, time_ms ASC, created_at ASC
      LIMIT ${MAX_ENTRIES}
    )
  `);
}

function getDb(env) {
  return env && env.LEADERBOARD_DB ? env.LEADERBOARD_DB : null;
}

export async function onRequestGet(context) {
  const db = getDb(context.env);
  if (!db) {
    return json(
      {
        error: "Leaderboard DB binding not configured",
        entries: [],
      },
      503
    );
  }

  try {
    const entries = await fetchTopEntries(db);
    return json({ entries, limit: MAX_ENTRIES });
  } catch (error) {
    return json({ error: "Leaderboard query failed", details: String(error) }, 500);
  }
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) {
    return json({ error: "Leaderboard DB binding not configured" }, 503);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const name = normalizeName(body?.name);
  const score = Number(body?.score);
  const difficulty = String(body?.difficulty || "Classic").slice(0, 16);
  const timeMs = Math.max(0, Math.round(Number(body?.timeMs) || 0));
  const win = !!body?.win;
  const runDate = String(body?.date || "").slice(0, 16);

  if (!name) return json({ error: "Player name is required" }, 400);
  if (isBlockedPlayerName(name)) return json({ error: "Player name is not allowed" }, 400);
  if (!Number.isFinite(score) || score < 0) return json({ error: "Invalid score" }, 400);

  try {
    await db
      .prepare(
        `INSERT INTO leaderboard_scores
         (player_name, score, difficulty, time_ms, is_win, run_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(name, Math.round(score), difficulty, timeMs, win ? 1 : 0, runDate)
      .run();

    await pruneToTop(db);
    const entries = await fetchTopEntries(db);
    return json({ ok: true, entries, limit: MAX_ENTRIES }, 201);
  } catch (error) {
    return json({ error: "Leaderboard insert failed", details: String(error) }, 500);
  }
}
