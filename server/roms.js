// ROM library over HTTP for the /roms upload page: list, upload, delete.
// Uploads stream straight to disk (a PS1 .chd can be hundreds of MB — never
// buffer in RAM on a 2GB Pi) and are routed to the right RetroPie folder by
// file extension unless the client names a system explicitly.
import express from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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

// BIOS dumps go to RetroPie/BIOS (RetroArch's system dir), not a ROM
// folder — recognized by their canonical file names, however they arrive.
const BIOS_DIR = path.join(ROMS_DIR, '..', 'BIOS');
const BIOS_NAMES = /^(scph[\w-]+\.bin|psxonpsp660\.bin|ps1_rom\.bin)$/i;

const destDirFor = sysId => (sysId === 'bios' ? BIOS_DIR : path.join(ROMS_DIR, sysId));

// One folder to scp into: anything dropped in ROMS_DIR/incoming is sorted
// into the right system folder once the file stops growing.
export const INCOMING = 'incoming';
const SORT_INTERVAL = Number(process.env.ROM_SORT_INTERVAL || 4000);

export function routeFor(filename) {
  return EXT_ROUTE[path.extname(filename).toLowerCase()] || null;
}

// A .zip defaults to "arcade", but console games often travel zipped too —
// and a console zip fed to MAME dies at launch. Peek at the zip's central
// directory (cheap: two reads) and, when it holds console ROMs or PS1 disc
// images, EXTRACT them into the right system folder instead of parking the
// zip. Real MAME sets (.rom/.bin soup inside) are left untouched.
const ZIP_INNER = {
  '.nes': 'nes', '.sfc': 'snes', '.smc': 'snes',
  '.md': 'megadrive', '.gen': 'megadrive',
  '.gb': 'gb', '.gbc': 'gbc', '.gba': 'gba',
  '.z64': 'n64', '.n64': 'n64', '.v64': 'n64',
  '.chd': 'psx', '.pbp': 'psx', '.cue': 'psx',
};

// First probe: is this file actually a zip? Downloads regularly arrive as
// 7z/rar renamed .zip, which no emulator (or our extractor) can read.
const ARCHIVE_MAGIC = [
  [[0x50, 0x4b], 'zip'],
  [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], '7-Zip archive'],
  [[0x52, 0x61, 0x72, 0x21], 'RAR archive'],
  [[0x1f, 0x8b], 'gzip archive'],
];

export function archiveKind(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(8);
    const n = fs.readSync(fd, head, 0, 8, 0);
    fs.closeSync(fd);
    for (const [sig, label] of ARCHIVE_MAGIC) {
      if (n >= sig.length && sig.every((b, i) => head[i] === b)) return label;
    }
    return null;
  } catch { return null; }
}

export function zipEntries(file) {
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
    const entries = [];
    let p = 0;
    while (p + 46 <= cdSize && cd.readUInt32LE(p) === 0x02014b50) {
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      entries.push({
        name: cd.toString('utf8', p + 46, p + 46 + nameLen),
        method: cd.readUInt16LE(p + 10),
        csize: cd.readUInt32LE(p + 20),
        usize: cd.readUInt32LE(p + 24),
        localOff: cd.readUInt32LE(p + 42),
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

// Systems a Pi 4 can't emulate: name them instead of letting their zips
// masquerade as arcade sets that crash at launch.
const ZIP_UNSUPPORTED = {
  '.nds': 'Nintendo DS', '.3ds': 'Nintendo 3DS', '.cia': 'Nintendo 3DS',
  '.wbfs': 'Wii', '.rvz': 'GameCube/Wii', '.gcm': 'GameCube', '.gcz': 'GameCube',
  '.cso': 'PSP', '.wux': 'Wii U', '.xci': 'Switch', '.nsp': 'Switch',
};

function sniffEntries(entries) {
  for (const e of entries || []) {
    if (BIOS_NAMES.test(path.basename(e.name))) return 'bios';
    const sys = ZIP_INNER[path.extname(e.name).toLowerCase()];
    if (sys) return sys;
  }
  return null;
}

function sniffUnsupported(entries) {
  for (const e of entries || []) {
    const label = ZIP_UNSUPPORTED[path.extname(e.name).toLowerCase()];
    if (label) return label;
  }
  return null;
}

export function sniffZipSystem(file) {
  return sniffEntries(zipEntries(file));
}

// Stream one zip entry to disk — never buffers whole files (a PS1 .chd can
// be hundreds of MB and the Pi has 2GB). Stored and deflate entries only;
// zip64 (>4GB members) is rejected and handled by the caller's fallback.
function extractEntry(src, entry, dest) {
  return new Promise((resolve, reject) => {
    if (entry.method !== 0 && entry.method !== 8) return reject(new Error('unsupported compression'));
    if (!entry.csize || entry.csize === 0xFFFFFFFF || entry.localOff === 0xFFFFFFFF) {
      return reject(new Error('unsupported zip layout'));
    }
    let dataStart;
    try {
      const fd = fs.openSync(src, 'r');
      const hdr = Buffer.alloc(30);
      fs.readSync(fd, hdr, 0, 30, entry.localOff);
      fs.closeSync(fd);
      if (hdr.readUInt32LE(0) !== 0x04034b50) return reject(new Error('bad zip entry'));
      dataStart = entry.localOff + 30 + hdr.readUInt16LE(26) + hdr.readUInt16LE(28);
    } catch (e) { return reject(e); }
    const inp = fs.createReadStream(src, { start: dataStart, end: dataStart + entry.csize - 1 });
    const out = fs.createWriteStream(dest + '.part');
    let settled = false;
    const fin = err => {
      if (settled) return;
      settled = true;
      if (err) {
        out.destroy();
        fs.promises.unlink(dest + '.part').catch(() => {});
        reject(err);
      } else {
        try { fs.renameSync(dest + '.part', dest); resolve(); }
        catch (e) { reject(e); }
      }
    };
    out.on('finish', () => fin());
    inp.on('error', fin);
    out.on('error', fin);
    if (entry.method === 8) {
      const inflate = zlib.createInflateRaw();
      inflate.on('error', fin);
      inp.pipe(inflate).pipe(out);
    } else {
      inp.pipe(out);
    }
  });
}

// Pull every recognized console/disc file out of a zip into its system
// folder. A .cue means a PS1 disc set — take all its files (.bin tracks
// included). Returns [{file, system}] of what landed.
const DISC_SET_EXT = new Set(['.cue', '.bin', '.img', '.sub', '.ccd', '.chd', '.pbp']);

export async function extractConsoleZip(src, entries) {
  const hasCue = entries.some(e => e.name.toLowerCase().endsWith('.cue'));
  const extracted = [];
  for (const e of entries) {
    if (!e.csize || e.name.endsWith('/')) continue;
    const base = path.basename(e.name);
    if (!base || base.startsWith('.')) continue;
    const ext = path.extname(base).toLowerCase();
    const sysId = BIOS_NAMES.test(base) ? 'bios'
      : ZIP_INNER[ext] || (hasCue && DISC_SET_EXT.has(ext) ? 'psx' : null);
    if (!sysId || (sysId !== 'bios' && !systemDir(sysId))) continue;
    const dir = destDirFor(sysId);
    fs.mkdirSync(dir, { recursive: true });
    await extractEntry(src, e, path.join(dir, base));
    extracted.push({ file: base, system: sysId });
  }
  return extracted;
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

const seen = new Map();      // filename -> {size, mtime} from the previous tick
const warned = new Set();    // unroutable files we already logged about
const extracting = new Set(); // zips currently being unpacked (skip re-entry)

// A lone .bin usually means Genesis, but next to a same-named .cue it's a
// PS1 disc image and must stay with its cue sheet. (Console zips never
// reach here — sortIncoming unpacks them first.)
function routeIncoming(file, siblings) {
  const ext = path.extname(file).toLowerCase();
  const base = file.slice(0, -ext.length).replace(/\s*\(track \d+\)/i, '');
  if (ext === '.bin') {
    const hasCue = siblings.some(f => f.toLowerCase() === (base + '.cue').toLowerCase())
      || fs.existsSync(path.join(ROMS_DIR, 'psx', base + '.cue'));
    if (hasCue) return 'psx';
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

    // BIOS dumps head to RetroPie/BIOS by name, whatever way they arrive.
    if (BIOS_NAMES.test(file)) {
      try {
        fs.mkdirSync(BIOS_DIR, { recursive: true });
        fs.renameSync(src, path.join(BIOS_DIR, file));
        seen.delete(file);
        console.log(`roms: sorted ${INCOMING}/${file} → BIOS/`);
        moved = true;
      } catch (e) {
        console.error(`roms: could not sort ${file}:`, e.message);
      }
      continue;
    }

    // Console games inside zips get unpacked to their system, not moved.
    if (path.extname(file).toLowerCase() === '.zip' && !extracting.has(src)) {
      const kind = archiveKind(src);
      if (kind !== 'zip') {
        if (!warned.has(file)) {
          warned.add(file);
          console.log(`roms: "${file}" is ${kind ? 'really a ' + kind : 'not actually a zip'} — leaving it in ${INCOMING}/`);
        }
        continue;
      }
      const entries = zipEntries(src);
      const unsupported = sniffUnsupported(entries);
      if (unsupported) {
        if (!warned.has(file)) {
          warned.add(file);
          console.log(`roms: "${file}" is a ${unsupported} game — this console can't emulate that; leaving it in ${INCOMING}/`);
        }
        continue;
      }
      const sniffed = sniffEntries(entries);
      if (sniffed) {
        extracting.add(src);
        extractConsoleZip(src, entries)
          .then(done => {
            if (!done.length) throw new Error('nothing extractable');
            fs.unlinkSync(src);
            seen.delete(file);
            console.log(`roms: unpacked ${INCOMING}/${file} → ${done.map(d => `${d.system}/${d.file}`).join(', ')}`);
            onChange?.();
          })
          .catch(e => {
            console.error(`roms: could not unpack ${file}:`, e.message);
            try { // park the zip with its sniffed system rather than lose it
              fs.mkdirSync(destDirFor(sniffed), { recursive: true });
              fs.renameSync(src, path.join(destDirFor(sniffed), file));
              onChange?.();
            } catch {}
          })
          .finally(() => extracting.delete(src));
        continue;
      }
    }

    const systemId = routeIncoming(file, files);
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

// One-time self-heal at boot: older versions parked every .zip in arcade/,
// including zipped console games — unpack any of those into their systems.
// Genuine arcade sets sniff to nothing and are left exactly as they are.
async function rescueMisplacedZips(onChange) {
  const dir = path.join(ROMS_DIR, 'arcade');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.zip')); } catch { return; }
  for (const file of files) {
    const src = path.join(dir, file);
    const entries = zipEntries(src);
    // Zips of systems the Pi can't emulate get quarantined out of the
    // launcher (kept on disk in roms/unsupported/) so they stop posing as
    // playable arcade games.
    const unsupported = sniffUnsupported(entries);
    if (unsupported) {
      try {
        const quarantine = path.join(ROMS_DIR, 'unsupported');
        fs.mkdirSync(quarantine, { recursive: true });
        fs.renameSync(src, path.join(quarantine, file));
        console.log(`roms: arcade/${file} is a ${unsupported} game (not emulatable here) — moved to roms/unsupported/`);
        onChange?.();
      } catch (e) {
        console.error(`roms: could not quarantine arcade/${file}:`, e.message);
      }
      continue;
    }
    const sniffed = sniffEntries(entries);
    if (!sniffed) continue;
    try {
      const done = await extractConsoleZip(src, entries);
      if (done.length) {
        fs.unlinkSync(src);
        console.log(`roms: rescued arcade/${file} → ${done.map(d => `${d.system}/${d.file}`).join(', ')}`);
        onChange?.();
      }
    } catch (e) {
      console.error(`roms: could not rescue arcade/${file}:`, e.message);
    }
  }
}

export function startIncomingSorter({ onChange }) {
  const timer = setInterval(() => sortIncoming(onChange), SORT_INTERVAL);
  timer.unref?.();
  sortIncoming(onChange);
  rescueMisplacedZips(onChange).catch(() => {});
}

export function romsRouter({ onChange }) {
  const router = express.Router();

  router.get('/', (_req, res) => res.json(library()));

  // POST /api/roms?name=<file>&system=<id|auto> — raw body is the file.
  router.post('/', (req, res) => {
    const name = cleanName(req.query.name);
    if (!name) return res.status(400).json({ err: 'Bad or missing file name' });

    const wanted = String(req.query.system || 'auto');
    const isBios = BIOS_NAMES.test(name);
    const systemId = isBios ? 'bios' : wanted === 'auto' ? routeFor(name) : wanted;
    const dir = isBios ? BIOS_DIR : systemId && systemDir(systemId);
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
    out.on('finish', async () => {
      if (failed) return;
      let finalSystem = systemId;
      let finalDest = dest;
      // Auto-routed zips: now that the bytes are on disk, look inside — a
      // zipped console game gets unpacked into its system; only true
      // arcade sets stay zipped.
      // Every zip gets probed — even with an explicit system from the
      // client (stale pages once mislabeled console zips as arcade).
      // Evidence inside the zip beats what the request claimed.
      if (!isBios && path.extname(name).toLowerCase() === '.zip' && archiveKind(tmp) !== 'zip') {
        const kind = archiveKind(tmp);
        if (wanted === 'auto') {
          return abort(415, kind
            ? `"${name}" is really a ${kind} renamed to .zip — extract it and upload the game file inside.`
            : `"${name}" isn't actually a zip file — check the download.`);
        }
        // explicit non-zip .zip: honor the caller, they may know better
      } else if (!isBios && path.extname(name).toLowerCase() === '.zip') {
        const entries = zipEntries(tmp);
        const unsupported = sniffUnsupported(entries);
        if (unsupported) {
          return abort(415, `That's a ${unsupported} game — this console can't emulate ${unsupported}.`);
        }
        const sniffed = sniffEntries(entries);
        if (sniffed && sniffed !== wanted && wanted !== 'auto') {
          console.log(`roms: "${name}" was uploaded as ${wanted} but contains ${sniffed} — probing wins`);
        }
        if (sniffed && (sniffed === 'bios' || systemDir(sniffed))) {
          try {
            const done = await extractConsoleZip(tmp, entries);
            if (done.length) {
              fs.unlinkSync(tmp);
              console.log(`roms: uploaded ${name} → unpacked ${done.map(d => `${d.system}/${d.file}`).join(', ')}`);
              onChange?.();
              return res.json({ ok: true, system: done[0].system, file: done[0].file, size: written, unpacked: done });
            }
          } catch (e) {
            console.error(`roms: could not unpack ${name}:`, e.message);
          }
          // Couldn't unpack — at least park the zip with the right system.
          finalSystem = sniffed;
          finalDest = path.join(destDirFor(sniffed), name);
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
