// Big-screen app: idle billboard → lobby → game (shared view / arcade sim) → winner.
import { connect } from './net.js';
import { h, mount, toast } from './ui.js';

const root = document.getElementById('tv');
document.body.classList.add('tv');

let sync = null;
const modules = {};
let sim = null;          // running arcade simulation
let simGameKey = null;

const net = connect({
  role: 'tv',
  onSync: s => { sync = s; render(); },
  onMsg: m => {
    if (m.t === 'toast') toast(m.text);
    if (m.t === 'input' && sim?.input) sim.input(m.seat, m.d);
  },
});

async function loadModule(id) {
  if (!modules[id]) {
    try { modules[id] = await import(`./games/${id}.js`); }
    catch (e) { console.error(e); modules[id] = { error: true }; }
    render();
  }
  return modules[id];
}

function wordmark(size = 44) {
  return h('div', { class: 'wordmark', style: `--s:${size}px` },
    'PARTY STATION'.split('').map(ch => ch === ' '
      ? h('span', { class: 'gap' })
      : h('span', { style: `width:${size * .9}px;height:${size}px;font-size:${size * .55}px` }, ch)));
}

function urlBox() {
  return h('div', { class: 'tv-url' }, 'Join at ', h('b', {}, location.host));
}

function stopSim() {
  if (sim?.stop) sim.stop();
  sim = null;
  simGameKey = null;
}

// ---------------------------------------------------------------- screens

function hubScreen() {
  stopSim();
  const cats = [['cards', 'Card Games'], ['board', 'Board Games'], ['arcade', 'Arcade']];
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(46), urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { style: 'width:100%' },
        cats.map(([c, label]) => h('div', { style: 'margin-bottom:26px' },
          h('div', { class: 'eyebrow', style: 'font-size:15px;margin-bottom:10px' }, label),
          h('div', { class: 'row wrap', style: 'gap:12px' },
            sync.games.filter(g => g.category === c).map(g =>
              h('div', { class: `game-tile cat-${c}`, style: 'min-height:0;padding:12px 16px;flex-direction:row;align-items:center;gap:12px;cursor:default' },
                h('span', { style: 'font-size:30px' }, g.icon),
                h('div', {},
                  h('div', { class: 'g-name' }, g.name, sync.saves[g.id] ? ' 💾' : ''),
                  h('div', { class: 'g-sub' }, `${g.minPlayers === g.maxPlayers ? g.minPlayers : g.minPlayers + '–' + g.maxPlayers} players`)),
              ))),
        )))),
    h('div', { class: 'tv-seats' },
      sync.players.length
        ? sync.players.map(p => h('div', { class: 'chip' }, h('span', { class: 'dot' }, p.name[0]?.toUpperCase()), p.name))
        : h('div', { class: 'dim', style: 'font-size:20px' }, `Grab your phone and go to http://${location.host} — pick any game to get the party started.`),
    ),
  );
}

function lobbyScreen() {
  stopSim();
  const L = sync.lobby;
  const g = sync.games.find(x => x.id === L.gameId);
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' },
      h('div', { class: 'tv-title' }, h('span', { style: 'font-size:44px' }, g.icon), g.name),
      urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { class: 'tv-big', style: 'font-size:54px;margin-bottom:12px' }, 'Setting up the table…'),
        h('p', { class: 'dim', style: 'font-size:24px' }, `${L.hostName} is picking the options — join from your phone!`))),
    h('div', { class: 'tv-seats' }, L.seats.map(s =>
      h('div', { class: 'chip' + (s.bot ? ' bot' : '') },
        h('span', { class: 'dot' }, s.bot ? '🤖' : s.name[0]?.toUpperCase()), s.name))),
  );
}

function gameScreen() {
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  const mod = modules[G.gameId];
  if (!mod) { loadModule(G.gameId); return h('div', { class: 'tv-stage center dim' }, 'Loading…'); }

  if (G.mode === 'relay') {
    const key = G.gameId + JSON.stringify(G.seats.map(s => s.name));
    const holder = h('div', { class: 'tv-main' });
    if (simGameKey !== key) {
      stopSim();
      simGameKey = key;
      requestAnimationFrame(() => {
        if (mod.tv?.start) {
          sim = mod.tv.start(holder, {
            seats: G.seats, options: G.options || {},
            end: result => net.send({ t: 'relayEnd', result }),
            sendScore: d => net.send({ t: 'relayScore', d }),
          });
        }
      });
    } else if (sim?.rehome) {
      requestAnimationFrame(() => sim.rehome(holder));
    }
    return h('div', { class: 'tv-stage' },
      h('div', { class: 'tv-top' },
        h('div', { class: 'tv-title' }, h('span', { style: 'font-size:44px' }, g.icon), g.name),
        urlBox()),
      holder);
  }

  stopSim();
  const container = h('div', { class: 'tv-main' });
  if (mod.error || !mod.tv) {
    mount(container, h('p', { class: 'dim' }, 'This game’s screen failed to load.'));
  } else {
    mod.tv.render(container, { sync, game: G, pub: G.pub, seats: G.seats });
  }
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' },
      h('div', { class: 'tv-title' }, h('span', { style: 'font-size:44px' }, g.icon), g.name),
      urlBox()),
    container,
  );
}

function gameoverScreen() {
  stopSim();
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  return h('div', { class: 'tv-stage' },
    h('div', { class: 'tv-top' }, wordmark(36), urlBox()),
    h('div', { class: 'tv-main' },
      h('div', { class: 'center' },
        h('div', { style: 'font-size:120px' }, g.icon),
        h('div', { class: 'tv-big' }, G.over?.title || 'Game over'),
        h('div', { style: 'font-size:26px;margin-top:16px' },
          (G.over?.lines || []).map(l => h('div', { class: 'dim' }, l))),
        h('p', { class: 'dim', style: 'margin-top:24px;font-size:20px' }, 'Head back to the hub from any phone.'),
      )));
}

function render() {
  if (!sync) return;
  switch (sync.phase) {
    case 'hub': mount(root, hubScreen()); break;
    case 'lobby': mount(root, lobbyScreen()); break;
    case 'game': mount(root, gameScreen()); break;
    case 'gameover': mount(root, gameoverScreen()); break;
  }
}
