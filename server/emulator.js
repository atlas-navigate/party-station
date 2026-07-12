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
  // Later arcade boards MAME 2003 (romset 0.78) can't run — zips must match
  // the MAME 0.139 set. Anything newer than this is beyond a Pi 4 anyway.
  { id: 'mame2010', name: 'Arcade (MAME 2010)', icon: '🕹️', cores: ['mame2010_libretro.so'], ext: ['.zip'] },
  // Capcom Play System boards, run by FBNeo (or the split FBAlpha 2012 CPS
  // cores if installed). CPS-1/2 are easy for a Pi 4; CPS-3 is borderline.
  { id: 'cps1', name: 'Capcom (CPS-1)', icon: '🕹️', cores: ['fbneo_libretro.so', 'fbalpha2012_cps1_libretro.so'], ext: ['.zip'] },
  { id: 'cps2', name: 'Capcom (CPS-2)', icon: '🕹️', cores: ['fbneo_libretro.so', 'fbalpha2012_cps2_libretro.so'], ext: ['.zip'] },
  { id: 'cps3', name: 'Capcom (CPS-3)', icon: '🕹️', cores: ['fbneo_libretro.so', 'fbalpha2012_cps3_libretro.so'], ext: ['.zip'] },
  // Neo Geo needs the neogeo.zip BIOS alongside the game zips (or in
  // RetroPie/BIOS — launch() points RetroArch's system dir there).
  { id: 'neogeo', name: 'Neo Geo', icon: '🕹️', cores: ['fbneo_libretro.so', 'fbalpha2012_neogeo_libretro.so'], ext: ['.zip'] },
  { id: 'nes', name: 'NES', icon: '🎮', cores: ['fceumm_libretro.so', 'nestopia_libretro.so'], ext: ['.nes', '.zip'] },
  { id: 'snes', name: 'SNES', icon: '🎮', cores: ['snes9x_libretro.so', 'snes9x2010_libretro.so'], ext: ['.sfc', '.smc', '.zip'] },
  { id: 'megadrive', name: 'Genesis', icon: '🎮', cores: ['genesis_plus_gx_libretro.so', 'picodrive_libretro.so'], ext: ['.md', '.gen', '.bin', '.zip'] },
  { id: 'mastersystem', name: 'Master System', icon: '🎮', cores: ['genesis_plus_gx_libretro.so', 'picodrive_libretro.so'], ext: ['.sms', '.zip'] },
  { id: 'gamegear', name: 'Game Gear', icon: '🎮', cores: ['genesis_plus_gx_libretro.so'], ext: ['.gg', '.zip'] },
  { id: 'gb', name: 'Game Boy', icon: '🎮', cores: ['gambatte_libretro.so'], ext: ['.gb', '.zip'] },
  { id: 'gbc', name: 'Game Boy Color', icon: '🎮', cores: ['gambatte_libretro.so'], ext: ['.gbc', '.zip'] },
  { id: 'psx', name: 'PlayStation', icon: '💿', cores: ['pcsx_rearmed_libretro.so', 'duckstation_libretro.so'], ext: ['.cue', '.chd', '.pbp', '.m3u', '.iso', '.img'] },
  // PPSSPP needs no PSP BIOS (it's a high-level emulator); RetroPie's
  // lr-ppsspp drops the assets it does need into RetroPie/BIOS/PPSSPP,
  // which launch() already points RetroArch's system_directory at.
  { id: 'psp', name: 'PSP', icon: '🎮', cores: ['ppsspp_libretro.so'], ext: ['.iso', '.cso', '.pbp', '.chd'] },
  // PS2 has no RetroPie-packaged core; the slot lights up if a core (Play!
  // needs no BIOS; LRPS2 wants one) is dropped in. Fair warning: a Pi 4
  // runs most PS2 discs far below full speed — this is a "try it" shelf.
  { id: 'ps2', name: 'PlayStation 2', icon: '💿', cores: ['play_libretro.so', 'pcsx2_libretro.so'], ext: ['.iso', '.chd', '.cso', '.elf'] },
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

// MAME zips are named by terse shortnames (mk2.zip, nbajam.zip) — map the
// common ones to real titles so the hub reads properly and box-art lookups
// (server/art.js matches by title) can find them.
const ARCADE_TITLES = {
  '10yard': '10-Yard Fight', 1941: '1941: Counter Attack', 1942: '1942',
  1943: '1943', 1944: '1944', '19xx': '19XX',
  arkanoid: 'Arkanoid', asteroid: 'Asteroids', avsp: 'Alien vs. Predator',
  berzerk: 'Berzerk',
  blitz: 'NFL Blitz', blitz99: 'NFL Blitz ’99', bombjack: 'Bomb Jack',
  btime: 'Burger Time', captcomm: 'Captain Commando', centiped: 'Centipede',
  contra: 'Contra', ddragon: 'Double Dragon', defender: 'Defender',
  digdug: 'Dig Dug', dino: 'Cadillacs and Dinosaurs',
  dkong: 'Donkey Kong', dkongjr: 'Donkey Kong Junior',
  dstlk: 'Darkstalkers', ffight: 'Final Fight', frogger: 'Frogger',
  galaga: 'Galaga', galaxian: 'Galaxian', garou: 'Garou: Mark of the Wolves',
  gauntlet: 'Gauntlet', ghouls: 'Ghouls ’n Ghosts',
  joust: 'Joust', klax: 'Klax', knights: 'Knights of the Round',
  kod: 'The King of Dragons', kof98: 'The King of Fighters ’98',
  kungfum: 'Kung-Fu Master', lastblad: 'The Last Blade',
  marble: 'Marble Madness', mercs: 'Mercs',
  missile: 'Missile Command', mk: 'Mortal Kombat', mk2: 'Mortal Kombat II',
  mk3: 'Mortal Kombat 3', msh: 'Marvel Super Heroes',
  mshvsf: 'Marvel Super Heroes vs. Street Fighter',
  mslug: 'Metal Slug', mslug2: 'Metal Slug 2',
  mslug3: 'Metal Slug 3', mslugx: 'Metal Slug X', mspacman: 'Ms. Pac-Man',
  mvsc: 'Marvel vs. Capcom', nbajam: 'NBA Jam', nbajamte: 'NBA Jam T.E.',
  outrun: 'Out Run', pacman: 'Pac-Man', paperboy: 'Paperboy',
  phoenix: 'Phoenix', popeye: 'Popeye', progear: 'Progear',
  puckman: 'Puck Man', punchout: 'Punch-Out!!', punisher: 'The Punisher',
  qbert: 'Q*bert', rampage: 'Rampage', robotron: 'Robotron 2084',
  samsho2: 'Samurai Shodown II', scramble: 'Scramble',
  sf2: 'Street Fighter II', sf2ce: 'Street Fighter II’: Champion Edition',
  sf2hf: 'Street Fighter II’: Hyper Fighting',
  sfa: 'Street Fighter Alpha', sfa2: 'Street Fighter Alpha 2',
  sfa3: 'Street Fighter Alpha 3',
  sfiii: 'Street Fighter III', sfiii2: 'Street Fighter III: 2nd Impact',
  sfiii3: 'Street Fighter III: 3rd Strike',
  simpsons: 'The Simpsons', sinistar: 'Sinistar', spyhunt: 'Spy Hunter',
  ssf2: 'Super Street Fighter II', ssf2t: 'Super Street Fighter II Turbo',
  strider: 'Strider', tempest: 'Tempest',
  tmnt: 'Teenage Mutant Ninja Turtles', tron: 'Tron',
  umk3: 'Ultimate Mortal Kombat 3', vsav: 'Vampire Savior',
  willow: 'Willow', xmen: 'X-Men',
  xmvsf: 'X-Men vs. Street Fighter', zaxxon: 'Zaxxon',
};
const ARCADE_SYSTEMS = new Set([
  'arcade', 'mame-libretro', 'fba', 'mame2010', 'cps1', 'cps2', 'cps3', 'neogeo',
]);

// MAME clone/revision dumps tack suffixes onto the parent shortname
// (nbajamr2 = NBA Jam rev 2, 10yardj = the Japan set) — peel "rN" and then
// one trailing letter before giving up, so revisions inherit the title.
function arcadeTitle(base) {
  if (ARCADE_TITLES[base]) return ARCADE_TITLES[base];
  const noRev = base.replace(/r\d+$/, '');
  if (noRev !== base && ARCADE_TITLES[noRev]) return ARCADE_TITLES[noRev];
  const noRegion = noRev.replace(/[a-z]$/, '');
  if (noRegion !== noRev && ARCADE_TITLES[noRegion]) return ARCADE_TITLES[noRegion];
  return null;
}

export function romTitle(systemId, file) {
  const base = file.replace(/\.[^.]+$/, '').toLowerCase();
  if (ARCADE_SYSTEMS.has(systemId)) {
    const t = arcadeTitle(base);
    if (t) return t;
  }
  return cleanTitle(file);
}

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
      // Same title twice = clone/revision dumps of one game (nbajam.zip +
      // nbajamr2.zip) — show it once; sorted order keeps the parent set.
      const titles = new Set();
      const games = [];
      for (const f of files.filter(f => sys.ext.includes(path.extname(f).toLowerCase())).sort()) {
        const title = romTitle(sys.id, f);
        if (titles.has(title)) continue;
        titles.add(title);
        games.push({ file: f, title });
      }
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
