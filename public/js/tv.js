// Party Station console shell (the TV is the console screen).
// All games render here in 3D; phones and Bluetooth controllers drive it.
import { connect } from './net.js';
import { h, mount, toast } from './ui.js';
import { createPads } from './pads.js';

const root = document.getElementById('tv');
document.body.classList.add('tv');

let sync = null;
const modules = {};
let scene = null;          // { gameId, key, api } for mounted 3D scenes
let relaySim = null;
let hubCursor = 0;
let tvMode = null;         // landing choice: null (asking) | 'party' | 'retro'
let chooseIdx = 0;         // focused tile on the landing chooser
const menus = new Map();   // pad index -> {seat, stage, idx, spec}
const peeked = new Set();  // seat indexes currently revealing their hand (Y)
const peekTimers = new Map();

// A finished self-update restarts the server with new client code, but the
// kiosk's Chromium never reloads by itself — so when the version changes
// under us (and we're idle), reload to actually run the new UI.
let loadedVersion = null;
function reloadOnNewVersion(s) {
  if (!s.version) return;
  if (loadedVersion === null) loadedVersion = s.version;
  else if (s.version !== loadedVersion && s.phase === 'hub' && !s.emulator) location.reload();
}

const net = connect({
  role: 'tv',
  onSync: s => { sync = s; reloadOnNewVersion(s); render(); },
  onMsg: m => {
    if (m.t === 'toast') toast(m.text);
    if (m.t === 'nope') toast(m.text, true);
    if (m.t === 'input' && relaySim?.input) relaySim.input(m.seat, m.d);
  },
});

const pads = createPads({
  onPress: (pad, btn, isRepeat) => handlePad(pad, btn, isRepeat),
  onConnect: (pad, id) => toast(`🎮 Controller detected — press any button to join`),
  onDisconnect: pad => { net.send({ t: 'padBye', pad }); menus.delete(pad); render(); },
});

const padMsg = (pad, m) => net.send({ t: 'padMsg', pad, m });
const padAct = (pad, a) => padMsg(pad, { t: 'act', a });

// Troubleshooting from a keyboard plugged into the Pi (the kiosk has no
// window chrome): Ctrl+Alt+Q exits the kiosk to the desktop — the server
// flags scripts/kiosk.sh, which closes Chromium and stops relaunching.
// Ctrl+Alt+R reloads the TV page. Re-enter with `party-station-kiosk`.
window.addEventListener('keydown', e => {
  if (!e.ctrlKey || !e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'q') {
    e.preventDefault();
    toast('👋 Exiting the kiosk — run party-station-kiosk in a terminal to come back');
    fetch('/api/kiosk/exit', { method: 'POST' }).catch(() => {});
  } else if (k === 'r') {
    e.preventDefault();
    location.reload();
  }
});

async function loadModule(id) {
  if (!modules[id]) {
    try { modules[id] = await import(`./games/${id}.js`); }
    catch (e) { console.error('module load failed', id, e); modules[id] = { error: true }; }
    render();
  }
  return modules[id];
}

// ------------------------------------------------------------- pad routing

function myPadInfo(pad) { return sync?.pads?.[pad]; }

function handlePad(pad, btn, isRepeat) {
  if (!sync) return;
  if (sync.emulator) return; // RetroArch owns the controllers right now
  if (!myPadInfo(pad)) {
    if (!isRepeat) net.send({ t: 'padHello', pad, name: `P${pad + 1} 🎮` });
    return;
  }
  const info = myPadInfo(pad);
  switch (sync.phase) {
    case 'hub': return padHub(pad, btn);
    case 'lobby': return padLobby(pad, btn, info);
    case 'game': return padGame(pad, btn, info, isRepeat);
    case 'gameover': if (btn === 'a' && !isRepeat) padMsg(pad, { t: 'backToHub' }); return;
  }
}

function hubList() {
  if (tvMode === 'retro') {
    const ents = [];
    for (const s of (sync.emu?.systems || [])) {
      for (const gm of s.games) {
        ents.push({ kind: 'emu', system: s.id, sysName: s.name, icon: s.icon, file: gm.file, title: gm.title });
      }
    }
    return ents;
  }
  if (tvMode === 'party') return sync.games.map(g => ({ kind: 'game', g }));
  return [];
}

function padHub(pad, btn) {
  // Landing chooser: pick between party games and the retro cabinet.
  if (tvMode === null) {
    if (btn === 'left' || btn === 'up') chooseIdx = 0;
    if (btn === 'right' || btn === 'down') chooseIdx = 1;
    if (btn === 'a' || btn === 'start' || btn === 'x') {
      tvMode = chooseIdx === 1 ? 'retro' : 'party';
      hubCursor = 0;
    }
    render();
    return;
  }
  if (btn === 'b') { tvMode = null; render(); return; }
  const list = hubList();
  const cols = 5;
  if (btn === 'left') hubCursor = Math.max(0, hubCursor - 1);
  if (btn === 'right') hubCursor = Math.min(list.length - 1, hubCursor + 1);
  if (btn === 'up') hubCursor = Math.max(0, hubCursor - cols);
  if (btn === 'down') hubCursor = Math.min(list.length - 1, hubCursor + cols);
  const ent = list[hubCursor];
  if ((btn === 'a' || btn === 'start') && ent) {
    if (ent.kind === 'game') padMsg(pad, { t: 'openLobby', gameId: ent.g.id });
    else padMsg(pad, { t: 'emuLaunch', system: ent.system, file: ent.file });
  }
  if (btn === 'x' && ent?.kind === 'game' && sync.saves[ent.g.id]) {
    padMsg(pad, { t: 'resumeGame', gameId: ent.g.id });
  }
  render();
}

function padLobby(pad, btn, info) {
  if (btn === 'a' && !info.joined) padMsg(pad, { t: 'joinLobby' });
  if (btn === 'b' && info.joined) padMsg(pad, { t: 'leaveLobby' });
  if ((btn === 'start' || btn === 'x') && info.isHost) padMsg(pad, { t: 'start' });
  if (btn === 'x' && info.joined && !info.isHost) padMsg(pad, { t: 'start' }); // ignored server-side unless host
}

// Any seated player can pause and exit — a stuck game shouldn't need the
// host's device. Turn-based games auto-save; arcade matches just end.
function pauseMenuSpec(mode) {
  return {
    title: 'Pause', sticky: true, pause: true, items: [
      mode === 'relay'
        ? { label: '⛔ End game for everyone', raw: { t: 'quitGame' } }
        : { label: '💾 Save & exit to hub', raw: { t: 'quitGame' } },
      { label: 'Keep playing', close: true },
    ],
  };
}

function padGame(pad, btn, info, isRepeat) {
  const G = sync.game;
  if (G.mode === 'relay') {
    // Arcade sims poll pads directly — Start (unused by the sims) pauses;
    // while this pad's menu is open the sim ignores it (see padDown).
    const menu = menus.get(pad);
    if (menu) menuNav(pad, menu, btn, isRepeat);
    else if (btn === 'start' && !isRepeat && info.seat >= 0) {
      openMenu(pad, info.seat, pauseMenuSpec('relay'));
    }
    render();
    return;
  }
  if (btn === 'y' && !isRepeat && info.seat >= 0) { togglePeek(info.seat); return; }
  if (btn === 'start' && !isRepeat && info.seat >= 0) {
    openMenu(pad, info.seat, pauseMenuSpec('server'));
    render();
    return;
  }
  const menu = menus.get(pad);
  if (!menu) {
    if (info.awaited) { buildActionMenu(pad, info); render(); }
    return;
  }
  menuNav(pad, menu, btn, isRepeat);
  focusScene(menus.get(pad));
  render();
}

function menuNav(pad, menu, btn, isRepeat) {
  const items = menu.spec.items.filter(i => !i.hidden);
  if (btn === 'up') menu.idx = (menu.idx + items.length - 1) % items.length;
  if (btn === 'down') menu.idx = (menu.idx + 1) % items.length;
  if (btn === 'b' && !isRepeat) menus.delete(pad);
  if (btn === 'a' && !isRepeat) {
    const item = items[menu.idx];
    if (!item || item.disabled) return;
    if (item.close) { menus.delete(pad); }
    else if (item.raw) { padMsg(pad, item.raw); menus.delete(pad); }
    else if (item.pick !== undefined) {
      item.onPick(menu.stage);
      rebuildMenu(pad, menu);
    } else if (item.action) {
      padAct(pad, item.action);
      menus.delete(pad);
    }
  }
}

function togglePeek(seat) {
  clearTimeout(peekTimers.get(seat));
  if (peeked.has(seat)) peeked.delete(seat);
  else {
    peeked.add(seat);
    peekTimers.set(seat, setTimeout(() => { peeked.delete(seat); render(); }, 4000));
  }
  render();
}

function openMenu(pad, seat, spec) {
  menus.set(pad, { seat, stage: spec.stage || {}, idx: 0, spec });
}

function buildActionMenu(pad, info) {
  const mod = modules[sync.game.gameId];
  if (!mod?.padChoices) return;
  const stage = {};
  const spec = mod.padChoices({ pub: sync.game.pub, priv: info.priv, seats: sync.game.seats, seat: info.seat }, stage);
  if (spec) menus.set(pad, { seat: info.seat, stage, idx: 0, spec });
}

function rebuildMenu(pad, menu) {
  const mod = modules[sync.game.gameId];
  const info = myPadInfo(pad);
  if (!mod?.padChoices || !info) { menus.delete(pad); return; }
  const spec = mod.padChoices({ pub: sync.game.pub, priv: info.priv, seats: sync.game.seats, seat: info.seat }, menu.stage);
  if (!spec) { menus.delete(pad); return; }
  menu.spec = spec;
  menu.idx = Math.min(menu.idx, spec.items.length - 1);
}

function focusScene(menu) {
  const item = menu?.spec.items[menu.idx];
  scene?.api?.focus?.(menu?.seat, item?.focus ?? null);
}

// Refresh open menus when new state arrives (choices may have changed).
function refreshMenus() {
  if (sync.phase !== 'game') { menus.clear(); return; }
  if (sync.game.mode !== 'server') {
    // Relay: only pause menus exist — keep them while their pad is around.
    for (const pad of [...menus.keys()]) {
      if (!myPadInfo(pad)) menus.delete(pad);
    }
    return;
  }
  for (const [pad, menu] of [...menus.entries()]) {
    const info = myPadInfo(pad);
    if (!info || info.seat !== menu.seat || (!info.awaited && !menu.spec.sticky)) {
      menus.delete(pad);
      continue;
    }
    // Pause menus aren't derived from game state — never rebuild them into
    // an action menu underneath the player.
    if (!menu.spec.pause) rebuildMenu(pad, menu);
  }
  // Auto-open menus for pad players whose turn just arrived.
  for (const pad of Object.keys(sync.pads || {})) {
    const info = sync.pads[pad];
    if (info.awaited && !menus.has(Number(pad))) buildActionMenu(Number(pad), info);
  }
}

// ------------------------------------------------------------------ views

function urlBox() {
  return h('div', { class: 'tv-url' }, 'Phones join at ', h('b', {}, location.host));
}

function wordmark(size = 40) {
  return h('div', { class: 'wordmark' },
    'PARTY STATION'.split('').map(ch => ch === ' '
      ? h('span', { class: 'gap' })
      : h('span', { style: `width:${size * .82}px;height:${size}px;font-size:${size * .5}px` }, ch)));
}

function hintBar(hints) {
  return h('div', { class: 'tv-hints' },
    hints.map(([k, label]) => h('span', {}, h('b', {}, k), ' ', label)));
}

function disposeScene() {
  if (scene?.api?.dispose) scene.api.dispose();
  scene = null;
  if (relaySim?.stop) relaySim.stop();
  relaySim = null;
}

function hubScreen() {
  disposeScene();
  if (tvMode === null) return chooseScreen();
  if (tvMode === 'retro') return retroHubScreen();
  const list = hubList();
  const cats = [['cards', 'CARD GAMES'], ['board', 'BOARD GAMES'], ['arcade', 'ARCADE']];
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(44), urlBox()),
    h('div', { style: 'flex:1;overflow:hidden' },
      cats.map(([c, label]) => h('div', { style: 'margin-bottom:16px' },
        h('div', { class: 'eyebrow', style: 'font-size:14px;margin-bottom:8px' }, label),
        h('div', { class: 'row wrap', style: 'gap:10px' },
          list.filter(e => e.g.category === c).map(e => {
            const g = e.g;
            const focused = list.indexOf(e) === hubCursor;
            return h('div', {
              class: `game-tile cat-${c}` + (focused ? ' tv-focus' : ''),
              style: 'min-height:0;padding:10px 14px;flex-direction:row;align-items:center;gap:10px;cursor:default',
            },
              h('span', { style: 'font-size:26px' }, g.icon),
              h('div', {},
                h('div', { class: 'g-name', style: 'font-size:16px' }, g.name, sync.saves[g.id] ? ' 💾' : ''),
                h('div', { class: 'g-sub' }, `${g.minPlayers === g.maxPlayers ? g.minPlayers : g.minPlayers + '–' + g.maxPlayers} players`)));
          })))),
    ),
    h('div', { class: 'tv-seats', style: 'margin:6px 0' },
      sync.players.length
        ? sync.players.map(p => h('div', { class: 'chip' }, h('span', { class: 'dot' }, p.name[0]?.toUpperCase()), p.name))
        : h('span', { class: 'dim', style: 'font-size:18px' }, 'No players yet — join from a phone or press a button on a paired controller.')),
    hintBar([['🎮 A', 'open game'], ['🎮 X', 'resume save'], ['🎮 B', 'retro ⇄ party'], ['📱', `phones: http://${location.host}`]]),
  );
}

// Landing chooser: the console's first screen — retro classics or party games?
function chooseScreen() {
  const emuGames = (sync.emu?.systems || []).reduce((n, s) => n + s.games.length, 0);
  const tiles = [
    { icon: '🃏', name: 'Party Games', sub: 'Cards · Board · Arcade — phones and controllers', cls: 'cat-cards', mode: 'party' },
    {
      icon: '🕹️', name: 'Retro Games', cls: 'cat-arcade', mode: 'retro',
      sub: sync.emu?.available ? `${emuGames} classics on the emulator` : `Add ROMs at http://${location.host}/roms`,
    },
  ];
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(44), urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { class: 'tv-big', style: 'font-size:44px;margin-bottom:26px' }, 'What are we playing?'),
        h('div', { class: 'row', style: 'gap:26px;justify-content:center' },
          tiles.map((t2, i) => h('div', {
            class: `game-tile ${t2.cls}` + (chooseIdx === i ? ' tv-focus' : ''),
            style: 'width:320px;min-height:170px;cursor:default',
            onclick: () => { tvMode = t2.mode; hubCursor = 0; render(); },
          },
            h('span', { style: 'font-size:52px' }, t2.icon),
            h('div', { class: 'g-name', style: 'font-size:26px' }, t2.name),
            h('div', { class: 'g-sub', style: 'font-size:14px' }, t2.sub)))))),
    hintBar([['🎮 ◀▶', 'choose'], ['🎮 A', 'select'], ['📱', `phones: http://${location.host}`]]),
  );
}

function retroHubScreen() {
  const list = hubList();
  const bySystem = new Map();
  for (const e of list) {
    if (!bySystem.has(e.sysName)) bySystem.set(e.sysName, []);
    bySystem.get(e.sysName).push(e);
  }
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(44), urlBox()),
    list.length
      ? h('div', { style: 'flex:1;overflow:hidden' },
        [...bySystem.entries()].map(([sysName, ents]) => h('div', { style: 'margin-bottom:14px' },
          h('div', { class: 'eyebrow', style: 'font-size:14px;margin-bottom:8px' }, `${ents[0].icon} ${sysName.toUpperCase()}`),
          h('div', { class: 'row wrap', style: 'gap:10px' },
            ents.map(e => h('div', {
              class: 'game-tile cat-arcade' + (list.indexOf(e) === hubCursor ? ' tv-focus' : ''),
              style: 'min-height:0;padding:8px 14px;flex-direction:row;align-items:center;gap:10px;cursor:default',
            },
              h('span', { style: 'font-size:22px' }, e.icon),
              h('div', {},
                h('div', { class: 'g-name', style: 'font-size:15px' }, e.title),
                h('div', { class: 'g-sub' }, e.sysName))))))))
      : h('div', { class: 'tv-main' },
        h('div', { class: 'center' },
          h('div', { style: 'font-size:90px' }, '🕹️'),
          h('div', { class: 'tv-big', style: 'font-size:40px' }, 'No retro games yet'),
          h('p', { class: 'dim', style: 'font-size:22px;margin-top:12px' },
            `Add ROMs of games you own at http://${location.host}/roms`),
          h('p', { class: 'dim', style: 'font-size:18px' },
            `or scp them into ~/RetroPie/roms/incoming — they sort themselves.`))),
    hintBar([['🎮 A', 'play'], ['🎮 B', 'back'], ['📱', `phones: http://${location.host}`]]),
  );
}

function lobbyScreen() {
  disposeScene();
  const L = sync.lobby;
  const g = sync.games.find(x => x.id === L.gameId);
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' },
      h('div', { class: 'tv-title' }, h('span', { style: 'font-size:44px' }, g.icon), g.name),
      urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { class: 'tv-big', style: 'font-size:50px;margin-bottom:10px' }, 'Who’s in?'),
        h('p', { class: 'dim', style: 'font-size:22px' },
          `${L.hostName} starts the game when everyone’s seated. Empty seats become bots.`))),
    h('div', { class: 'tv-seats' }, L.seats.map(s =>
      h('div', { class: 'chip' + (s.bot ? ' bot' : '') },
        h('span', { class: 'dot' }, s.bot ? '🤖' : s.name[0]?.toUpperCase()), s.name))),
    hintBar([['🎮 A', 'join'], ['🎮 B', 'leave'], ['🎮 X/Start', 'start (host)'], ['📱', 'phones: tap Join']]),
  );
}

function menuPanels() {
  const panels = [];
  for (const [pad, menu] of menus.entries()) {
    const info = myPadInfo(pad);
    if (!info) continue;
    const items = menu.spec.items.filter(i => !i.hidden);
    panels.push(h('div', { class: 'pad-menu' },
      h('div', { class: 'pad-menu-title' }, `🎮 ${info.name}${menu.spec.title ? ' — ' + menu.spec.title : ''}`),
      items.map((it, i) => h('div', {
        class: 'pad-menu-item' + (i === menu.idx ? ' focus' : '') + (it.disabled ? ' dis' : '') + (it.on ? ' on' : ''),
      }, it.label)),
    ));
  }
  return panels;
}

function gameScreen() {
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  const mod = modules[G.gameId];
  if (!mod) { loadModule(G.gameId); return h('div', { class: 'tv-stage center dim' }, 'Loading…'); }
  if (mod.error) {
    return h('div', { class: 'tv-stage' },
      h('div', { class: 'tv-main' },
        h('div', { class: 'banner center', style: 'font-size:22px' },
          `⚠️ ${g.name}'s screen failed to load — check the browser console. The game engine is still running.`)));
  }

  const holder = h('div', { class: 'tv-scene' });
  const padSeats = {};
  for (const [pad, info] of Object.entries(sync.pads || {})) {
    if (info.seat >= 0) padSeats[info.seat] = Number(pad);
  }

  if (G.mode === 'relay') {
    const key = G.gameId + JSON.stringify(G.seats.map(s => s.name));
    if (scene?.key !== key) {
      disposeScene();
      scene = { key, gameId: G.gameId, api: null };
      requestAnimationFrame(() => {
        if (mod.tv?.start && scene?.key === key) {
          relaySim = mod.tv.start(holder, {
            seats: G.seats, options: G.options || {},
            // A pad with its pause menu open is invisible to the sim, so
            // navigating the menu doesn't twitch the player's character.
            padDown: (seat, k2) => padSeats[seat] !== undefined
              && !menus.has(padSeats[seat])
              && pads.isDown(padSeats[seat], k2),
            end: result => net.send({ t: 'relayEnd', result }),
            sendScore: d => net.send({ t: 'relayScore', d }),
          });
          scene.api = relaySim;
        }
      });
    } else if (relaySim?.rehome) {
      requestAnimationFrame(() => relaySim.rehome(holder));
    }
  } else {
    const ctx = {
      pub: G.pub, seats: G.seats, game: G, peeked,
      padSeats,
      privOf: seat => {
        for (const info of Object.values(sync.pads || {})) {
          if (info.seat === seat) return info.priv;
        }
        return null;
      },
    };
    const key = G.gameId;
    if (scene?.key !== key || !scene.api) {
      disposeScene();
      scene = { key, gameId: G.gameId, api: null };
      requestAnimationFrame(() => {
        if (mod.tv?.mount && scene?.key === key) {
          scene.api = mod.tv.mount(holder, ctx);
          scene.api?.update?.(ctx);
        }
      });
    } else {
      const api = scene.api;
      requestAnimationFrame(() => {
        api.rehome?.(holder);
        api.update?.(ctx);
      });
    }
  }

  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' },
      h('div', { class: 'tv-title', style: 'font-size:26px' }, h('span', { style: 'font-size:32px' }, g.icon), g.name),
      urlBox()),
    holder,
    h('div', { class: 'pad-menus' }, menuPanels()),
    hintBar(G.mode === 'relay'
      ? [['🎮', 'plays directly'], ['🎮 Start', 'pause / quit'], ['📱', 'phone = gamepad']]
      : [['🎮 A', 'choose'], ['🎮 Y', 'peek hand'], ['🎮 Start', 'pause / exit'], ['📱', 'play from your phone']]),
  );
}

function gameoverScreen() {
  disposeScene();
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(34), urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { style: 'font-size:110px' }, g.icon),
        h('div', { class: 'tv-big' }, G.over?.title || 'Game over'),
        h('div', { style: 'font-size:24px;margin-top:14px' },
          (G.over?.lines || []).map(l => h('div', { class: 'dim' }, l))))),
    hintBar([['🎮 A', 'back to games'], ['📱', 'tap “Back to games”']]),
  );
}

function emulatorScreen() {
  disposeScene();
  const e = sync.emulator;
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(34), urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { style: 'font-size:100px' }, e.icon || '🕹️'),
        h('div', { class: 'tv-big', style: 'font-size:54px' }, e.title),
        h('p', { class: 'dim', style: 'font-size:22px;margin-top:12px' },
          `${e.system} — the emulator is taking over this screen…`),
        h('p', { class: 'dim', style: 'font-size:18px' }, 'Exit with Select+Start to come back to Party Station.'))),
  );
}

function render() {
  if (!sync) return;
  if (sync.emulator) { menus.clear(); mount(root, emulatorScreen()); return; }
  // A session started from a phone answers the landing prompt implicitly.
  if (tvMode === null && sync.phase !== 'hub') tvMode = 'party';
  if (sync.phase === 'game') refreshMenus(); else menus.clear();
  switch (sync.phase) {
    case 'hub': mount(root, hubScreen()); break;
    case 'lobby': mount(root, lobbyScreen()); break;
    case 'game': mount(root, gameScreen()); break;
    case 'gameover': mount(root, gameoverScreen()); break;
  }
}
