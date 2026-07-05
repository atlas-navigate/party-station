// Combat Legends — 1v1 arcade fighter in 3D. Simulation runs on the TV;
// phones stream inputs, Bluetooth pads are polled locally. Best of 3.
import { createScene, THREE } from '../three-app/scene.js';
import { makeLabel } from '../three-app/assets.js';

export const player = {
  pad: {
    dpad: ['left', 'right', 'up'],
    buttons: [['p', '👊', 'marquee'], ['k', '🦵', 'cards'], ['s', '⚡', 'arcade'], ['b', '🛡️', 'board']],
  },
};

const W = 960, FLOOR = 440, GRAV = 0.8;
const ATTACKS = {
  p: { range: 74, dmg: 6, startup: 6, active: 5, recover: 10 },
  k: { range: 100, dmg: 11, startup: 13, active: 6, recover: 20 },
};
const F_HEX = [[0xffb52e, 0xc47f0e], [0xb78bff, 0x7a51c2]];
const F_CSS = ['#ffb52e', '#b78bff'];

const w2x = x => (x - W / 2) / 84;
const w2y = y => Math.max(0, (FLOOR - y) / 84);

function makeFighterMesh(sc, i) {
  const [c1, c2] = F_HEX[i];
  const g = new THREE.Group();
  const mats = { main: new THREE.MeshLambertMaterial({ color: c1 }), dark: new THREE.MeshLambertMaterial({ color: c2 }) };
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), mats.dark);
  hips.position.y = 0.75;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), mats.main);
  torso.position.y = 1.24;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.78;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.42), mats.dark);
  band.position.y = 1.84;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), mats.dark);
  legL.position.set(0, 0.31, 0.12);
  const legR = legL.clone();
  legR.position.z = -0.12;
  const armF = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), mats.main); // front arm (attacks)
  armF.geometry.translate(0.25, 0, 0);
  armF.position.set(0.2, 1.32, 0.16);
  const armB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.14), mats.main);
  armB.geometry.translate(0.2, 0, 0);
  armB.position.set(0.14, 1.28, -0.18);
  const legKick = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.16), mats.dark);
  legKick.geometry.translate(0.33, 0, 0);
  legKick.position.set(0.1, 0.7, 0.06);
  legKick.visible = false;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0.3 }));
  shield.position.y = 1.2;
  shield.visible = false;
  g.add(hips, torso, head, band, legL, legR, armF, armB, legKick, shield);
  g.userData = { armF, legKick, shield, legL, legR };
  sc.scene.add(g);
  return g;
}

export const tv = {
  start(holder, ctx) {
    const sc = createScene(holder, {
      camPos: [0, 3.1, 9.6], lookAt: [0, 1.6, 0], fov: 40, continuous: true, bg: 0x171224,
    });
    // Dojo arena.
    const mat = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.22, 4.6),
      new THREE.MeshLambertMaterial({ color: 0x5c3a4e }));
    mat.position.y = -0.11;
    sc.scene.add(mat);
    const matTop = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.05, 4.0),
      new THREE.MeshLambertMaterial({ color: 0x6e4a60 }));
    matTop.position.y = 0.03;
    sc.scene.add(matTop);
    for (let x = -5.6; x <= 5.6; x += 1.6) { // paper-screen back wall
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.08),
        new THREE.MeshLambertMaterial({ color: 0x2a2036 }));
      panel.position.set(x, 1.8, -2.9);
      sc.scene.add(panel);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.0, 0.04),
        new THREE.MeshLambertMaterial({ color: 0x4a3c5c }));
      paper.position.set(x, 1.8, -2.86);
      sc.scene.add(paper);
    }
    for (const dx of [-6.4, 6.4]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xff9445, emissive: 0x552200 }));
      lantern.position.set(dx, 3.0, -1.5);
      sc.scene.add(lantern);
    }

    const names = [
      ctx.seats[0] ? ctx.seats[0].name : 'Vector',
      ctx.seats[1] ? ctx.seats[1].name : 'Vector',
    ];
    const isCpu = [!ctx.seats[0] || ctx.seats[0].bot, !ctx.seats[1] || ctx.seats[1].bot];
    const meshes = [makeFighterMesh(sc, 0), makeFighterMesh(sc, 1)];
    const keys = [{}, {}];
    const wins = [0, 0];
    let round = 1, roundClock = 0, phase = 'intro', phaseTtl = 120;
    let projectiles = [];
    const projMeshes = new Map();
    let ended = false;
    let koText = '', koWinner = -1;
    let f = [];

    const kk4 = i => {
      const ws = keys[i] || {};
      const pd = key => ctx.padDown && ctx.padDown(i, key);
      return {
        left: ws.left || pd('left'), right: ws.right || pd('right'), up: ws.up || pd('up'),
        p: ws.p || pd('a'), k: ws.k || pd('x'), b: ws.b || pd('b'), s: ws.s || pd('y'),
      };
    };

    function resetRound() {
      f = [0, 1].map(i => ({
        i, x: i === 0 ? 300 : 660, y: FLOOR, vx: 0, vy: 0,
        hp: 100, face: i === 0 ? 1 : -1,
        state: 'idle', t: 0, atk: null, cool: 0, special: 0, stun: 0,
      }));
      for (const [, m] of projMeshes) sc.scene.remove(m);
      projMeshes.clear();
      projectiles = [];
      roundClock = 60 * 60;
    }

    function cpuKeys(me, foe) {
      const kk = {};
      const dist = Math.abs(foe.x - me.x);
      kk[foe.x > me.x ? 'right' : 'left'] = dist > 80 && Math.random() < 0.8;
      if (dist < 110 && Math.random() < 0.09) kk[Math.random() < 0.6 ? 'p' : 'k'] = true;
      if (foe.state === 'attack' && Math.random() < 0.25) kk.b = true;
      if (dist > 300 && me.special <= 0 && Math.random() < 0.03) kk.s = true;
      if (Math.random() < 0.008 && me.y >= FLOOR) kk.up = true;
      return kk;
    }

    function hurt(me, dmg, dir) {
      if (me.state === 'block') dmg = Math.ceil(dmg * 0.2);
      me.hp = Math.max(0, me.hp - dmg);
      me.stun = me.state === 'block' ? 6 : 16;
      me.vx = dir * 7;
      if (me.state !== 'block') { me.state = 'hit'; me.t = 0; me.atk = null; }
    }

    function stepFighter(me, foe) {
      const kk = isCpu[me.i] ? cpuKeys(me, foe) : kk4(me.i);
      me.face = foe.x > me.x ? 1 : -1;
      if (me.cool > 0) me.cool--;
      if (me.special > 0) me.special--;
      if (me.stun > 0) { me.stun--; me.x += me.vx; me.vx *= 0.85; }
      else {
        if (me.state === 'hit') me.state = 'idle';
        if (me.state === 'attack') {
          me.t++;
          const a = ATTACKS[me.atk];
          if (me.t === a.startup + 1) {
            if (Math.abs(foe.x - me.x) < a.range + 40 && Math.abs(foe.y - me.y) < 70) {
              hurt(foe, a.dmg, me.face);
            }
          }
          if (me.t > a.startup + a.active + a.recover) { me.state = 'idle'; me.atk = null; }
        } else {
          me.state = kk.b && me.y >= FLOOR ? 'block' : 'idle';
          if (me.state !== 'block') {
            me.vx = kk.left ? -4.4 : kk.right ? 4.4 : 0;
            me.x += me.vx;
            if (kk.up && me.y >= FLOOR) me.vy = -15;
            if ((kk.p || kk.k) && me.cool === 0) {
              me.state = 'attack'; me.atk = kk.p ? 'p' : 'k'; me.t = 0;
              me.cool = 14;
            } else if (kk.s && me.special === 0) {
              me.special = 170;
              projectiles.push({ id: Math.random(), x: me.x + me.face * 40, y: me.y - 62, vx: me.face * 9, owner: me.i, ttl: 130 });
            }
          }
        }
      }
      me.vy += GRAV;
      me.y = Math.min(FLOOR, me.y + me.vy);
      if (me.y === FLOOR) me.vy = 0;
      me.x = Math.max(50, Math.min(W - 50, me.x));
    }

    function nextRoundOrEnd() {
      if (wins[0] === 2 || wins[1] === 2 || round === 3) {
        if (!ended) {
          ended = true;
          const w = wins[0] === wins[1] ? -1 : wins[0] > wins[1] ? 0 : 1;
          ctx.end({
            title: w < 0 ? 'Double K.O. — a draw!' : `${names[w]} WINS! 🏆`,
            lines: [`Rounds: ${names[0]} ${wins[0]} — ${wins[1]} ${names[1]}`],
          });
        }
        return;
      }
      round++;
      resetRound();
      phase = 'intro';
      phaseTtl = 110;
    }

    function step() {
      if (phase === 'intro' || phase === 'ko') {
        if (--phaseTtl <= 0) {
          if (phase === 'intro') phase = 'fight';
          else nextRoundOrEnd();
        }
        return;
      }
      roundClock--;
      stepFighter(f[0], f[1]);
      stepFighter(f[1], f[0]);
      for (const pr of projectiles) {
        pr.x += pr.vx; pr.ttl--;
        const foe = f[1 - pr.owner];
        if (Math.abs(foe.x - pr.x) < 42 && Math.abs(foe.y - 60 - pr.y) < 66) {
          hurt(foe, 12, Math.sign(pr.vx));
          pr.ttl = 0;
        }
      }
      projectiles = projectiles.filter(p => p.ttl > 0 && p.x > -20 && p.x < W + 20);
      if (f[0].hp <= 0 || f[1].hp <= 0 || roundClock <= 0) {
        const w = f[0].hp === f[1].hp ? -1 : f[0].hp > f[1].hp ? 0 : 1;
        if (w >= 0) wins[w]++;
        phase = 'ko';
        phaseTtl = 140;
        koText = f[0].hp <= 0 || f[1].hp <= 0 ? 'K.O.!' : w < 0 ? 'DRAW!' : 'TIME!';
        koWinner = w;
      }
    }

    const hudBars = document.createElement('div');
    hudBars.style.cssText = 'position:absolute;left:0;right:0;top:10px;display:flex;justify-content:space-between;'
      + 'padding:0 26px;gap:16px;align-items:center;';
    const hudBanner = document.createElement('div');
    hudBanner.style.cssText = 'position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);font-weight:800;'
      + 'font-size:64px;color:#ffb52e;text-shadow:0 4px 18px #000;display:none;';
    sc.hud.append(hudBars, hudBanner);

    function bar(i) {
      const pct = f[i] ? f[i].hp : 100;
      const dir = i === 0 ? 'right' : 'left';
      return `<div style="flex:1;max-width:44%">
        <div style="background:#10121fee;border-radius:9px;padding:3px">
          <div style="height:16px;border-radius:7px;width:${pct}%;margin-${i === 0 ? 'left' : 'right'}:auto;
            background:${pct > 30 ? F_CSS[i] : '#ff5d73'}"></div>
        </div>
        <div style="font-weight:800;font-size:15px;margin-top:3px;text-align:${dir === 'right' ? 'left' : 'right'};color:#f2efe4">
          ${names[i]} ${'●'.repeat(wins[i])}</div>
      </div>`;
    }

    function syncMeshes() {
      for (const i of [0, 1]) {
        const me = f[i], m = meshes[i], U = m.userData;
        m.position.set(w2x(me.x), w2y(me.y), 0);
        m.rotation.y = me.face === 1 ? 0 : Math.PI;
        const punching = me.state === 'attack' && me.atk === 'p' && me.t > ATTACKS.p.startup - 3;
        const kicking = me.state === 'attack' && me.atk === 'k' && me.t > ATTACKS.k.startup - 4;
        U.armF.rotation.z = punching ? 0 : -0.5;
        U.armF.scale.x = punching ? 1.35 : 1;
        U.legKick.visible = kicking;
        U.legL.visible = U.legR.visible = !kicking;
        U.shield.visible = me.state === 'block';
        if (me.state === 'hit') m.position.x += (Math.random() - 0.5) * 0.08;
      }
      const seen = new Set();
      for (const pr of projectiles) {
        seen.add(pr.id);
        let m = projMeshes.get(pr.id);
        if (!m) {
          m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
            new THREE.MeshLambertMaterial({ color: 0x7de3ff, emissive: 0x2a6a88 }));
          projMeshes.set(pr.id, m);
          sc.scene.add(m);
        }
        m.position.set(w2x(pr.x), w2y(pr.y) + 0.2, 0.1);
        m.scale.setScalar(1 + Math.sin(Date.now() / 60) * 0.15);
      }
      for (const [id, m] of [...projMeshes]) {
        if (!seen.has(id)) { sc.scene.remove(m); projMeshes.delete(id); }
      }
      const clock = `<div style="font-weight:800;font-size:30px;background:#10121fee;border-radius:12px;padding:6px 16px;color:#f2efe4">
        ${Math.max(0, Math.ceil(roundClock / 60))}</div>`;
      hudBars.innerHTML = bar(0) + clock + bar(1);
      if (phase === 'intro') {
        hudBanner.style.display = 'block';
        hudBanner.textContent = phaseTtl > 50 ? `ROUND ${round}` : 'FIGHT!';
      } else if (phase === 'ko') {
        hudBanner.style.display = 'block';
        hudBanner.textContent = koWinner >= 0 ? `${koText} ${names[koWinner]} takes round ${round}` : koText;
      } else hudBanner.style.display = 'none';
    }

    resetRound();
    sc.onTick(() => { if (!ended) { step(); syncMeshes(); } });

    return {
      input(seat, d) { if (keys[seat]) keys[seat][d.k] = d.v; },
      stop() { ended = true; sc.dispose(); },
      rehome: h2 => sc.rehome(h2),
    };
  },
};
