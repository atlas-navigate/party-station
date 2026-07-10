// Box art for the retro hub.
// Covers come from the libretro thumbnails server (thumbnails.libretro.com,
// the same art RetroArch itself downloads) and are cached forever under
// data/art/, so after one online session the console shows art at a party
// with no internet. Everything here fails soft: no network → no art → the
// hub falls back to system icons.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { romTitle } from './emulator.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART_DIR = process.env.ART_DIR || path.join(ROOT, 'data', 'art');
const HOST = 'https://thumbnails.libretro.com';
const INDEX_TTL = 7 * 24 * 3600e3; // re-list a system's covers weekly
const RETRY_TTL = 6 * 3600e3;      // don't re-attempt a failed cover for 6h

// Party Station system id -> libretro-thumbnails repository name.
const REPOS = {
  arcade: 'MAME',
  'mame-libretro': 'MAME',
  fba: 'FBNeo - Arcade Games',
  nes: 'Nintendo - Nintendo Entertainment System',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  megadrive: 'Sega - Mega Drive - Genesis',
  mastersystem: 'Sega - Master System - Mark III',
  gamegear: 'Sega - Game Gear',
  gb: 'Nintendo - Game Boy',
  gbc: 'Nintendo - Game Boy Color',
  psx: 'Sony - PlayStation',
  n64: 'Nintendo - Nintendo 64',
  gba: 'Nintendo - Game Boy Advance',
  atari2600: 'Atari - 2600',
  pcengine: 'NEC - PC Engine - TurboGrafx 16',
};

const indexCache = new Map(); // repo -> { at, names }
const inflight = new Map();   // system/file -> Promise<path|null>
const misses = new Map();     // system/file -> last failed attempt (ms)

async function fetchOk(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`http ${r.status}`);
  return r;
}

// The thumbnail server is a plain directory listing — pull every cover name
// for a system once and cache it (memory + disk) so matching is offline-able.
async function repoIndex(repo) {
  const mem = indexCache.get(repo);
  if (mem && Date.now() - mem.at < INDEX_TTL) return mem.names;
  const file = path.join(ART_DIR, 'index-' + repo.replace(/[^a-z0-9]+/gi, '_') + '.json');
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  if (disk && Date.now() - disk.at < INDEX_TTL) { indexCache.set(repo, disk); return disk.names; }
  try {
    const html = await (await fetchOk(`${HOST}/${encodeURIComponent(repo)}/Named_Boxarts/`, 20000)).text();
    const names = [...new Set([...html.matchAll(/href="([^"]+)\.png"/gi)].map(m => {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }).map(n => n.split('/').pop()))];
    if (!names.length) throw new Error('empty index');
    const entry = { at: Date.now(), names };
    fs.mkdirSync(ART_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entry));
    indexCache.set(repo, entry);
    return names;
  } catch (e) {
    if (disk) { indexCache.set(repo, disk); return disk.names; } // stale beats none
    throw e;
  }
}

// "Pokemon Blue.gb" must find "Pokemon - Blue Version (USA, Europe) (SGB
// Enhanced).png": compare bags of words, ignoring case/accents/punctuation
// and (region) [dump] tags. Every word of the ROM's title must appear in the
// cover's name; among those, the name with the fewest extra words wins.
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

function bestMatch(title, names) {
  const want = norm(title).split(' ').filter(Boolean);
  if (!want.length) return null;
  let best = null, fewestExtra = Infinity;
  for (const name of names) {
    const have = norm(name).split(' ').filter(Boolean);
    const set = new Set(have);
    if (!want.every(t => set.has(t))) continue;
    const extra = have.length - want.length;
    if (extra < fewestExtra) { fewestExtra = extra; best = name; }
  }
  return best;
}

async function download(systemId, repo, file, dest) {
  const name = bestMatch(romTitle(systemId, file), await repoIndex(repo));
  if (!name) throw new Error('no cover matched');
  const r = await fetchOk(`${HOST}/${encodeURIComponent(repo)}/Named_Boxarts/${encodeURIComponent(name)}.png`, 30000);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100) throw new Error('empty cover');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + '.tmp', buf);
  fs.renameSync(dest + '.tmp', dest);
  console.log(`art: cached "${name}" for ${systemId}/${file}`);
  return dest;
}

// Resolve a ROM's cover: cached file if present, otherwise fetch it now
// (deduped across the burst of requests a hub render fires) — the TV's
// <img> request simply waits, so covers appear on first browse when online.
export async function getArt(systemId, file) {
  if (path.basename(file) !== file) return null; // no traversal
  const repo = REPOS[systemId];
  if (!repo) return null;
  const dest = path.join(ART_DIR, systemId, file + '.png');
  try { fs.accessSync(dest); return dest; } catch {}
  const key = `${systemId}/${file}`;
  if (Date.now() - (misses.get(key) || 0) < RETRY_TTL) return null;
  if (!inflight.has(key)) {
    inflight.set(key, download(systemId, repo, file, dest)
      .catch(e => { misses.set(key, Date.now()); console.log(`art: none for ${key} (${e.message})`); return null; })
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}
