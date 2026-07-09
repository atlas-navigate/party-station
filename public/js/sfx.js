// Synthesized console sounds for the TV — pure WebAudio oscillators, zero
// audio assets (the Pi may be offline). The kiosk launches Chromium with
// autoplay allowed, so the context can start without a user gesture.
// Every effect is fire-and-forget and swallows errors (no speakers, blocked
// autoplay, whatever) — sound must never break the console.
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.07, glideTo = 0, at = 0 } = {}) {
  const c = ac();
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const wrap = fn => (...a) => { try { fn(...a); } catch {} };

export const sfx = {
  blip: wrap(() => tone(660, 0.05, { vol: 0.045 })),                     // menu move
  select: wrap(() => { tone(523, 0.06); tone(784, 0.09, { at: 0.055 }); }), // confirm
  back: wrap(() => tone(440, 0.09, { glideTo: 230 })),                   // cancel/back
  toast: wrap(() => tone(880, 0.09, { type: 'sine', vol: 0.055 })),      // notice
  nope: wrap(() => tone(150, 0.2, { type: 'sawtooth', vol: 0.06 })),     // rejected
  turn: wrap(() => { tone(659, 0.09, { type: 'sine' }); tone(988, 0.13, { type: 'sine', at: 0.09 }); }),
  start: wrap(() => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.12, { at: i * 0.11 }))),
  over: wrap(() => [784, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.4 : 0.11, { at: i * 0.12 }))),
};
