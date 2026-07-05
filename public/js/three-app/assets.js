// Procedural 3D assets — no downloads, everything drawn into canvas textures
// or built from primitives, so the console works fully offline.
import { THREE } from './scene.js';

const texCache = new Map();

export function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 2;
  texCache.set(key, t);
  return t;
}

export const SEAT_COLORS = [0xffb52e, 0xff5d73, 0x3ecf8e, 0xb78bff, 0x7fc8f8, 0xf472b6];
export const SEAT_CSS = ['#ffb52e', '#ff5d73', '#3ecf8e', '#b78bff', '#7fc8f8', '#f472b6'];

const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = { T: '10' };

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function cardFaceTex(code) {
  return canvasTex('card:' + code, 128, 180, (g, w, h) => {
    g.fillStyle = '#fdfbf5';
    roundRect(g, 0, 0, w, h, 12); g.fill();
    const r = code[0], s = code[1];
    const red = s === 'h' || s === 'd';
    g.fillStyle = red ? '#d22c47' : '#1c1c28';
    const label = (RANK_LABEL[r] || r);
    g.font = '800 34px system-ui';
    g.textAlign = 'left';
    g.fillText(label, 10, 38);
    g.font = '30px system-ui';
    g.fillText(SUIT_GLYPH[s], 10, 68);
    g.font = '64px system-ui';
    g.textAlign = 'center';
    g.fillText(SUIT_GLYPH[s], w / 2, h / 2 + 44);
    g.save();
    g.translate(w - 10, h - 38); g.rotate(Math.PI);
    g.font = '800 34px system-ui'; g.textAlign = 'left';
    g.fillText(label, 0, 0);
    g.restore();
  });
}

function cardBackTex() {
  return canvasTex('card:back', 128, 180, (g, w, h) => {
    g.fillStyle = '#fdfbf5';
    roundRect(g, 0, 0, w, h, 12); g.fill();
    g.fillStyle = '#232741';
    roundRect(g, 7, 7, w - 14, h - 14, 8); g.fill();
    g.strokeStyle = '#3a4170'; g.lineWidth = 5;
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    }
    g.strokeStyle = '#ffb52e'; g.lineWidth = 4;
    roundRect(g, 7, 7, w - 14, h - 14, 8); g.stroke();
  });
}

export const CARD_W = 0.62, CARD_H = 0.87, CARD_T = 0.012;
const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
const cardSideMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d8 });
const matCache = new Map();

function cardMat(tex) {
  if (!matCache.has(tex)) matCache.set(tex, new THREE.MeshLambertMaterial({ map: tex }));
  return matCache.get(tex);
}

// A playing card lying flat (face up) at y=0. Flip by rotating .rotation.y += PI.
export function makeCard(code) {
  const face = code && code !== 'back' ? cardFaceTex(code) : cardBackTex();
  const back = cardMat(cardBackTex());
  const mesh = new THREE.Mesh(cardGeo, [
    cardSideMat, cardSideMat, cardSideMat, cardSideMat, cardMat(face), back,
  ]);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function makeChip(colorHex) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.045, 20),
    new THREE.MeshLambertMaterial({ color: colorHex }));
  return m;
}

export function makeChipStack(colorHex, n) {
  const g = new THREE.Group();
  for (let i = 0; i < Math.min(n, 8); i++) {
    const c = makeChip(colorHex);
    c.position.y = 0.025 + i * 0.048;
    c.rotation.y = Math.random();
    g.add(c);
  }
  return g;
}

function dieFaceTex(n) {
  return canvasTex('die:' + n, 64, 64, (g) => {
    g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#1c1c28';
    const P = { 1: [[32, 32]], 2: [[18, 18], [46, 46]], 3: [[16, 16], [32, 32], [48, 48]],
      4: [[18, 18], [46, 18], [18, 46], [46, 46]],
      5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]],
      6: [[18, 14], [46, 14], [18, 32], [46, 32], [18, 50], [46, 50]] };
    for (const [x, y] of P[n]) { g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill(); }
  });
}

// Materials order +x,-x,+y,-y,+z,-z ; face values arranged so we can aim any
// value upward with a simple rotation lookup.
const DIE_ROT = { 1: [0, 0, -Math.PI / 2], 2: [Math.PI / 2, 0, 0], 3: [0, 0, 0],
  4: [Math.PI, 0, 0], 5: [-Math.PI / 2, 0, 0], 6: [0, 0, Math.PI / 2] };

export function makeDie(size = 0.42) {
  const mats = [1, 6, 3, 4, 2, 5].map(n => new THREE.MeshLambertMaterial({ map: dieFaceTex(n) }));
  const die = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
  die.userData.size = size;
  return die;
}

// Tumble a die and land it showing `value`; returns a promise via sc.tween.
export function rollDie(sc, die, value, dur = 700) {
  const [rx, ry, rz] = DIE_ROT[value];
  const spins = 2 + Math.floor(Math.random() * 2);
  const from = { x: die.rotation.x, y: die.rotation.y, z: die.rotation.z };
  const baseY = die.position.y;
  return sc.tween((v, t) => {
    die.rotation.x = from.x + (rx + spins * 2 * Math.PI - from.x) * v;
    die.rotation.z = from.z + (rz + spins * 2 * Math.PI - from.z) * v;
    die.rotation.y = ry;
    die.position.y = baseY + Math.abs(Math.sin(t * Math.PI * 2.2)) * 0.9 * (1 - t);
  }, 0, 1, dur);
}

// A little player pawn: cone body + sphere head.
export function makeToken(colorHex) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: colorHex });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 14), mat);
  body.position.y = 0.17;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), mat);
  head.position.y = 0.4;
  g.add(body, head);
  return g;
}

export function makeHouse(colorHex, big = false) {
  const s = big ? 1.6 : 1;
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.16 * s, 0.12 * s, 0.16 * s),
    new THREE.MeshLambertMaterial({ color: colorHex }));
  base.position.y = 0.06 * s;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.13 * s, 0.1 * s, 4),
    new THREE.MeshLambertMaterial({ color: 0xb33939 }));
  roof.position.y = 0.17 * s;
  roof.rotation.y = Math.PI / 4;
  g.add(base, roof);
  return g;
}

// Crisp DOM-quality text as a sprite (for names/labels floating in the scene).
export function makeLabel(text, { size = 26, color = '#f2efe4', bg = null, pad = 10 } = {}) {
  const font = `800 ${size}px system-ui`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const tw = Math.ceil(meas.measureText(text).width) + pad * 2;
  const th = size + pad * 2;
  const tex = canvasTex(`label:${text}:${size}:${color}:${bg}`, tw, th, g => {
    if (bg) { g.fillStyle = bg; roundRect(g, 0, 0, tw, th, th / 3); g.fill(); }
    g.font = font; g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, tw / 2, th / 2 + 1);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  const k = 0.011;
  sp.scale.set(tw * k, th * k, 1);
  return sp;
}

export function makeFeltTable(radius = 6) {
  const g = new THREE.Group();
  const felt = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.18, 48),
    new THREE.MeshLambertMaterial({ color: 0x1e6b45 }));
  felt.position.y = -0.09;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.22, 12, 48),
    new THREE.MeshLambertMaterial({ color: 0x4a3320 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  g.add(felt, rim);
  return g;
}

export function makeGroundPlane(w, d, colorHex) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.2, d),
    new THREE.MeshLambertMaterial({ color: colorHex }));
  m.position.y = -0.1;
  return m;
}

// A glowing marker ring used as the selection cursor for gamepad players.
export function makeCursorRing(colorHex = 0xffb52e) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.05, 8, 24),
    new THREE.MeshBasicMaterial({ color: colorHex }));
  m.rotation.x = Math.PI / 2;
  return m;
}
