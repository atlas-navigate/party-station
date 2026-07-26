// Settings API — Wi-Fi and display, shared by the phone page (/settings) and
// the TV's on-screen settings menu.
//
// Access control, which the rest of this app deliberately doesn't have:
//
//   * Requests from loopback are trusted outright. The kiosk browser loads
//     http://localhost/tv, so that's the TV's own settings screen — and being
//     in front of the television IS the credential. It's also the only way
//     that screen could work, since it has no keyboard to type a code on.
//
//   * Everything else (i.e. phones on the LAN) must present a 4-digit code
//     that is only ever rendered on the TV. Whoever can see the screen can
//     change the network; a stranger on hotel Wi-Fi who found the box cannot.
//
// Reads are open, writes are gated. Saved passphrases are never returned by
// any endpoint — the helper doesn't expose them and neither do we.
import crypto from 'crypto';
import express from 'express';
import * as hostinfo from './hostinfo.js';
import * as sysctl from './sysctl.js';

const PIN_TTL_MS = 90_000;        // how long a displayed code stays valid
const TOKEN_TTL_MS = 15 * 60_000; // how long a phone stays unlocked
const MAX_PIN_TRIES = 5;

let pin = null;               // { code, expires, tries }
const tokens = new Map();     // token -> expiry timestamp

function now() { return Date.now(); }

function sweep() {
  if (pin && pin.expires < now()) pin = null;
  for (const [t, exp] of tokens) if (exp < now()) tokens.delete(t);
}

// A request from the machine itself — the TV kiosk. Express gives us the
// mapped form for IPv4-over-IPv6 sockets, so check all three spellings.
function isLocal(req) {
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function bearer(req) {
  const h = String(req.get('authorization') || '');
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1] : null;
}

function authed(req) {
  if (isLocal(req)) return true;
  sweep();
  const t = bearer(req);
  return !!(t && tokens.has(t));
}

// What the TV needs to render the code overlay. Read by lobby.js on every
// broadcast, so it must stay cheap and must never leak the code once expired.
export function pinForTv() {
  sweep();
  if (!pin) return null;
  return { code: pin.code, expiresIn: Math.max(0, pin.expires - now()) };
}

function requireAuth(req, res) {
  if (authed(req)) return true;
  res.status(401).json({
    err: 'Enter the code shown on the TV to change settings.',
    needPin: true,
  });
  return false;
}

export function settingsRouter({ onChange } = {}) {
  const router = express.Router();
  const changed = () => { try { onChange?.(); } catch {} };

  // ---------------------------------------------------------------- reading

  router.get('/', async (req, res) => {
    const out = {
      unlocked: authed(req),
      local: isLocal(req),
      supported: sysctl.available(),
      isPi: sysctl.isPi(),
      ...hostinfo.addresses(true),
    };
    if (sysctl.available()) {
      out.display = await sysctl.displayGet().catch(e => ({ err: e.message }));
      out.network = await sysctl.run(['net-status']).catch(e => ({ err: e.message }));
    }
    res.json(out);
  });

  // ------------------------------------------------------------ unlocking

  // Put a fresh code on the TV. Deliberately returns nothing useful: the only
  // way to learn the code is to look at the screen.
  router.post('/pin', (_req, res) => {
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    pin = { code, expires: now() + PIN_TTL_MS, tries: 0 };
    // Also log it, so a station with no TV attached isn't a locked box —
    // whoever has SSH can read it out of the journal.
    console.log(`settings: unlock code ${code} (valid ${PIN_TTL_MS / 1000}s)`);
    changed();
    res.json({ ok: true, expiresIn: PIN_TTL_MS });
  });

  router.post('/unlock', express.json(), (req, res) => {
    sweep();
    if (!pin) return res.status(400).json({ err: 'That code expired — ask for a new one.' });
    if (pin.tries >= MAX_PIN_TRIES) {
      pin = null;
      return res.status(429).json({ err: 'Too many tries — ask for a new code.' });
    }
    pin.tries++;
    const given = String(req.body?.pin || '').trim();
    // Fixed-length compare so a wrong code can't be narrowed down by timing.
    const ok = given.length === pin.code.length
      && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(pin.code));
    if (!ok) return res.status(403).json({ err: 'That code doesn’t match.' });
    pin = null;
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, now() + TOKEN_TTL_MS);
    changed();
    res.json({ ok: true, token, expiresIn: TOKEN_TTL_MS });
  });

  // ------------------------------------------------------------------ wifi

  router.get('/wifi/scan', async (req, res) => {
    if (!requireAuth(req, res)) return;
    try {
      res.json(await sysctl.run(['net-scan']));
    } catch (e) {
      res.status(500).json({ err: e.message });
    }
  });

  router.post('/wifi/connect', express.json(), async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ssid = String(req.body?.ssid || '').trim();
    const password = String(req.body?.password ?? '');
    if (!ssid) return res.status(400).json({ err: 'Pick a network first.' });
    if (password && (password.length < 8 || password.length > 63)) {
      return res.status(400).json({ err: 'A Wi-Fi password is between 8 and 63 characters.' });
    }
    // Warn everyone BEFORE the interface goes down: this phone is about to
    // lose the station, and the address it comes back on will be different.
    changed();
    try {
      const out = await sysctl.run(['net-connect', ssid], { stdin: password });
      hostinfo.invalidate();
      changed();
      res.json(out);
    } catch (e) {
      hostinfo.invalidate();
      changed();
      res.status(502).json({ err: e.message });
    }
  });

  router.post('/wifi/forget', express.json(), async (req, res) => {
    if (!requireAuth(req, res)) return;
    const ssid = String(req.body?.ssid || '').trim();
    if (!ssid) return res.status(400).json({ err: 'Pick a network first.' });
    try {
      const out = await sysctl.run(['net-forget', ssid]);
      changed();
      res.json(out);
    } catch (e) {
      res.status(400).json({ err: e.message });
    }
  });

  // --------------------------------------------------------------- display

  router.post('/display', express.json(), async (req, res) => {
    if (!requireAuth(req, res)) return;
    const mode = String(req.body?.mode || '');
    if (mode !== '1080p' && mode !== 'native') {
      return res.status(400).json({ err: 'Pick either 1080p or native.' });
    }
    try {
      const out = await sysctl.displaySet(mode);
      changed();
      res.json(out);
    } catch (e) {
      res.status(500).json({ err: e.message });
    }
  });

  // ---------------------------------------------------------------- reboot

  // Changing the display mode usually needs a restart to take hold, so offer
  // it here rather than making someone pull the plug.
  router.post('/reboot', (req, res) => {
    if (!requireAuth(req, res)) return;
    res.json({ ok: true });
    setTimeout(() => {
      sysctl.run(['reboot']).catch(() => {});
    }, 500);
  });

  return router;
}
