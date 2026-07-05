// End-to-end smoke test over a real WebSocket connection:
//   two phones + a TV join, play Candy Dash to completion, exercise
//   save & resume, then run a relay (arcade) session start/end.
// Usage: PORT=8090 node scripts/e2e.js   (expects the server already running)
import WebSocket from 'ws';

const PORT = process.env.PORT || 8090;
const URL = `ws://127.0.0.1:${PORT}/ws`;

const deadline = setTimeout(() => { console.error('✗ e2e timed out'); process.exit(1); }, 60000);

function client(role, name) {
  const ws = new WebSocket(URL);
  const c = {
    ws, name, sync: null, seat: -1,
    send: m => ws.send(JSON.stringify(m)),
    handlers: [],
    onSync(fn) { this.handlers.push(fn); },
  };
  ws.on('open', () => c.send({ t: 'hello', role, name }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'sync') {
      c.sync = m;
      c.seat = m.game?.yourSeat ?? -1;
      for (const fn of [...c.handlers]) fn(m);
    }
    if (m.t === 'input' && c.relayInput) c.relayInput(m);
  });
  return c;
}

const waitFor = (c, pred, label) => new Promise(res => {
  if (c.sync && pred(c.sync)) return res(c.sync);
  const fn = s => { if (pred(s)) { c.handlers.splice(c.handlers.indexOf(fn), 1); res(s); } };
  c.onSync(fn);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
const ok = label => { passed++; console.log(`✓ ${label}`); };

const alice = client('player', 'Alice');
const bob = client('player', 'Bob');
const tv = client('tv');

// Autoplay: whenever it's our turn in Candy Dash, draw (at human-ish pace so
// the save/quit step below happens mid-game, not after it already ended).
for (const c of [alice, bob]) {
  c.onSync(s => {
    if (s.phase === 'game' && s.game?.gameId === 'candydash'
      && s.game.awaiting?.includes(s.game.yourSeat)) {
      setTimeout(() => {
        if (c.sync.phase === 'game') c.send({ t: 'act', a: { t: 'draw' } });
      }, 120);
    }
  });
}

await waitFor(alice, s => s.phase === 'hub', 'hub');
await waitFor(tv, s => s.phase === 'hub');
ok('all clients connected, hub visible');

alice.send({ t: 'openLobby', gameId: 'candydash' });
await waitFor(bob, s => s.phase === 'lobby');
bob.send({ t: 'joinLobby' });
await waitFor(alice, s => s.lobby?.seats.length === 2);
ok('lobby opened and joined');

alice.send({ t: 'start' });
await waitFor(alice, s => s.phase === 'game');
ok('game started');

// Let a few turns happen, then save & quit, then resume.
await sleep(500);
if (alice.sync.phase !== 'game') throw new Error('game ended before the save test could run');
alice.send({ t: 'quitGame' });
await waitFor(alice, s => s.phase === 'hub');
await sleep(600); // allow the debounced save to flush
alice.send({ t: 'resumeGame', gameId: 'candydash' });
const resumed = await waitFor(alice, s => s.phase === 'game');
if (resumed.game.gameId !== 'candydash') throw new Error('resume loaded wrong game');
ok('save & resume works');

await waitFor(alice, s => s.phase === 'gameover');
ok(`candy dash finished: ${alice.sync.game.over?.title}`);
alice.send({ t: 'backToHub' });
await waitFor(alice, s => s.phase === 'hub');

// Relay flow: solo Slam City with the TV ending the game.
tv.relayInput = () => {};
alice.send({ t: 'openLobby', gameId: 'slamcity' });
await waitFor(alice, s => s.phase === 'lobby');
alice.send({ t: 'start' });
await waitFor(tv, s => s.phase === 'game' && s.game?.mode === 'relay');
ok('relay game started, TV notified');
alice.send({ t: 'input', d: { k: 'right', v: true } });
await sleep(150);
tv.send({ t: 'relayEnd', result: { title: 'Test buzzer', lines: [] } });
await waitFor(alice, s => s.phase === 'gameover');
ok('relay game ended by TV');
alice.send({ t: 'backToHub' });
await waitFor(bob, s => s.phase === 'hub');
ok('back to hub');

// Gamepad-player flow: a Bluetooth controller (via the TV socket) claims a
// seat, opens a lobby, and plays a whole game with actions relayed by the TV.
tv.send({ t: 'padHello', pad: 0, name: 'PadOne' });
await waitFor(tv, s => s.pads && s.pads[0]);
ok('pad player joined via TV');
tv.send({ t: 'padMsg', pad: 0, m: { t: 'openLobby', gameId: 'candydash' } });
await waitFor(tv, s => s.phase === 'lobby');
tv.send({ t: 'padMsg', pad: 0, m: { t: 'start' } }); // bots fill the second seat
await waitFor(tv, s => s.phase === 'game' && s.pads[0].seat >= 0);
ok('pad player seated in game');
const padAuto = s => {
  if (s.phase === 'game' && s.game?.gameId === 'candydash' && s.pads?.[0]?.awaited) {
    setTimeout(() => {
      if (tv.sync.phase === 'game') tv.send({ t: 'padMsg', pad: 0, m: { t: 'act', a: { t: 'draw' } } });
    }, 40);
  }
};
tv.onSync(padAuto);
padAuto(tv.sync);
await waitFor(tv, s => s.phase === 'gameover');
ok('pad player finished a full game');
tv.send({ t: 'padMsg', pad: 0, m: { t: 'backToHub' } });
await waitFor(tv, s => s.phase === 'hub');
tv.send({ t: 'padBye', pad: 0 });
await waitFor(tv, s => !s.pads || !s.pads[0]);
ok('pad player left cleanly');

// Hearts with auto-filled bots should start straight away.
bob.send({ t: 'openLobby', gameId: 'hearts' });
await waitFor(bob, s => s.phase === 'lobby');
bob.send({ t: 'start' });
const hs = await waitFor(bob, s => s.phase === 'game');
if (hs.game.seats.filter(x => x.bot).length !== 3) throw new Error('bots not auto-filled');
ok('hearts auto-filled with 3 bots');
bob.send({ t: 'quitGame' });
await waitFor(bob, s => s.phase === 'hub');
bob.send({ t: 'deleteSave', gameId: 'hearts' });
bob.send({ t: 'deleteSave', gameId: 'candydash' });
ok('cleanup done');

console.log(`\nAll ${passed} e2e checks passed.`);
clearTimeout(deadline);
process.exit(0);
