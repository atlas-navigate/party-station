// Slam City — 2v2 arcade hoops. Simulation runs on the TV; phones are gamepads.
export const player = {
  pad: { dpad: ['left', 'right', 'up'], buttons: [['a', '🏀', 'marquee'], ['b', '🤝', 'board']] },
};

const W = 960, H = 540, FLOOR = 470, GRAV = 0.65;
const HOOPS = [{ x: 78, y: 235, dir: 1 }, { x: 882, y: 235, dir: -1 }]; // team 0 shoots at [1]
const TEAM_COLORS = [['#ffb52e', '#ffd47e'], ['#b78bff', '#d3bcff']];

export const tv = {
  start(holder, ctx) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.className = 'arcade';
    canvas.style.cssText = 'max-width:100%;max-height:100%;';
    holder.innerHTML = '';
    holder.appendChild(canvas);
    const g = canvas.getContext('2d');

    // Build 4 players: seats alternate teams; CPUs fill the rest.
    const players = [];
    for (let i = 0; i < 4; i++) {
      const team = i % 2;
      const seat = ctx.seats[i] && !ctx.seats[i].bot ? i : -1;
      players.push({
        team, seat,
        name: ctx.seats[i] ? ctx.seats[i].name : 'CPU',
        cpu: seat < 0,
        x: 240 + i * 140, y: FLOOR, vx: 0, vy: 0,
        r: 26, streak: 0, fire: false, cd: 0,
      });
    }
    const keys = {};
    const ball = { x: W / 2, y: 300, vx: 0, vy: 0, holder: null, flight: null };
    const score = [0, 0];
    let clock = (ctx.options.seconds || 120) * 60;
    let msg = { text: 'TIP OFF!', ttl: 90 };
    let raf = null, ended = false;

    const k = seat => keys[seat] || {};
    const hoopFor = p => HOOPS[p.team === 0 ? 1 : 0];
    const say = (text, ttl = 80) => { msg = { text, ttl }; };

    function giveBall(p) {
      ball.holder = p; ball.flight = null;
      for (const q of players) q.hasBall = q === p;
    }
    function looseBall(vx, vy) {
      ball.holder = null; ball.flight = null;
      ball.vx = vx; ball.vy = vy;
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
      ball.vy = (ty - ball.y - 0.5 * 0.32 * T * T) / T; // arcs via its own gravity
      ball.g = 0.32;
    }

    function pass(p) {
      const mate = players.find(q => q.team === p.team && q !== p);
      ball.holder = null; p.hasBall = false;
      ball.flight = { pass: mate, t: 0, T: 18 };
      ball.x = p.x; ball.y = p.y - 30;
    }

    function scoreBasket(fl) {
      const pts = fl.three ? 3 : 2;
      score[fl.team] += pts;
      fl.shooter.streak++;
      for (const q of players) if (q.team !== fl.team) q.streak = 0;
      if (fl.shooter.streak >= 3 && !fl.shooter.fire) { fl.shooter.fire = true; say(`${fl.shooter.name} IS HEATING UP! 🔥`, 110); }
      else say(fl.dunk ? `${fl.shooter.name} THROWS IT DOWN! 💥` : fl.three ? `${fl.shooter.name} FROM DOWNTOWN! 🎯` : `${fl.shooter.name} scores!`, 90);
      for (const q of players) if (q.team !== fl.team) q.fire = false;
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
        if (Math.abs(t.x - p.x) < 46 && Math.random() < 0.05) kk.a = true; // steal attempt
      } else if (!ball.holder) {
        kk[ball.x > p.x + 6 ? 'right' : ball.x < p.x - 6 ? 'left' : 'right'] = true;
        if (ball.y < p.y - 60 && p.y === FLOOR && Math.random() < 0.08) kk.up = true;
      } else {
        // teammate has it: drift toward the hoop for the pass
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
      // ball
      if (ball.holder) {
        ball.x = ball.holder.x + 18; ball.y = ball.holder.y - 30;
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
        if (ball.x < 12 || ball.x > W - 12) ball.vx *= -0.8, ball.x = Math.max(12, Math.min(W - 12, ball.x));
        for (const p of players) {
          if (Math.hypot(p.x - ball.x, p.y - 20 - ball.y) < 42) { giveBall(p); break; }
        }
      }
      if (clock <= 0 && !ended) {
        if (score[0] === score[1]) { clock = 30 * 60; say('OVERTIME! +30s', 140); }
        else {
          ended = true;
          const t = score[0] > score[1] ? 0 : 1;
          const names = players.filter(p => p.team === t).map(p => p.name).join(' & ');
          ctx.end({
            title: `${names} win ${Math.max(...score)}–${Math.min(...score)}! 🏀`,
            lines: [`Final: ${score[0]} — ${score[1]}`],
          });
        }
      }
    }

    function draw() {
      g.fillStyle = '#10121f'; g.fillRect(0, 0, W, H);
      // crowd
      for (let r = 0; r < 5; r++) {
        for (let x = 12; x < W; x += 24) {
          g.fillStyle = ['#232741', '#2d3253', '#1d2138'][(x / 24 + r) % 3 | 0];
          g.beginPath(); g.arc(x, 60 + r * 26, 8, 0, 7); g.fill();
        }
      }
      // floor
      g.fillStyle = '#8a5a33'; g.fillRect(0, FLOOR + 8, W, H - FLOOR);
      g.fillStyle = '#a06c3f'; g.fillRect(0, FLOOR + 8, W, 10);
      g.strokeStyle = '#ffffff33'; g.lineWidth = 3;
      g.beginPath(); g.arc(W / 2, FLOOR + 8, 70, Math.PI, 0); g.stroke();
      // hoops
      for (const hp of HOOPS) {
        g.fillStyle = '#dfe3f0';
        g.fillRect(hp.x - hp.dir * 8 - (hp.dir > 0 ? 6 : 0), hp.y - 62, 6, 88);
        g.strokeStyle = '#ff5d3b'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(hp.x - 24, hp.y); g.lineTo(hp.x + 24, hp.y); g.stroke();
        g.strokeStyle = '#ffffff88'; g.lineWidth = 2;
        for (let i = -18; i <= 18; i += 9) {
          g.beginPath(); g.moveTo(hp.x + i, hp.y); g.lineTo(hp.x + i * 0.5, hp.y + 26); g.stroke();
        }
      }
      // players
      for (const p of players) {
        const [c1, c2] = TEAM_COLORS[p.team];
        if (p.fire) {
          g.fillStyle = '#ff6b3577';
          g.beginPath(); g.arc(p.x, p.y - 26, 38 + Math.sin(Date.now() / 80) * 5, 0, 7); g.fill();
        }
        g.fillStyle = c1;
        g.beginPath(); g.arc(p.x, p.y - 26, p.r, 0, 7); g.fill();
        g.fillStyle = c2;
        g.beginPath(); g.arc(p.x, p.y - 44, 13, 0, 7); g.fill();
        g.fillStyle = '#10121f';
        g.beginPath(); g.arc(p.x + 4, p.y - 46, 2.5, 0, 7); g.fill();
        g.font = '800 13px system-ui'; g.textAlign = 'center';
        g.fillStyle = '#f2efe4';
        g.fillText(`${p.name}${p.fire ? ' 🔥' : ''}`, p.x, p.y + 22);
      }
      // ball
      g.fillStyle = '#e8722a';
      g.beginPath(); g.arc(ball.x, ball.y, 12, 0, 7); g.fill();
      g.strokeStyle = '#7a3413'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ball.x, ball.y, 12, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(ball.x - 12, ball.y); g.lineTo(ball.x + 12, ball.y); g.stroke();
      // HUD
      g.font = '800 34px system-ui'; g.textAlign = 'center';
      g.fillStyle = TEAM_COLORS[0][0]; g.fillText(score[0], W / 2 - 70, 44);
      g.fillStyle = TEAM_COLORS[1][0]; g.fillText(score[1], W / 2 + 70, 44);
      g.fillStyle = '#f2efe4';
      const s = Math.max(0, Math.ceil(clock / 60));
      g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, W / 2, 44);
      if (msg.ttl > 0) {
        g.font = '800 30px system-ui';
        g.fillStyle = '#ffb52e';
        g.fillText(msg.text, W / 2, 110);
      }
    }

    inbound(Math.random() < 0.5 ? 0 : 1);
    function loop() {
      if (ended) return;
      step(); draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      input(seat, d) { (keys[seat] ||= {})[d.k] = d.v; },
      stop() { ended = true; cancelAnimationFrame(raf); },
      rehome(newHolder) { newHolder.innerHTML = ''; newHolder.appendChild(canvas); },
    };
  },
};
