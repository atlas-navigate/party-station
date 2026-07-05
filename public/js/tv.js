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
const menus = new Map();   // pad index -> {seat, stage, idx, spec}
const peeked = new Set();  // seat indexes currently revealing their hand (Y)
const peekTimers = new Map();

const net = connect({
  role: 'tv',
  onSync: s => { sync = s; render(); },
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

function hubList() { return sync.games; }

function padHub(pad, btn) {
  const list = hubList();
  const cols = 5;
  if (btn === 'left') hubCursor = Math.max(0, hubCursor - 1);
  if (btn === 'right') hubCursor = Math.min(list.length - 1, hubCursor + 1);
  if (btn === 'up') hubCursor = Math.max(0, hubCursor - cols);
  if (btn === 'down') hubCursor = Math.min(list.length - 1, hubCursor + cols);
  if (btn === 'a' || btn === 'start') {
    const g = list[hubCursor];
    if (g) padMsg(pad, { t: 'openLobby', gameId: g.id });
  }
  if (btn === 'x') {
    const g = list[hubCursor];
    if (g && sync.saves[g.id]) padMsg(pad, { t: 'resumeGame', gameId: g.id });
  }
  render();
}

function padLobby(pad, btn, info) {
  if (btn === 'a' && !info.joined) padMsg(pad, { t: 'joinLobby' });
  if (btn === 'b' && info.joined) padMsg(pad, { t: 'leaveLobby' });
  if ((btn === 'start' || btn === 'x') && info.isHost) padMsg(pad, { t: 'start' });
  if (btn === 'x' && info.joined && !info.isHost) padMsg(pad, { t: 'start' }); // ignored server-side unless host
}

function padGame(pad, btn, info, isRepeat) {
  const G = sync.game;
  if (G.mode === 'relay') return; // arcade sims poll pads directly
  if (btn === 'y' && !isRepeat && info.seat >= 0) { togglePeek(info.seat); return; }
  if (btn === 'start' && !isRepeat && info.isHost) {
    openMenu(pad, info.seat, {
      title: 'Pause', items: [
        { label: '💾 Save & exit to hub', action: null, raw: { t: 'quitGame' } },
        { label: 'Keep playing', close: true },
      ],
    });
    render();
    return;
  }
  const menu = menus.get(pad);
  if (!menu) {
    if (info.awaited) { buildActionMenu(pad, info); render(); }
    return;
  }
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
  focusScene(menu);
  render();
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
  if (sync.phase !== 'game' || sync.game.mode !== 'server') { menus.clear(); return; }
  for (const [pad, menu] of [...menus.entries()]) {
    const info = myPadInfo(pad);
    if (!info || info.seat !== menu.seat || (!info.awaited && !menu.spec.sticky)) {
      menus.delete(pad);
      continue;
    }
    rebuildMenu(pad, menu);
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
  const list = hubList();
  const cats = [['cards', 'CARD GAMES'], ['board', 'BOARD GAMES'], ['arcade', 'ARCADE']];
  let idx = 0;
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(44), urlBox()),
    h('div', { style: 'flex:1;overflow:hidden' },
      cats.map(([c, label]) => h('div', { style: 'margin-bottom:20px' },
        h('div', { class: 'eyebrow', style: 'font-size:14px;margin-bottom:8px' }, label),
        h('div', { class: 'row wrap', style: 'gap:10px' },
          list.filter(g => g.category === c).map(g => {
            const i = list.indexOf(g);
            const focused = i === hubCursor;
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
    hintBar([['🎮 A', 'open game'], ['🎮 X', 'resume save'], ['📱', `phones: http://${location.host}`]]),
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
            padDown: (seat, k2) => padSeats[seat] !== undefined && pads.isDown(padSeats[seat], k2),
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
      ? [['🎮', 'plays directly'], ['📱', 'phone = gamepad']]
      : [['🎮 A', 'choose'], ['🎮 Y', 'peek hand'], ['🎮 Start', 'pause (host)'], ['📱', 'play from your phone']]),
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

function render() {
  if (!sync) return;
  if (sync.phase === 'game') refreshMenus(); else menus.clear();
  switch (sync.phase) {
    case 'hub': mount(root, hubScreen()); break;
    case 'lobby': mount(root, lobbyScreen()); break;
    case 'game': mount(root, gameScreen()); break;
    case 'gameover': mount(root, gameoverScreen()); break;
  }
}
