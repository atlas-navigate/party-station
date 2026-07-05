// Slam City — 2v2 arcade hoops in 3D. The simulation runs on the TV (Pi);
// phones stream gamepad input over the wire and Bluetooth pads are polled
// locally. Physics stays in classic 2D arcade coords, rendered as a 3D court.
import { createScene, THREE } from '../three-app/scene.js';
import { canvasTex, makeLabel, SEAT_CSS } from '../three-app/assets.js';

export const player = {
  pad: { dpad: ['left', 'right', 'up'], buttons: [['a', '🏀', 'marquee'], ['b', '🤝', 'board']] },
};

const W = 960, FLOOR = 470, GRAV = 0.65;
const HOOPS = [{ x: 78, y: 235, dir: 1 }, { x: 882, y: 235, dir: -1 }];
const TEAM_HEX = [0xffb52e, 0xb78bff];
const TEAM_CSS = ['#ffb52e', '#b78bff'];

const w2x = x => (x - W / 2) / 78;
const w2y = y => Math.max(0, (FLOOR - y) / 78);

function courtTex() {
  return canvasTex('sc:court', 1024, 400, g => {
    g.fillStyle = '#b07a3e'; g.fillRect(0, 0, 1024, 400);
    for (let x = 0; x < 1024; x += 42) {
      g.fillStyle = x % 84 ? '#a8743a' : '#b57f42';
      g.fillRect(x, 0, 42, 400);
    }
    g.strokeStyle = '#f2efe4'; g.lineWidth = 6;
    g.strokeRect(10, 10, 1004, 380);
    g.beginPath(); g.moveTo(512, 10); g.lineTo(512, 390); g.stroke();
    g.beginPath(); g.arc(512, 200, 70, 0, 7); g.stroke();
    for (const cx of [10, 1014]) {
      g.beginPath(); g.arc(cx, 200, 190, 0, 7); g.stroke();
    }
  });
}

function makeHoop(sc, side) {
  const g = new THREE.Group();
  const x = side * 5.15;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x8a8f9e }));
  pole.position.set(x + side * 0.55, 1.55, 0);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.05, 1.5),
    new THREE.MeshLambertMaterial({ color: 0xdfe3f0 }));
  board.position.set(x + side * 0.3, 3.1, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 20),
    new THREE.MeshLambertMaterial({ color: 0xff5d3b }));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 3.0, 0);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.17, 0.42, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xf2efe4, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  net.position.set(x, 2.78, 0);
  g.add(pole, board, rim, net);
  sc.scene.add(g);
}

function makeBaller(sc, teamHex, name) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: teamHex });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.55, 10),
    new THREE.MeshLambertMaterial({ color: 0x22222e }));
  legs.position.y = 0.28;
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.6, 12), mat);
  torso.position.y = 0.86;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.35;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), mat);
  armL.position.set(0, 0.95, 0.3);
  const armR = armL.clone();
  armR.position.z = -0.3;
  g.add(legs, torso, head, armL, armR);
  const label = makeLabel(name, { size: 20, bg: '#10121fb0' });
  label.position.y = 1.85;
  g.add(label);
  const fire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xff6b35 }));
  fire.rotation.x = Math.PI / 2;
  fire.position.y = 0.06;
  fire.visible = false;
  g.add(fire);
  g.userData = { armL, armR, fire };
  sc.scene.add(g);
  return g;
}

export const tv = {
  start(holder, ctx) {
    const sc = createScene(holder, {
      camPos: [0, 4.4, 11.2], lookAt: [0, 2.1, 0], fov: 42, continuous: true, bg: 0x131628,
    });
    // Court + surroundings.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.2, 5.4),
      [null, null, new THREE.MeshLambertMaterial({ map: courtTex() }), null, null, null]
        .map(m => m || new THREE.MeshLambertMaterial({ color: 0x7a5228 })));
    floor.position.y = -0.1;
    sc.scene.add(floor);
    makeHoop(sc, -1); makeHoop(sc, 1);
    for (let r = 0; r < 3; r++) {
      for (let x = -6.4; x <= 6.4; x += 0.55) {
        const fan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
          new THREE.MeshLambertMaterial({ color: [0x232741, 0x2d3253, 0x3a3160][(Math.abs(x * 10) | 0) % 3] }));
        fan.position.set(x, 1.1 + r * 0.55, -3.4 - r * 0.7);
        sc.scene.add(fan);
      }
    }

    // ---- game state (identical logic to the classic 2D sim) ----
    const players = [];
    for (let i = 0; i < 4; i++) {
      const team = i % 2;
      const seat = ctx.seats[i] && !ctx.seats[i].bot ? i : -1;
      players.push({
        team, seat, cpu: seat < 0,
        name: ctx.seats[i] ? ctx.seats[i].name : 'CPU',
        x: 240 + i * 140, y: FLOOR, vx: 0, vy: 0,
        streak: 0, fire: false, cd: 0, hasBall: false,
        mesh: makeBaller(sc, TEAM_HEX[team], ctx.seats[i] ? ctx.seats[i].name : 'CPU'),
      });
    }
    const keys = {};
    const ball = { x: W / 2, y: 300, vx: 0, vy: 0, holder: null, flight: null, g: 0.32 };
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0xe8722a }));
    sc.scene.add(ballMesh);
    const score = [0, 0];
    let clock = (ctx.options.seconds || 120) * 60;
    let ended = false;

    const hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;gap:18px;'
      + 'font-weight:800;font-size:26px;background:#10121fee;padding:8px 24px;border-radius:14px;';
    const hudMsg = document.createElement('div');
    hudMsg.style.cssText = 'position:absolute;left:50%;top:64px;transform:translateX(-50%);font-weight:800;'
      + 'font-size:24px;color:#ffb52e;text-shadow:0 2px 8px #000;';
    sc.hud.append(hud, hudMsg);
    let msg = { text: 'TIP OFF!', ttl: 90 };
    const say = (text, ttl = 80) => { msg = { text, ttl }; };

    const k = seat => {
      const ws = keys[seat] || {};
      const pd = key => ctx.padDown && ctx.padDown(seat, key);
      return {
        left: ws.left || pd('left'), right: ws.right || pd('right'),
        up: ws.up || pd('up'), a: ws.a || pd('a'), b: ws.b || pd('b'),
      };
    };
    const hoopFor = p => HOOPS[p.team === 0 ? 1 : 0];

    function giveBall(p) {
      ball.holder = p; ball.flight = null;
      for (const q of players) q.hasBall = q === p;
    }
    function looseBall(vx, vy) {
      ball.holder = null; ball.flight = null;
      ball.vx = vx; ball.vy = vy;
      for (const q of players) q.hasBall = false;
    }
    function inbound(team) {
      const p = players.find(q => q.team === team);
      p.x = W / 2 + (team === 0 ? -60 : 60); p.y = FLOOR;
      giveBall(p);
    }
    function shoot(p) {
      const hoop = hoopFor(p);
      const dist = Math.hypot(hoop.x - p.x, hoop.y - p.y);
      const dunk = dist < 95 && p.y < FLOOR - 20;
      const three = Math.abs(hoop.x - p.x) > 300;
      let chance = dunk ? 0.92 : Math.max(0.18, 0.85 - dist / 700);
      if (p.fire) chance += 0.12;
      const make = Math.random() < chance;
      const T = dunk ? 14 : 38;
      const tx = make ? hoop.x : hoop.x + (Math.random() < 0.5 ? -34 : 30);
      const ty = make ? hoop.y : hoop.y - 6;
      ball.holder = null;
      p.hasBall = false;
      ball.x = p.x; ball.y = p.y - 30;
      ball.flight = { t: 0, T, make, team: p.team, three, shooter: p, dunk };
      ball.vx = (tx - ball.x) / T;
      ball.vy = (ty - ball.y - 0.5 * ball.g * T * T) / T;
    }
    function pass(p) {
      const mate = players.find(q => q.team === p.team && q !== p);
      ball.holder = null; p.hasBall = false;
      ball.flight = { pass: mate, t: 0, T: 18 };
      ball.x = p.x; ball.y = p.y - 30;
    }
    function scoreBasket(fl) {
      score[fl.team] += fl.three ? 3 : 2;
      fl.shooter.streak++;
      for (const q of players) if (q.team !== fl.team) { q.streak = 0; q.fire = false; }
      if (fl.shooter.streak >= 3 && !fl.shooter.fire) { fl.shooter.fire = true; say(`${fl.shooter.name} IS ON FIRE! 🔥`, 110); }
      else say(fl.dunk ? `${fl.shooter.name} THROWS IT DOWN! 💥` : fl.three ? `${fl.shooter.name} FROM DOWNTOWN! 🎯` : `${fl.shooter.name} scores!`, 90);
      ctx.sendScore(`${score[0]} — ${score[1]}`);
      inbound(1 - fl.team);
    }
    function cpuThink(p) {
      const hoop = hoopFor(p);
      const kk = {};
      if (p.hasBall) {
        const dist = Math.hypot(hoop.x - p.x, hoop.y - p.y);
        kk[hoop.x > p.x ? 'right' : 'left'] = true;
        if (dist < 130 && p.y === FLOOR && Math.random() < 0.1) kk.up = true;
        if ((dist < 110 && p.y < FLOOR - 10) || (dist < 380 && Math.random() < 0.012)) kk.a = true;
        if (Math.random() < 0.004) kk.b = true;
      } else if (ball.holder && ball.holder.team !== p.team) {
        const t = ball.holder;
        kk[t.x > p.x + 8 ? 'right' : 'left'] = true;
        if (Math.abs(t.x - p.x) < 46 && Math.random() < 0.05) kk.a = true;
      } else if (!ball.holder) {
        kk[ball.x > p.x + 6 ? 'right' : 'left'] = true;
        if (ball.y < p.y - 60 && p.y === FLOOR && Math.random() < 0.08) kk.up = true;
      } else {
        kk[hoop.x - 160 * hoop.dir > p.x ? 'right' : 'left'] = Math.random() < 0.7;
      }
      return kk;
    }

    function step() {
      clock--;
      if (msg.ttl > 0) msg.ttl--;
      for (const p of players) {
        const kk = p.cpu ? cpuThink(p) : k(p.seat);
        const sp = p.hasBall ? 3.6 : 4.1;
        p.vx = kk.left ? -sp : kk.right ? sp : p.vx * 0.7;
        if (kk.up && p.y >= FLOOR) p.vy = -13;
        p.vy += GRAV;
        p.x = Math.max(30, Math.min(W - 30, p.x + p.vx));
        p.y = Math.min(FLOOR, p.y + p.vy);
        if (p.y === FLOOR) p.vy = 0;
        if (p.cd > 0) p.cd--;
        if (kk.a && p.cd === 0) {
          p.cd = 20;
          if (p.hasBall) shoot(p);
          else if (ball.holder && ball.holder.team !== p.team
            && Math.hypot(ball.holder.x - p.x, ball.holder.y - p.y) < 52) {
            if (Math.random() < 0.3) { say(`${p.name} with the steal! 🧤`); looseBall((Math.random() - .5) * 6, -4); }
          }
        }
        if (kk.b && p.hasBall && p.cd === 0) { p.cd = 15; pass(p); }
      }
      if (ball.holder) {
        ball.x = ball.holder.x + 18; ball.y = ball.holder.y - 46;
      } else if (ball.flight?.pass) {
        const fl = ball.flight;
        fl.t++;
        const m = fl.pass;
        ball.x += (m.x - ball.x) / Math.max(1, fl.T - fl.t);
        ball.y += (m.y - 30 - ball.y) / Math.max(1, fl.T - fl.t);
        if (fl.t >= fl.T) giveBall(m);
      } else if (ball.flight) {
        const fl = ball.flight;
        fl.t++;
        ball.vy += ball.g;
        ball.x += ball.vx; ball.y += ball.vy;
        if (fl.t >= fl.T) {
          if (fl.make) scoreBasket(fl);
          else { say('Rims out!'); fl.shooter.streak = 0; looseBall((Math.random() - .5) * 8, -3); }
        }
      } else {
        ball.vy += GRAV;
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.y > FLOOR - 12) { ball.y = FLOOR - 12; ball.vy *= -0.55; ball.vx *= 0.96; }
        if (ball.x < 12 || ball.x > W - 12) { ball.vx *= -0.8; ball.x = Math.max(12, Math.min(W - 12, ball.x)); }
        for (const p of players) {
          if (Math.hypot(p.x - ball.x, p.y - 20 - ball.y) < 42) { giveBall(p); break; }
        }
      }
      if (clock <= 0 && !ended) {
        if (score[0] === score[1]) { clock = 30 * 60; say('OVERTIME! +30 seconds', 140); }
        else {
          ended = true;
          const t = score[0] > score[1] ? 0 : 1;
          const names = players.filter(p => p.team === t).map(p => p.name).join(' & ');
          ctx.end({ title: `${names} win ${Math.max(...score)}–${Math.min(...score)}! 🏀`,
            lines: [`Final: ${score[0]} — ${score[1]}`] });
        }
      }
    }

    function syncMeshes() {
      for (const p of players) {
        p.mesh.position.set(w2x(p.x), w2y(p.y), 0);
        p.mesh.userData.fire.visible = p.fire;
        const reach = p.hasBall || (ball.flight?.shooter === p && ball.flight.t < 10);
        p.mesh.userData.armL.rotation.x = reach ? -2.4 : -0.25;
        p.mesh.userData.armR.rotation.x = reach ? -2.4 : 0.25;
      }
      ballMesh.position.set(w2x(ball.x), w2y(ball.y) + 0.2, 0.05);
      ballMesh.rotation.z -= ball.vx * 0.02;
      hud.innerHTML = `
        <span style="color:${TEAM_CSS[0]}">${score[0]}</span>
        <span style="color:#f2efe4;font-size:20px">${fmtClock(clock)}</span>
        <span style="color:${TEAM_CSS[1]}">${score[1]}</span>`;
      hudMsg.textContent = msg.ttl > 0 ? msg.text : '';
    }
    const fmtClock = c => {
      const s = Math.max(0, Math.ceil(c / 60));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    inbound(Math.random() < 0.5 ? 0 : 1);
    sc.onTick(() => { if (!ended) { step(); syncMeshes(); } });

    return {
      input(seat, d) { (keys[seat] ||= {})[d.k] = d.v; },
      stop() { ended = true; sc.dispose(); },
      rehome: h2 => sc.rehome(h2),
    };
  },
};
