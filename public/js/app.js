// Player app shell: join → hub → lobby → game → game over.
import { connect } from './net.js';
import { h, mount, toast, sheet, chipEl } from './ui.js';

const root = document.getElementById('app');
let sync = null;
let scratchKey = null;
let scratch = {};           // per-game-session module scratch space
const modules = {};         // gameId -> loaded client module
let padActive = false;

const net = connect({
  role: 'player',
  onSync: s => { sync = s; render(); },
  onMsg: m => {
    if (m.t === 'toast') toast(m.text);
    if (m.t === 'nope') toast(m.text, true);
  },
});

async function loadModule(id) {
  if (!modules[id]) {
    try { modules[id] = await import(`./games/${id}.js`); }
    catch (e) { console.error('module load failed', id, e); modules[id] = { error: true }; }
    render();
  }
  return modules[id];
}

function catName(c) {
  return { cards: 'Card Games', board: 'Board Games', arcade: 'Arcade' }[c] || c;
}

// ---------------------------------------------------------------- screens

function joinScreen() {
  const stored = localStorage.getItem('ps-name') || '';
  const input = h('input', {
    class: 'field', value: stored, maxlength: 16,
    placeholder: 'Your name', autocomplete: 'off',
  });
  const go = () => {
    const name = input.value.trim();
    if (!name) { toast('Pick a name first', true); return; }
    localStorage.setItem('ps-name', name);
    localStorage.setItem('ps-named', '1');
    net.send({ t: 'setName', name });
    render();
  };
  return h('div', { class: 'screen stack', style: 'justify-content:center;min-height:100vh;padding-bottom:40px;' },
    wordmark(),
    h('p', { class: 'center dim', style: 'margin:8px 0 20px' }, 'Who’s playing?'),
    input,
    h('button', { class: 'tok primary big', onclick: go }, 'Let’s play →'),
  );
}

function wordmark() {
  const letters = 'PARTY STATION'.split('');
  return h('div', { class: 'wordmark' }, letters.map(ch =>
    ch === ' ' ? h('span', { class: 'gap' }) : h('span', {}, ch)));
}

function hubScreen() {
  const cat = localStorage.getItem('ps-cat') || 'cards';
  const games = sync.games.filter(g => g.category === cat);
  return h('div', { class: 'screen' },
    h('div', { class: 'topbar' },
      h('div', {},
        h('div', { class: 'eyebrow' }, 'Party Station'),
        h('h1', {}, 'Pick a game'),
      ),
      h('button', { class: 'tok small', onclick: settingsSheet, 'aria-label': 'Settings' }, '⚙️ ' + (sync.you?.name || '')),
    ),
    sync.tvCount === 0 && h('div', { class: 'banner', style: 'margin-bottom:12px;font-size:13px;' },
      '📺 No big screen yet — open ', h('b', {}, location.host + '/tv'), ' on the TV for the full experience.'),
    h('div', { class: 'cat-tabs' }, ['cards', 'board', 'arcade'].map(c =>
      h('button', {
        class: 'tok' + (c === cat ? ' on-' + c : ''),
        onclick: () => { localStorage.setItem('ps-cat', c); render(); },
      }, catName(c)))),
    h('div', { class: 'game-grid' }, games.map(g => {
      const save = sync.saves[g.id];
      return h('button', { class: `game-tile cat-${g.category}`, onclick: () => gameSheet(g, save) },
        save && h('span', { class: 'g-save' }, 'SAVED'),
        h('span', { class: 'g-icon' }, g.icon),
        h('span', { class: 'g-name' }, g.name),
        h('span', { class: 'g-sub' }, `${g.minPlayers === g.maxPlayers ? g.minPlayers : g.minPlayers + '–' + g.maxPlayers} players`),
        h('span', { class: 'g-sub' }, g.tagline),
      );
    })),
    h('div', { class: 'divider' }),
    h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, `Here now (${sync.players.length})`),
    h('div', { class: 'row wrap' }, sync.players.map(p => chipEl(p))),
  );
}

function gameSheet(g, save) {
  const s = sheet(`${g.icon} ${g.name}`,
    h('p', { class: 'dim', style: 'margin-bottom:16px' }, g.tagline),
    save && h('div', { class: 'banner', style: 'margin-bottom:12px' },
      `💾 Saved game with ${save.seats.map(x => x.name).join(', ')}`,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'tok good grow', onclick: () => { net.send({ t: 'resumeGame', gameId: g.id }); s.remove(); } }, 'Resume'),
        h('button', { class: 'tok small danger', onclick: () => { net.send({ t: 'deleteSave', gameId: g.id }); s.remove(); } }, 'Discard'),
      )),
    h('button', {
      class: 'tok primary big', onclick: () => { net.send({ t: 'openLobby', gameId: g.id }); s.remove(); },
    }, save ? 'Start a new game' : 'Open a table'),
  );
}

function settingsSheet() {
  const input = h('input', { class: 'field', value: sync.you?.name || '', maxlength: 16 });
  sheet('Settings',
    h('div', { class: 'stack' },
      h('div', { class: 'eyebrow' }, 'Your name'),
      input,
      h('button', {
        class: 'tok', onclick: e => {
          localStorage.setItem('ps-name', input.value.trim());
          net.send({ t: 'setName', name: input.value.trim() });
          toast('Name updated');
        },
      }, 'Save name'),
      h('div', { class: 'divider' }),
      h('div', { class: 'eyebrow' }, 'Big screen'),
      h('p', { class: 'dim', style: 'font-size:14px' },
        `On the TV, open a browser to `, h('b', {}, location.host + '/tv'),
        `. Screens connected: ${sync.tvCount}.`),
      h('div', { class: 'divider' }),
      h('div', { class: 'eyebrow' }, 'Software'),
      h('p', { class: 'dim', style: 'font-size:14px' }, `Version: ${sync.version || 'unknown'}`),
      sync.updating
        ? h('div', { class: 'banner hot' }, 'Updating… the station will restart itself.')
        : sync.updateAvailable
          ? h('button', { class: 'tok primary', onclick: () => net.send({ t: 'applyUpdate' }) }, '⬇️ Install update now')
          : h('button', { class: 'tok ghost', onclick: () => { net.send({ t: 'checkUpdate' }); toast('Checking for updates…'); } }, 'Check for updates'),
    ),
  );
}

function lobbyScreen() {
  const L = sync.lobby;
  const g = sync.games.find(x => x.id === L.gameId);
  return h('div', { class: 'screen' },
    h('div', { class: 'topbar' },
      h('div', {},
        h('div', { class: 'eyebrow' }, 'Setting up'),
        h('h1', {}, `${g.icon} ${g.name}`),
      )),
    h('div', { class: 'stack' },
      h('div', { class: 'eyebrow' }, `Table (${L.seats.length}/${g.maxPlayers})`),
      h('div', { class: 'row wrap' },
        L.seats.map((s2, i) => chipEl(s2)),
        L.youAreHost && L.seats.length < g.maxPlayers
          && h('button', { class: 'tok small', onclick: () => net.send({ t: 'addBot' }) }, '+ 🤖 Add bot'),
      ),
      L.youAreHost && L.seats.some(s2 => s2.bot)
        && h('button', {
          class: 'tok small ghost', onclick: () => net.send({ t: 'removeBot', i: L.seats.filter(x => x.bot).length - 1 }),
        }, 'Remove a bot'),
      g.options.length ? h('div', { class: 'divider' }) : null,
      ...g.options.map(o => h('div', { class: 'spread' },
        h('span', {}, o.label),
        L.youAreHost
          ? h('select', {
            class: 'field',
            onchange: e => net.send({ t: 'setOption', key: o.key, value: e.target.value }),
          }, o.choices.map(c => h('option', { value: c.v, selected: String(L.options[o.key]) === String(c.v) }, c.label)))
          : h('b', {}, g.options.length && (o.choices.find(c => String(c.v) === String(L.options[o.key]))?.label ?? '')),
      )),
      h('p', { class: 'dim center', style: 'font-size:13px;margin-top:8px' },
        L.youAreHost
          ? (L.seats.length < g.minPlayers ? `Starting now fills empty seats with bots (needs ${g.minPlayers}).` : 'Everyone in? Hit start!')
          : `Waiting for ${L.hostName} to start the game…`),
    ),
    h('div', { class: 'actionbar' },
      L.youAreHost
        ? [h('button', { class: 'tok ghost', onclick: () => net.send({ t: 'cancelLobby' }) }, 'Cancel'),
           h('button', { class: 'tok primary', onclick: () => net.send({ t: 'start' }) }, '▶ Start')]
        : L.youJoined
          ? h('button', { class: 'tok ghost', onclick: () => net.send({ t: 'leaveLobby' }) }, 'Leave table')
          : h('button', { class: 'tok primary', onclick: () => net.send({ t: 'joinLobby' }) }, 'Join table'),
    ),
  );
}

function gameScreen() {
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  const key = G.gameId + ':' + (sync.phase === 'game');
  if (scratchKey !== key) { scratchKey = key; scratch = {}; }
  const mod = modules[G.gameId];
  if (!mod) { loadModule(G.gameId); return h('div', { class: 'screen center dim' }, 'Loading…'); }

  // Real-time arcade: fullscreen gamepad (or spectator note).
  if (G.mode === 'relay') {
    if (G.yourSeat >= 0 && mod.player?.pad) {
      return padScreen(mod, g, G);
    }
    padActive = false;
    return h('div', { class: 'screen stack center', style: 'padding-top:30vh' },
      h('h1', {}, `${g.icon} ${g.name}`),
      h('p', { class: 'dim' }, 'Playing on the big screen — you’re spectating this one.'),
      relayScoreEl(),
    );
  }

  padActive = false;
  const container = h('div', {});
  const ctx = {
    sync, game: G, pub: G.pub, priv: G.priv, you: G.yourSeat, seats: G.seats,
    send: a => net.send({ t: 'act', a }),
    state: scratch, toast,
    rerender: render,
    typing: () => container.contains(document.activeElement) && document.activeElement.tagName === 'INPUT',
  };
  if (mod.error || !mod.player) {
    mount(container, h('p', { class: 'dim center' }, 'This game’s controller failed to load.'));
  } else {
    mod.player.render(container, ctx);
  }

  return h('div', { class: 'screen' },
    h('div', { class: 'topbar' },
      h('div', { class: 'row' }, h('span', { style: 'font-size:22px' }, g.icon), h('h2', {}, g.name)),
      h('div', { class: 'row' },
        G.yourSeat < 0 && h('span', { class: 'dim', style: 'font-size:13px' }, 'spectating'),
        G.youAreHost && h('button', {
          class: 'tok small ghost',
          onclick: () => confirmQuit(),
        }, '💾 Exit'),
      )),
    // dropped players / takeover
    G.seats.some(s => s.bot) && G.yourSeat < 0
      ? h('div', { class: 'banner', style: 'margin-bottom:10px;font-size:13px' },
        'Take over a bot seat: ',
        h('div', { class: 'row wrap', style: 'margin-top:8px' },
          G.seats.map((s, i) => s.bot
            ? h('button', { class: 'tok small', onclick: () => net.send({ t: 'takeover', seat: i }) }, `${s.name} 🤖`)
            : null)))
      : null,
    G.youAreHost ? disconnectedBanner(G) : null,
    container,
  );
}

function disconnectedBanner(G) {
  const gone = G.seats.map((s, i) => (!s.bot && s.connected === false) ? i : null).filter(v => v != null);
  if (!gone.length) return null;
  return h('div', { class: 'banner', style: 'margin-bottom:10px;font-size:13px' },
    gone.map(i => h('div', { class: 'spread' },
      h('span', {}, `${G.seats[i].name} disconnected`),
      h('button', { class: 'tok small', onclick: () => net.send({ t: 'botify', seat: i }) }, 'Let a bot play'))));
}

function confirmQuit() {
  const s = sheet('Leave this game?',
    h('p', { class: 'dim', style: 'margin-bottom:14px' }, 'Progress is saved automatically — you can resume from the game screen later.'),
    h('div', { class: 'row' },
      h('button', { class: 'tok ghost grow', onclick: () => s.remove() }, 'Keep playing'),
      h('button', { class: 'tok danger grow', onclick: () => { net.send({ t: 'quitGame' }); s.remove(); } }, 'Save & exit'),
    ));
}

let lastRelayScore = null;
function relayScoreEl() {
  return h('div', { id: 'relay-score', class: 'banner center', style: 'font-size:24px' },
    lastRelayScore || '');
}

function padScreen(mod, g, G) {
  padActive = true;
  const el = h('div', {});
  requestAnimationFrame(() => {
    import('./ui.js').then(({ gamepad }) => gamepad(el, mod.player.pad, m => net.send(m)));
  });
  return h('div', {},
    h('div', { style: 'position:fixed;top:12px;left:0;right:0;text-align:center;z-index:5' },
      h('span', { class: 'banner', style: 'font-size:14px' }, `${g.icon} ${G.seats[G.yourSeat].name}`),
      ' ',
      h('span', { id: 'relay-score', class: 'banner', style: 'font-size:14px' }, lastRelayScore || ''),
    ),
    el);
}

net.onExtra(m => {
  if (m.t === 'relayScore') {
    lastRelayScore = m.d;
    const el = document.getElementById('relay-score');
    if (el) el.textContent = m.d;
  }
});

function gameoverScreen() {
  const G = sync.game;
  const g = sync.games.find(x => x.id === G.gameId);
  return h('div', { class: 'screen stack center', style: 'padding-top:18vh' },
    h('div', { style: 'font-size:64px' }, g.icon),
    h('h1', {}, G.over?.title || 'Game over'),
    h('div', { class: 'stack', style: 'gap:4px;margin-top:8px' },
      (G.over?.lines || []).map(l => h('div', { class: 'dim' }, l))),
    h('div', { class: 'actionbar' },
      h('button', { class: 'tok primary big', onclick: () => net.send({ t: 'backToHub' }) }, 'Back to games')),
  );
}

// ---------------------------------------------------------------- render

function render() {
  if (!sync) return;
  if (!localStorage.getItem('ps-named')) { mount(root, joinScreen()); return; }
  document.body.style.overflow = padActive ? 'hidden' : '';
  switch (sync.phase) {
    case 'hub': mount(root, hubScreen()); break;
    case 'lobby': mount(root, lobbyScreen()); break;
    case 'game': mount(root, gameScreen()); break;
    case 'gameover': mount(root, gameoverScreen()); break;
  }
}
