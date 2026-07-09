// RetroPie / RetroArch integration — the "Cabinet" category.
// Scans standard RetroPie ROM folders and launches RetroArch fullscreen on
// the Pi's display; when the emulator exits, Party Station takes back over.
// ROMs are never bundled: bring dumps of games you legally own.
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const ROMS_DIR = process.env.ROMS_DIR || path.join(os.homedir(), 'RetroPie', 'roms');
const LIBRETRO_DIRS = [
  process.env.LIBRETRO_DIR,
  '/opt/retropie/libretrocores',
  '/usr/lib/aarch64-linux-gnu/libretro',
  '/usr/lib/arm-linux-gnueabihf/libretro',
  '/usr/lib/x86_64-linux-gnu/libretro',
  path.join(os.homedir(), '.config/retroarch/cores'),
].filter(Boolean);

export const SYSTEMS = [
  { id: 'arcade', name: 'Arcade (MAME)', icon: '🕹️', cores: ['mame2003_plus_libretro.so', 'fbneo_libretro.so', 'mame2003_libretro.so'], ext: ['.zip'] },
  { id: 'mame-libretro', name: 'Arcade (MAME)', icon: '🕹️', cores: ['mame2003_plus_libretro.so', 'mame2003_libretro.so'], ext: ['.zip'] },
  { id: 'fba', name: 'Arcade (FBNeo)', icon: '🕹️', cores: ['fbneo_libretro.so'], ext: ['.zip'] },
  { id: 'nes', name: 'NES', icon: '🎮', cores: ['fceumm_libretro.so', 'nestopia_libretro.so'], ext: ['.nes', '.zip'] },
  { id: 'snes', name: 'SNES', icon: '🎮', cores: ['snes9x_libretro.so', 'snes9x2010_libretro.so'], ext: ['.sfc', '.smc', '.zip'] },
  { id: 'megadrive', name: 'Genesis', icon: '🎮', cores: ['genesis_plus_gx_libretro.so', 'picodrive_libretro.so'], ext: ['.md', '.gen', '.bin', '.zip'] },
  { id: 'mastersystem', name: 'Master System', icon: '🎮', cores: ['genesis_plus_gx_libretro.so', 'picodrive_libretro.so'], ext: ['.sms', '.zip'] },
  { id: 'gamegear', name: 'Game Gear', icon: '🎮', cores: ['genesis_plus_gx_libretro.so'], ext: ['.gg', '.zip'] },
  { id: 'gb', name: 'Game Boy', icon: '🎮', cores: ['gambatte_libretro.so'], ext: ['.gb', '.zip'] },
  { id: 'gbc', name: 'Game Boy Color', icon: '🎮', cores: ['gambatte_libretro.so'], ext: ['.gbc', '.zip'] },
  { id: 'psx', name: 'PlayStation', icon: '💿', cores: ['pcsx_rearmed_libretro.so', 'duckstation_libretro.so'], ext: ['.cue', '.chd', '.pbp', '.m3u', '.iso', '.img'] },
  { id: 'n64', name: 'Nintendo 64', icon: '🎮', cores: ['mupen64plus_next_libretro.so', 'parallel_n64_libretro.so'], ext: ['.z64', '.n64', '.v64'] },
  { id: 'gba', name: 'Game Boy Advance', icon: '🎮', cores: ['mgba_libretro.so', 'gpsp_libretro.so'], ext: ['.gba'] },
  { id: 'atari2600', name: 'Atari 2600', icon: '🕹️', cores: ['stella2014_libretro.so', 'stella_libretro.so'], ext: ['.a26'] },
  { id: 'pcengine', name: 'TurboGrafx-16', icon: '🎮', cores: ['mednafen_pce_fast_libretro.so', 'mednafen_supergrafx_libretro.so'], ext: ['.pce'] },
];

let retroarchBin = null;
let scanned = { at: 0, systems: [] };
export let current = null; // { system, file, title, proc }

function findRetroarch() {
  if (retroarchBin) return retroarchBin;
  const candidates = [
    process.env.RETROARCH_BIN,
    '/opt/retropie/emulators/retroarch/bin/retroarch',
    '/usr/bin/retroarch',
    '/usr/local/bin/retroarch',
  ].filter(Boolean);
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); retroarchBin = c; return c; } catch {}
  }
  try {
    retroarchBin = execFileSync('which', ['retroarch']).toString().trim() || null;
  } catch { retroarchBin = null; }
  return retroarchBin;
}

function findCore(names) {
  for (const dir of LIBRETRO_DIRS) {
    for (const name of names) {
      // RetroPie nests cores in per-package dirs (lr-mame2003-plus/…so).
      const flat = path.join(dir, name);
      try { fs.accessSync(flat); return flat; } catch {}
      let subdirs = [];
      try { subdirs = fs.readdirSync(dir); } catch { continue; }
      for (const sub of subdirs) {
        const nested = path.join(dir, sub, name);
        try { fs.accessSync(nested); return nested; } catch {}
      }
    }
  }
  return null;
}

const cleanTitle = f => f
  .replace(/\.[^.]+$/, '')
  .replace(/[_.]/g, ' ')
  .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '') // strip (USA) [!] region tags
  .trim() || f;

export function scan(force = false) {
  if (!force && Date.now() - scanned.at < 60_000) return scanned.systems;
  const systems = [];
  if (findRetroarch()) {
    const seen = new Set();
    for (const sys of SYSTEMS) {
      if (seen.has(sys.name)) continue;
      const dir = path.join(ROMS_DIR, sys.id);
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      const core = findCore(sys.cores);
      if (!core) continue;
      const games = files
        .filter(f => sys.ext.includes(path.extname(f).toLowerCase()))
        .sort()
        .map(f => ({ file: f, title: cleanTitle(f) }));
      if (games.length) {
        seen.add(sys.name);
        systems.push({ id: sys.id, name: sys.name, icon: sys.icon, core, games });
      }
    }
  }
  scanned = { at: Date.now(), systems };
  return systems;
}

// Whether the emulator + a core for this system exist on this machine —
// lets the /roms page mark systems as ready vs "re-run setup for this one".
export function coreAvailable(systemId) {
  const sys = SYSTEMS.find(s => s.id === systemId);
  return !!(sys && findRetroarch() && findCore(sys.cores));
}

export function summary() {
  return {
    available: scan().length > 0,
    systems: scan().map(s => ({ id: s.id, name: s.name, icon: s.icon, games: s.games })),
  };
}

export function launch(systemId, file, onExit) {
  if (current) return { err: 'An emulator is already running' };
  const sys = scan(true).find(s => s.id === systemId);
  if (!sys) return { err: 'That system isn’t set up' };
  const game = sys.games.find(g => g.file === file);
  if (!game) return { err: 'ROM not found — rescan?' };
  const romPath = path.join(ROMS_DIR, sys.id, game.file);
  if (!romPath.startsWith(path.join(ROMS_DIR, sys.id))) return { err: 'Bad path' };

  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const env = {
    ...process.env,
    // Reach the Pi's graphical session from the systemd service.
    DISPLAY: process.env.DISPLAY || ':0',
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0',
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`,
  };
  // Party-console defaults RetroArch doesn't ship with: the left analog
  // stick doubles as the d-pad (guests push sticks), and BIOS files are
  // looked up in RetroPie/BIOS no matter which retroarch.cfg is in play.
  const extraCfg = path.join(os.tmpdir(), 'party-station-retroarch-append.cfg');
  const args = ['-L', sys.core, romPath, '--fullscreen'];
  try {
    fs.writeFileSync(extraCfg,
      [1, 2, 3, 4].map(n => `input_player${n}_analog_dpad_mode = "1"`).join('\n')
      + `\nsystem_directory = "${path.join(ROMS_DIR, '..', 'BIOS')}"\n`);
    args.push('--appendconfig', extraCfg);
  } catch {}
  let proc;
  try {
    proc = spawn(findRetroarch(), args, {
      env, stdio: ['ignore', 'ignore', 'pipe'], detached: false,
    });
  } catch (e) {
    return { err: 'Could not start RetroArch: ' + e.message };
  }
  let stderrTail = '';
  proc.stderr.on('data', d => { stderrTail = (stderrTail + d).slice(-800); });
  const startedAt = Date.now();
  current = { system: sys.name, icon: sys.icon, title: game.title, proc };
  console.log(`emulator: launched ${game.title} (${sys.id})`);
  proc.on('exit', (code, signal) => {
    const ms = Date.now() - startedAt;
    lastExit = {
      title: game.title, system: sys.id, file: game.file,
      code, signal, ms,
      stderr: stderrTail.split('\n').filter(Boolean).slice(-3),
    };
    console.log(`emulator: exited (${code})`, code ? stderrTail.split('\n').slice(-3).join(' | ') : '');
    current = null;
    // A launch that dies within seconds (and wasn't killed on purpose)
    // almost always means the ROM doesn't fit the core — tell the players.
    const crashed = !signal && ((code && ms < 20000) || ms < 3000);
    onExit?.(code, { crashed, title: game.title, system: sys.id });
  });
  proc.on('error', () => { current = null; onExit?.(-1, { crashed: true, title: game.title, system: sys.id }); });
  return {};
}

let lastExit = null; // most recent emulator exit, for /api/status debugging
export function lastExitInfo() { return lastExit; }

export function kill() {
  if (current?.proc) {
    try { current.proc.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { current?.proc.kill('SIGKILL'); } catch {} }, 3000);
  }
}

export function publicState() {
  return current ? { title: current.title, system: current.system, icon: current.icon } : null;
}
