// ROM library over HTTP for the /roms upload page: list, upload, delete.
// Uploads stream straight to disk (a PS1 .chd can be hundreds of MB — never
// buffer in RAM on a 2GB Pi) and are routed to the right RetroPie folder by
// file extension unless the client names a system explicitly.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { ROMS_DIR, SYSTEMS } from './emulator.js';

// One upload target per distinct ROM folder ('mame-libretro'/'fba' are
// alternate arcade folders — 'arcade' is the canonical one).
const TARGETS = SYSTEMS.filter(s => !['mame-libretro', 'fba'].includes(s.id));

// Extension → default system. '.zip' and '.bin' are ambiguous (a zip could be
// a console ROM, a lone .bin could be PS1) — the page lets users override.
const EXT_ROUTE = {
  '.nes': 'nes',
  '.sfc': 'snes', '.smc': 'snes',
  '.md': 'megadrive', '.gen': 'megadrive', '.bin': 'megadrive',
  '.cue': 'psx', '.chd': 'psx', '.pbp': 'psx', '.m3u': 'psx',
  '.z64': 'n64', '.n64': 'n64', '.v64': 'n64',
  '.gba': 'gba',
  '.zip': 'arcade',
};

const MAX_BYTES = 4 * 1024 ** 3;

// One folder to scp into: anything dropped in ROMS_DIR/incoming is sorted
// into the right system folder once the file stops growing.
export const INCOMING = 'incoming';
const SORT_INTERVAL = Number(process.env.ROM_SORT_INTERVAL || 4000);

export function routeFor(filename) {
  return EXT_ROUTE[path.extname(filename).toLowerCase()] || null;
}

// A .zip defaults to "arcade", but console ROMs often travel zipped too —
// and a console zip fed to MAME dies at launch. Peek at the zip's central
// directory (cheap: two reads, no extraction) and route by what's inside.
// Anything unrecognized (real MAME sets are .rom/.bin soup) stays arcade.
const ZIP_INNER = {
  '.nes': 'nes', '.sfc': 'snes', '.smc': 'snes',
  '.md': 'megadrive', '.gen': 'megadrive',
  '.gb': 'gb', '.gbc': 'gbc', '.gba': 'gba',
  '.z64': 'n64', '.n64': 'n64', '.v64': 'n64',
};

export function sniffZipSystem(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    // End-of-central-directory record sits in the last 65557 bytes.
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOff = tail.readUInt32LE(eocd + 16);
    if (cdSize <= 0 || cdSize > 4 * 1024 * 1024 || cdOff + cdSize > size) return null;
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    let p = 0;
    while (p + 46 <= cdSize && cd.readUInt32LE(p) === 0x02014b50) {
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const inner = cd.toString('utf8', p + 46, p + 46 + nameLen);
      const sys = ZIP_INNER[path.extname(inner).toLowerCase()];
      if (sys) return sys;
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

function cleanName(raw) {
  const name = path.basename(String(raw || '').trim());
  if (!name || name.startsWith('.') || name.includes('/') || name.includes('\\')) return null;
  return name;
}

function systemDir(systemId) {
  const sys = TARGETS.find(s => s.id === systemId);
  if (!sys) return null;
  return path.join(ROMS_DIR, sys.id);
}

export function library() {
  return {
    romsDir: ROMS_DIR,
    systems: TARGETS.map(s => {
      let files = [];
      try {
        files = fs.readdirSync(path.join(ROMS_DIR, s.id))
          .filter(f => s.ext.includes(path.extname(f).toLowerCase()))
          .sort()
          .map(f => {
            let size = 0;
            try { size = fs.statSync(path.join(ROMS_DIR, s.id, f)).size; } catch {}
            return { file: f, size };
          });
      } catch {}
      return { id: s.id, name: s.name, icon: s.icon, ext: s.ext, files };
    }),
  };
}

// ---------------------------------------------------------- incoming sorter

const seen = new Map();   // filename -> {size, mtime} from the previous tick
const warned = new Set(); // unroutable files we already logged about

// A lone .bin usually means Genesis, but next to a same-named .cue it's a
// PS1 disc image and must stay with its cue sheet. Zips get sniffed.
function routeIncoming(file, siblings, fullPath) {
  const ext = path.extname(file).toLowerCase();
  const base = file.slice(0, -ext.length).replace(/\s*\(track \d+\)/i, '');
  if (ext === '.bin') {
    const hasCue = siblings.some(f => f.toLowerCase() === (base + '.cue').toLowerCase())
      || fs.existsSync(path.join(ROMS_DIR, 'psx', base + '.cue'));
    if (hasCue) return 'psx';
  }
  if (ext === '.zip') {
    const sniffed = sniffZipSystem(fullPath);
    if (sniffed) return sniffed;
  }
  return routeFor(file);
}

function sortIncoming(onChange) {
  if (!fs.existsSync(ROMS_DIR)) return; // no RetroPie yet — check again next tick
  const dir = path.join(ROMS_DIR, INCOMING);
  fs.mkdirSync(dir, { recursive: true });
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.endsWith('.part')); } catch { return; }
  let moved = false;
  // Route .cue files first so their .bin tracks see them in place.
  files.sort((a, b) => (a.endsWith('.cue') ? -1 : 0) - (b.endsWith('.cue') ? -1 : 0));
  for (const file of files) {
    const src = path.join(dir, file);
    let st;
    try { st = fs.statSync(src); } catch { continue; }
    if (!st.isFile()) continue;
    // Wait until the file stops changing (it may still be mid-scp).
    const prev = seen.get(file);
    seen.set(file, { size: st.size, mtime: st.mtimeMs });
    if (!prev || prev.size !== st.size || prev.mtime !== st.mtimeMs) continue;

    const systemId = routeIncoming(file, files, src);
    if (!systemId) {
      if (!warned.has(file)) {
        warned.add(file);
        console.log(`roms: don't know where "${file}" goes — leaving it in ${INCOMING}/`);
      }
      continue;
    }
    const destDir = path.join(ROMS_DIR, systemId);
    try {
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(src, path.join(destDir, file));
      seen.delete(file);
      warned.delete(file);
      console.log(`roms: sorted ${INCOMING}/${file} → ${systemId}/`);
      moved = true;
    } catch (e) {
      console.error(`roms: could not sort ${file}:`, e.message);
    }
  }
  for (const file of seen.keys()) if (!files.includes(file)) seen.delete(file);
  if (moved) onChange?.();
}

export function startIncomingSorter({ onChange }) {
  const timer = setInterval(() => sortIncoming(onChange), SORT_INTERVAL);
  timer.unref?.();
  sortIncoming(onChange);
}

export function romsRouter({ onChange }) {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(library()));

  // POST /api/roms?name=<file>&system=<id|auto> — raw body is the file.
  router.post('/', (req, res) => {
    const name = cleanName(req.query.name);
    if (!name) return res.status(400).json({ err: 'Bad or missing file name' });

    const wanted = String(req.query.system || 'auto');
    const systemId = wanted === 'auto' ? routeFor(name) : wanted;
    const dir = systemId && systemDir(systemId);
    if (!dir) {
      return res.status(400).json({
        err: wanted === 'auto'
          ? `Don't know where "${path.extname(name) || name}" files go — pick a system`
          : 'Unknown system',
        systems: TARGETS.map(s => s.id),
      });
    }
    if (Number(req.headers['content-length'] || 0) > MAX_BYTES) {
      return res.status(413).json({ err: 'File too large' });
    }

    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name);
    if (!dest.startsWith(dir + path.sep)) return res.status(400).json({ err: 'Bad path' });
    const tmp = dest + '.part';

    let written = 0;
    let failed = false;
    const out = fs.createWriteStream(tmp);
    const abort = (code, err) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.promises.unlink(tmp).catch(() => {});
      if (!res.headersSent) res.status(code).json({ err });
    };
    req.on('data', chunk => {
      written += chunk.length;
      if (written > MAX_BYTES) { req.destroy(); abort(413, 'File too large'); }
    });
    req.on('aborted', () => abort(400, 'Upload interrupted'));
    out.on('error', e => abort(500, 'Could not write file: ' + e.message));
    out.on('finish', () => {
      if (failed) return;
      // Auto-routed zips: now that the bytes are on disk, look inside —
      // a zipped console ROM belongs with its console, not in arcade.
      let finalSystem = systemId;
      let finalDest = dest;
      if (wanted === 'auto' && path.extname(name).toLowerCase() === '.zip') {
        const sniffed = sniffZipSystem(tmp);
        const sniffedDir = sniffed && sniffed !== systemId && systemDir(sniffed);
        if (sniffedDir) {
          finalSystem = sniffed;
          finalDest = path.join(sniffedDir, name);
        }
      }
      try {
        fs.mkdirSync(path.dirname(finalDest), { recursive: true });
        fs.renameSync(tmp, finalDest);
      } catch (e) { return abort(500, 'Could not save file: ' + e.message); }
      console.log(`roms: uploaded ${name} → ${finalSystem} (${written} bytes)`);
      onChange?.();
      res.json({ ok: true, system: finalSystem, file: name, size: written });
    });
    req.pipe(out);
  });

  router.delete('/:system/:file', (req, res) => {
    const dir = systemDir(req.params.system);
    const name = cleanName(req.params.file);
    if (!dir || !name) return res.status(400).json({ err: 'Bad system or file name' });
    const target = path.join(dir, name);
    if (!target.startsWith(dir + path.sep)) return res.status(400).json({ err: 'Bad path' });
    fs.unlink(target, err => {
      if (err) return res.status(404).json({ err: 'No such ROM' });
      console.log(`roms: deleted ${req.params.system}/${name}`);
      onChange?.();
      res.json({ ok: true });
    });
  });

  return router;
}
