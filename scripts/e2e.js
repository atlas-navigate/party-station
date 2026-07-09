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
      }, 250); // slow enough that even a lucky short game outlives the 500ms save test
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

// Cabinet (RetroArch) flow — runs only when the server sees an emulator
// setup (real, or the fake one the test harness fabricates via env vars).
if (alice.sync.emu?.available) {
  // ROM upload API: extension routing, override, listing, delete, and the
  // scp "incoming" folder sorter.
  const base = `http://127.0.0.1:${PORT}`;
  const romsDir = process.env.ROMS_DIR;
  const upload = (name, system = 'auto') =>
    fetch(`${base}/api/roms?name=${encodeURIComponent(name)}&system=${system}`,
      { method: 'POST', body: 'fake-rom-bytes' });

  let r = await (await upload('Super Test (USA).sfc')).json();
  if (r.system !== 'snes') throw new Error('.sfc did not route to snes: ' + JSON.stringify(r));
  r = await (await upload('coinop.zip')).json();
  if (r.system !== 'arcade') throw new Error('.zip did not route to arcade');
  r = await (await upload('console game.zip', 'snes')).json();
  if (r.system !== 'snes') throw new Error('explicit system override ignored');
  r = await (await upload('mystery.xyz')).json();
  if (!r.err) throw new Error('unknown extension should be rejected');
  const lib = await (await fetch(`${base}/api/roms`)).json();
  const snes = lib.systems.find(s => s.id === 'snes');
  if (!snes || !snes.files.some(f => f.file === 'Super Test (USA).sfc')) {
    throw new Error('uploaded ROM missing from library listing');
  }
  ok('ROM upload routes by extension (override + rejects unknowns)');

  // Zipped console games get sniffed by their contents and UNPACKED into
  // the right system, instead of being dumped whole into arcade.
  const zipOf = (inner, data, method = 0, rawLen = data.length) => {
    const nameBuf = Buffer.from(inner);
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(data.length, 18); lfh.writeUInt32LE(rawLen, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(data.length, 20); cdh.writeUInt32LE(rawLen, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(46 + nameBuf.length, 12);
    eocd.writeUInt32LE(30 + nameBuf.length + data.length, 16);
    return Buffer.concat([lfh, nameBuf, data, cdh, nameBuf, eocd]);
  };
  r = await (await fetch(`${base}/api/roms?name=${encodeURIComponent('Monopoly Test.zip')}&system=auto`,
    { method: 'POST', body: zipOf('Monopoly Test.gb', Buffer.from('GBDATA')) })).json();
  if (r.system !== 'gb' || r.file !== 'Monopoly Test.gb') {
    throw new Error('stored zip was not unpacked to gb: ' + JSON.stringify(r));
  }
  ok('zipped console ROM unpacked by contents (.gb inside → gb/)');

  const { deflateRawSync } = await import('zlib');
  const chdRaw = Buffer.from('FAKE-CHD-DISC-IMAGE-BYTES-0123456789');
  r = await (await fetch(`${base}/api/roms?name=${encodeURIComponent('Blitz Test.zip')}&system=auto`,
    { method: 'POST', body: zipOf('Blitz Test.chd', deflateRawSync(chdRaw), 8, chdRaw.length) })).json();
  if (r.system !== 'psx' || r.file !== 'Blitz Test.chd') {
    throw new Error('deflated chd zip was not unpacked to psx: ' + JSON.stringify(r));
  }
  const { default: fsChk } = await import('fs');
  const { default: pathChk } = await import('path');
  if (process.env.ROMS_DIR) {
    const extractedBytes = fsChk.readFileSync(pathChk.join(process.env.ROMS_DIR, 'psx', 'Blitz Test.chd'));
    if (!extractedBytes.equals(chdRaw)) throw new Error('deflated chd bytes corrupted on extraction');
  }
  ok('zipped PS1 .chd unpacked with correct bytes (deflate)');

  if (romsDir) {
    const { default: fs } = await import('fs');
    const { default: path } = await import('path');
    const inc = path.join(romsDir, 'incoming');
    fs.mkdirSync(inc, { recursive: true });
    fs.writeFileSync(path.join(inc, 'Dropped Game.nes'), 'fake-nes');
    const deadline2 = Date.now() + 15000;
    let sorted = false;
    while (Date.now() < deadline2) {
      if (fs.existsSync(path.join(romsDir, 'nes', 'Dropped Game.nes'))) { sorted = true; break; }
      await sleep(200);
    }
    if (!sorted) throw new Error('incoming/ file was not sorted into nes/');
    ok('scp incoming folder sorts ROMs automatically');
  }

  for (const [sys, file] of [['snes', 'Super Test (USA).sfc'], ['arcade', 'coinop.zip'],
                             ['snes', 'console game.zip'], ['nes', 'Dropped Game.nes'],
                             ['gb', 'Monopoly Test.gb'], ['psx', 'Blitz Test.chd']]) {
    await fetch(`${base}/api/roms/${sys}/${encodeURIComponent(file)}`, { method: 'DELETE' });
  }
  const lib2 = await (await fetch(`${base}/api/roms`)).json();
  if (lib2.systems.some(s => s.files.some(f => f.file.includes('Super Test')))) {
    throw new Error('delete did not remove the ROM');
  }
  ok('ROM delete works');

  const sys = alice.sync.emu.systems[0];
  alice.send({ t: 'emuLaunch', system: sys.id, file: sys.games[0].file });
  await waitFor(alice, s => !!s.emulator);
  ok(`emulator launched: ${alice.sync.emulator.title}`);
  alice.send({ t: 'openLobby', gameId: 'hearts' });
  await sleep(300);
  if (alice.sync.phase !== 'hub' || !alice.sync.emulator) throw new Error('lobby opened during emulator!');
  ok('game launches blocked while the cabinet is running');
  alice.send({ t: 'emuKill' });
  await waitFor(alice, s => !s.emulator);
  ok('emulator force-quit returns control to the hub');
} else {
  console.log('· cabinet checks skipped (no emulator configured)');
}

console.log(`\nAll ${passed} e2e checks passed.`);
clearTimeout(deadline);
process.exit(0);
