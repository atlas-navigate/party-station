// Test helper: joins as a phone player, opens a lobby for the given game, and
// starts it (bots fill all other seats) so a TV client can be screenshotted.
// Usage: PORT=8090 node scripts/shot-setup.js <gameId> [seconds]
import WebSocket from 'ws';

const gameId = process.argv[2] || 'hearts';
const seconds = Number(process.argv[3] || 25);
const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT || 8090}/ws`);
const send = m => ws.send(JSON.stringify(m));

ws.on('open', () => send({ t: 'hello', role: 'player', name: 'Cam' }));
let started = false;
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t !== 'sync') return;
  if (m.phase === 'hub' && !started) { started = true; send({ t: 'openLobby', gameId }); }
  else if (m.phase === 'lobby' && m.lobby?.youAreHost) send({ t: 'start' });
});
setTimeout(() => process.exit(0), seconds * 1000);
