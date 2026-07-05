// Combat Legends — 1v1 arcade fighter. Simulation runs on the TV; phones are
// gamepads. Best of 3 rounds, 60 seconds each.
export const player = {
  pad: {
    dpad: ['left', 'right', 'up'],
    buttons: [['p', '👊', 'marquee'], ['k', '🦵', 'cards'], ['s', '⚡', 'arcade'], ['b', '🛡️', 'board']],
  },
};

const W = 960, H = 540, FLOOR = 440, GRAV = 0.8;
const ATTACKS = {
  p: { range: 74, dmg: 6, startup: 6, active: 5, recover: 10, label: 'punch' },
  k: { range: 100, dmg: 11, startup: 13, active: 6, recover: 20, label: 'kick' },
};
const COLORS = [['#ffb52e', '#c47f0e'], ['#b78bff', '#7a51c2']];

export const tv = {
  start(holder, ctx) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.className = 'arcade';
    canvas.style.cssText = 'max-width:100%;max-height:100%;';
    holder.innerHTML = '';
    holder.appendChild(canvas);
    const g = canvas.getContext('2d');

    const names = [
      ctx.seats[0] ? ctx.seats[0].name : 'Vector',
      ctx.seats[1] ? ctx.seats[1].name : 'Vector',
    ];
    const isCpu = [!ctx.seats[0] || ctx.seats[0].bot, !ctx.seats[1] || ctx.seats[1].bot];
    const keys = [{}, {}];
    const wins = [0, 0];
    let round = 1, roundClock = 0, phase = 'intro', phaseTtl = 120;
    let projectiles = [];
    let raf = null, ended = false;
    let f = [];

    function resetRound() {
      f = [0, 1].map(i => ({
        i, x: i === 0 ? 300 : 660, y: FLOOR, vx: 0, vy: 0,
        hp: 100, face: i === 0 ? 1 : -1,
        state: 'idle', t: 0, atk: null, cool: 0, special: 0, stun: 0,
      }));
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
      const kk = isCpu[me.i] ? cpuKeys(me, foe) : keys[me.i];
      me.face = foe.x > me.x ? 1 : -1;
      if (me.cool > 0) me.cool--;
      if (me.special > 0) me.special--;
      if (me.stun > 0) { me.stun--; me.x += me.vx; me.vx *= 0.85; }
      else {
        if (me.state === 'hit') me.state = 'idle';
        if (me.state === 'attack') {
          me.t++;
          const a = ATTACKS[me.atk];
          if (me.t === a.startup + 1) { // active frame: check hit
            const reach = me.x + me.face * a.range;
            if (Math.abs(foe.x - reach) < 55 || (Math.abs(foe.x - me.x) < a.range && Math.abs(foe.y - me.y) < 60)) {
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
              projectiles.push({ x: me.x + me.face * 40, y: me.y - 62, vx: me.face * 9, owner: me.i, ttl: 130 });
            }
          }
        }
      }
      me.vy += GRAV;
      me.y = Math.min(FLOOR, me.y + me.vy);
      if (me.y === FLOOR) me.vy = 0;
      me.x = Math.max(50, Math.min(W - 50, me.x));
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

    let koText = '', koWinner = -1;
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

    function drawFighter(me) {
      const [c1, c2] = COLORS[me.i];
      const x = me.x, y = me.y;
      g.save();
      if (me.state === 'hit') g.translate((Math.random() - .5) * 5, 0);
      // legs
      g.strokeStyle = c2; g.lineWidth = 10; g.lineCap = 'round';
      const kick = me.state === 'attack' && me.atk === 'k' && me.t > ATTACKS.k.startup - 4;
      g.beginPath(); g.moveTo(x, y - 52);
      g.lineTo(x - 14, y); g.moveTo(x, y - 52);
      if (kick) g.lineTo(x + me.face * 52, y - 60);
      else g.lineTo(x + 14, y);
      g.stroke();
      // torso
      g.fillStyle = c1;
      g.fillRect(x - 17, y - 106, 34, 58);
      // arms
      g.strokeStyle = c1; g.lineWidth = 9;
      const punch = me.state === 'attack' && me.atk === 'p' && me.t > ATTACKS.p.startup - 3;
      g.beginPath();
      g.moveTo(x, y - 95);
      if (me.state === 'block') { g.lineTo(x + me.face * 22, y - 78); g.lineTo(x + me.face * 20, y - 104); }
      else if (punch) g.lineTo(x + me.face * 62, y - 92);
      else g.lineTo(x + me.face * 24, y - 70);
      g.stroke();
      // head
      g.fillStyle = c2;
      g.beginPath(); g.arc(x, y - 122, 15, 0, 7); g.fill();
      g.fillStyle = '#10121f';
      g.beginPath(); g.arc(x + me.face * 6, y - 124, 2.5, 0, 7); g.fill();
      if (me.state === 'block') {
        g.fillStyle = '#3ecf8e55';
        g.beginPath(); g.arc(x + me.face * 26, y - 90, 26, 0, 7); g.fill();
      }
      g.restore();
    }

    function draw() {
      // dojo backdrop
      g.fillStyle = '#151726'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1d2138';
      g.fillRect(0, 90, W, 30); g.fillRect(0, 160, W, 14);
      for (let x = 60; x < W; x += 180) { g.fillStyle = '#232741'; g.fillRect(x, 120, 26, 320); }
      g.fillStyle = '#2b2136'; g.fillRect(0, FLOOR + 4, W, H - FLOOR);
      g.fillStyle = '#3a2c49'; g.fillRect(0, FLOOR + 4, W, 8);

      for (const pr of projectiles) {
        g.fillStyle = '#7de3ff';
        g.beginPath(); g.arc(pr.x, pr.y, 13 + Math.sin(Date.now() / 50) * 3, 0, 7); g.fill();
        g.fillStyle = '#e0f8ff';
        g.beginPath(); g.arc(pr.x, pr.y, 6, 0, 7); g.fill();
      }
      drawFighter(f[0]);
      drawFighter(f[1]);

      // HUD: health bars
      for (const i of [0, 1]) {
        const x = i === 0 ? 40 : W - 40 - 360;
        g.fillStyle = '#10121f'; g.fillRect(x, 28, 360, 26);
        g.fillStyle = f[i].hp > 30 ? COLORS[i][0] : '#ff5d73';
        const w2 = 356 * f[i].hp / 100;
        g.fillRect(i === 0 ? x + 2 + (356 - w2) : x + 2, 30, w2, 22);
        g.font = '800 15px system-ui';
        g.textAlign = i === 0 ? 'left' : 'right';
        g.fillStyle = '#f2efe4';
        g.fillText(`${names[i]}  ${'●'.repeat(wins[i])}`, i === 0 ? x : x + 360, 74);
      }
      g.font = '800 30px system-ui'; g.textAlign = 'center';
      g.fillStyle = '#f2efe4';
      g.fillText(Math.max(0, Math.ceil(roundClock / 60)), W / 2, 50);

      if (phase === 'intro') {
        g.font = '800 58px system-ui';
        g.fillStyle = '#ffb52e';
        g.fillText(phaseTtl > 50 ? `ROUND ${round}` : 'FIGHT!', W / 2, 260);
      }
      if (phase === 'ko') {
        g.font = '800 72px system-ui';
        g.fillStyle = '#ff5d73';
        g.fillText(koText, W / 2, 250);
        if (koWinner >= 0) {
          g.font = '800 30px system-ui';
          g.fillStyle = '#f2efe4';
          g.fillText(`${names[koWinner]} takes round ${round}`, W / 2, 300);
        }
      }
    }

    resetRound();
    function loop() {
      if (ended) return;
      step(); draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return {
      input(seat, d) { if (keys[seat]) keys[seat][d.k] = d.v; },
      stop() { ended = true; cancelAnimationFrame(raf); },
      rehome(newHolder) { newHolder.innerHTML = ''; newHolder.appendChild(canvas); },
    };
  },
};
