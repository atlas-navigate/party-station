// Route the Pi's sound to HDMI so audio comes out of the TV.
// Raspberry Pi OS Bookworm runs PipeWire (with the PulseAudio shim); its
// default output can point at the 3.5mm headphone jack, leaving the console
// mysteriously silent. At boot, find the HDMI sink in the kiosk user's
// session and make it the default. Real Pi only — never touches a dev box.
import { execFile } from 'child_process';
import fs from 'fs';

const RETRY_MS = 5000;
const MAX_TRIES = 60; // the desktop session (and its PipeWire) starts after us

function isPi() {
  try {
    return fs.readFileSync('/proc/device-tree/model', 'utf8').toLowerCase().includes('raspberry pi');
  } catch { return false; }
}

// The service has no session env — aim pactl at the desktop user's runtime
// dir (same user; see systemd/party-station.service).
function pactl(args) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const env = { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}` };
  return new Promise((resolve, reject) => {
    execFile('pactl', args, { env, timeout: 5000 },
      (err, stdout) => err ? reject(err) : resolve(stdout));
  });
}

export function defaultAudioToHdmi() {
  if (!isPi()) return;
  let tries = 0;
  const attempt = async () => {
    tries++;
    try {
      const sinks = (await pactl(['list', 'short', 'sinks'])).split('\n').filter(Boolean);
      const hdmi = sinks.map(l => l.split('\t')[1]).find(n => /hdmi/i.test(n || ''));
      if (hdmi) {
        await pactl(['set-default-sink', hdmi]);
        console.log(`audio: default output → ${hdmi} (HDMI)`);
        return;
      }
    } catch {} // PipeWire not up yet (or no pactl) — retry below
    if (tries < MAX_TRIES) setTimeout(attempt, RETRY_MS).unref();
    else console.log('audio: no HDMI sink found after 5 minutes — leaving the default output alone');
  };
  attempt();
}
