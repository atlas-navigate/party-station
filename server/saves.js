// Auto-save of in-progress games. One JSON file per game id under data/saves/.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'saves');
fs.mkdirSync(DIR, { recursive: true });

const timers = new Map();

function fileFor(gameId) {
  return path.join(DIR, gameId.replace(/[^a-z0-9-]/gi, '_') + '.json');
}

// Debounced write: games save after every action, so coalesce bursts.
export function save(gameId, payload) {
  clearTimeout(timers.get(gameId));
  timers.set(gameId, setTimeout(() => {
    timers.delete(gameId);
    try {
      fs.writeFileSync(fileFor(gameId), JSON.stringify({ ...payload, at: Date.now() }));
    } catch (e) {
      console.error('save failed for', gameId, e.message);
    }
  }, 400));
}

export function load(gameId) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(gameId), 'utf8'));
  } catch {
    return null;
  }
}

export function clear(gameId) {
  clearTimeout(timers.get(gameId));
  timers.delete(gameId);
  try { fs.unlinkSync(fileFor(gameId)); } catch {}
}

// Summaries for the hub screen ("Resume" badges).
export function summaries() {
  const out = {};
  let files = [];
  try { files = fs.readdirSync(DIR); } catch {}
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      out[d.gameId] = { at: d.at, seats: d.seats.map(s => ({ name: s.name, bot: !!s.bot })) };
    } catch {}
  }
  return out;
}
