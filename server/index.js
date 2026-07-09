// Party Station — local party game server.
// Serves the player app (/) and TV app (/tv), and speaks WebSocket to both.
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { handleConnection, isIdle, notifyClients } from './lobby.js';
import * as emulator from './emulator.js';
import { romsRouter, startIncomingSorter } from './roms.js';
import * as updater from './updater.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.get('/tv', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'tv.html')));
app.get('/roms', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'roms.html')));
app.use('/api/roms', romsRouter({
  onChange: () => { emulator.scan(true); notifyClients(); },
}));
// Ctrl+Alt+Q on the TV (attached keyboard) lands here: flag the kiosk
// launcher (scripts/kiosk.sh watches for this file) to close Chromium and
// stop relaunching, dropping to the Pi desktop for troubleshooting.
app.post('/api/kiosk/exit', (_req, res) => {
  const dir = path.join(os.homedir(), '.config', 'party-station-kiosk');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'stop'), new Date().toISOString());
    console.log('kiosk: exit requested from the TV keyboard');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, err: e.message });
  }
});
app.get('/api/status', (_req, res) => res.json({
  ok: true,
  version: updater.status.version,
  updateAvailable: updater.status.updateAvailable,
  updating: updater.status.updating,
  lastCheck: updater.status.lastCheck ? new Date(updater.status.lastCheck).toISOString() : null,
  updateError: updater.status.error,
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => handleConnection(ws));

// Keepalive: terminate dead sockets so seats free up promptly.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._dead) { ws.terminate(); continue; }
    ws._dead = true;
    ws.ping();
  }
}, 30000);
wss.on('connection', ws => {
  ws._dead = false;
  ws.on('pong', () => { ws._dead = false; });
  ws.on('message', () => { ws._dead = false; });
});

server.listen(PORT, () => {
  const nets = Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  // mDNS advertises the machine's real hostname — only the Pi is actually
  // named "party-station". On a dev box, print the name that will resolve
  // (scripts/dev-mdns.sh can alias party-station.local for testing).
  const mdnsName = `${os.hostname().toLowerCase()}.local`;
  console.log(`Party Station on port ${PORT}`);
  console.log(`  Players: http://${mdnsName}${PORT === 80 ? '' : ':' + PORT}`);
  for (const ip of nets) console.log(`  (or http://${ip}${PORT === 80 ? '' : ':' + PORT})`);
  console.log(`  TV:      add /tv to either URL`);
});

updater.init({ isIdle, onStatusChange: notifyClients });
startIncomingSorter({ onChange: () => { emulator.scan(true); notifyClients(); } });
