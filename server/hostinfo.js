// Where phones can actually reach this station.
//
// The TV kiosk loads http://localhost/tv, so anything derived from the
// browser's own URL says "localhost" — useless to a guest holding a phone.
// The server is the only party that knows the real answer, so it computes it
// here and ships it to clients in the sync payload.
//
// Cached briefly: broadcast() calls this on every state change, but the
// addresses do change under us when someone switches Wi-Fi, so the cache has
// to expire rather than being computed once at boot.
import os from 'os';

const TTL_MS = 5000;
let cache = null;
let cachedAt = 0;

export function addresses(force = false) {
  const now = Date.now();
  if (!force && cache && now - cachedAt < TTL_MS) return cache;
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal)
    .map(n => n.address);
  cache = {
    // mDNS advertises the machine's real hostname — only the Pi is actually
    // named "party-station", so don't hardcode it.
    host: `${os.hostname().toLowerCase()}.local`,
    ips,
  };
  cachedAt = now;
  return cache;
}

export function invalidate() { cache = null; }

// The single address to put on the TV: the mDNS name if we have one, else the
// first real IP. Port is included only when it isn't the default.
export function joinUrl(port) {
  const { host, ips } = addresses();
  const suffix = !port || Number(port) === 80 ? '' : `:${port}`;
  return `${host || ips[0] || 'party-station.local'}${suffix}`;
}
