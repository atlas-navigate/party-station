import { h, mount } from '../ui.js';
import { createScene, THREE } from '../three-app/scene.js';
import { canvasTex, makeLabel } from '../three-app/assets.js';

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTeam = priv.team;
    const onOffense = pub.offense === myTeam;

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:10px' },
      h('span', { class: 'numpill', style: 'font-size:17px' }, `Q${pub.quarter} · ${pub.playsLeft} plays left`),
      h('span', { class: 'numpill', style: 'font-size:17px' }, `${pub.score[0]} — ${pub.score[1]}`)));

    kids.push(h('div', { class: 'banner center', style: 'margin-bottom:10px;font-size:14px' },
      onOffense ? `🏈 Your team has the ball — ${down(pub)}` : `🛡️ Defense — stop them! ${down(pub)}`));

    if (priv.callingOffense) {
      kids.push(h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Call the play'));
      kids.push(h('div', { class: 'game-grid' },
        pub.offPlays.map(p =>
          h('button', { class: 'game-tile cat-arcade', style: 'min-height:84px', onclick: () => send({ t: 'call', play: p.id }) },
            h('span', { class: 'g-icon', style: 'font-size:26px' }, p.icon),
            h('span', { class: 'g-name', style: 'font-size:14px' }, p.name)))));
      if (priv.canPunt || priv.canFG) {
        kids.push(h('div', { class: 'row', style: 'margin-top:10px' },
          priv.canPunt && h('button', { class: 'tok grow', onclick: () => send({ t: 'call', play: 'punt' }) }, '🦵 Punt'),
          priv.canFG && h('button', { class: 'tok primary grow', onclick: () => send({ t: 'call', play: 'fg' }) }, '🥅 Field goal')));
      }
    } else if (priv.callingDefense) {
      kids.push(h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Call the defense'));
      kids.push(h('div', { class: 'game-grid' },
        pub.defPlays.map(p =>
          h('button', { class: 'game-tile cat-board', style: 'min-height:84px', onclick: () => send({ t: 'call', play: p.id }) },
            h('span', { class: 'g-icon', style: 'font-size:26px' }, p.icon),
            h('span', { class: 'g-name', style: 'font-size:14px' }, p.name)))));
    } else {
      const caller = pub.step === 'offense' ? pub.offCaller : pub.defCaller;
      kids.push(h('div', { class: 'banner center' },
        pub.step === 'offense' && pub.offPicked === false
          ? `${seats[caller]?.name} is calling the play…`
          : `${seats[caller]?.name} is picking…`));
      if (pub.lastPlay) kids.push(lastPlayBanner(pub));
    }
    mount(el, ...kids);
  },
};

function down(pub) {
  const names = ['1st', '2nd', '3rd', '4th'];
  return `${names[pub.down - 1]} & ${pub.toGo}`;
}

function lastPlayBanner(pub) {
  const lp = pub.lastPlay;
  const text = lp.special
    ? `${lp.special}${lp.yards ? ` (${lp.yards} yds)` : ''}`
    : `${lp.offName} vs ${lp.defName}: ${lp.yards >= 0 ? '+' : ''}${lp.yards} yds${lp.event ? ' — ' + lp.event : ''}`;
  return h('div', { class: 'banner' + (lp.event ? ' hot' : ''), style: 'margin-top:10px;text-align:center;font-size:14px' }, text);
}

// 3D stadium: a full field with painted yard lines, end zones, goal posts,
// and a football that charges down the field after every play call.
function fieldTex() {
  return canvasTex('gr:field', 1024, 512, g => {
    g.fillStyle = '#2b8c4b'; g.fillRect(0, 0, 1024, 512);
    for (let k = 0; k < 10; k++) { // mowing stripes
      g.fillStyle = k % 2 ? '#2b8c4b' : '#278245';
      g.fillRect(102.4 * k, 0, 102.4, 512);
    }
    g.fillStyle = '#c8a03288'; g.fillRect(0, 0, 51, 512);
    g.fillStyle = '#8d6bc888'; g.fillRect(973, 0, 51, 512);
    g.strokeStyle = '#ffffffcc'; g.lineWidth = 4;
    for (let y = 10; y <= 90; y += 10) {
      const x = 51 + (y / 100) * 922;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
      g.fillStyle = '#ffffffbb';
      g.font = '800 34px system-ui'; g.textAlign = 'center';
      const n = y <= 50 ? y : 100 - y;
      g.save(); g.translate(x, 470); g.rotate(Math.PI); g.fillText(n, 0, 0); g.restore();
      g.fillText(n, x, 60);
    }
  });
}

function makeGoalPost(x) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xf2d24b });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), mat);
  pole.position.set(x, 0.55, 0);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), mat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x, 1.1, 0);
  g.add(pole, bar);
  for (const dz of [-0.8, 0.8]) {
    const up = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), mat);
    up.position.set(x, 1.6, dz);
    g.add(up);
  }
  return g;
}

export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 8.4, 8.8], lookAt: [0, 0, -0.6], fov: 46, bg: 0x141d2e });
    const field = new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 6.6),
      [new THREE.MeshLambertMaterial({ color: 0x1e6b38 }), new THREE.MeshLambertMaterial({ color: 0x1e6b38 }),
        new THREE.MeshLambertMaterial({ map: fieldTex() }), new THREE.MeshLambertMaterial({ color: 0x1e6b38 }),
        new THREE.MeshLambertMaterial({ color: 0x1e6b38 }), new THREE.MeshLambertMaterial({ color: 0x1e6b38 })]);
    field.position.y = -0.1;
    sc.scene.add(field);
    sc.scene.add(makeGoalPost(-6.35), makeGoalPost(6.35));

    // Crowd bleachers.
    for (const dz of [-4.4, 4.4]) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(13.6, 1.1, 1.5),
        new THREE.MeshLambertMaterial({ color: 0x232741 }));
      stand.position.set(0, 0.55, dz);
      stand.rotation.x = dz > 0 ? -0.35 : 0.35;
      sc.scene.add(stand);
    }

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 9),
      new THREE.MeshLambertMaterial({ color: 0x8a4a1f }));
    ball.scale.x = 1.55;
    ball.position.y = 0.28;
    sc.scene.add(ball);
    const firstDown = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 6.6),
      new THREE.MeshBasicMaterial({ color: 0xf7d34c }));
    firstDown.position.y = 0.02;
    sc.scene.add(firstDown);

    const ballX = pub2 => {
      const pct = pub2.offense === 0 ? pub2.ball : 100 - pub2.ball;
      return -5.75 + (pct / 100) * 11.5;
    };
    let lastBallKey = '';

    const hudScore = document.createElement('div');
    hudScore.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;gap:14px;'
      + 'align-items:center;font-weight:800;font-size:19px;background:#10121fee;padding:8px 20px;border-radius:14px;';
    const hudPlay = document.createElement('div');
    hudPlay.style.cssText = 'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font-weight:800;'
      + 'font-size:24px;padding:10px 26px;border-radius:14px;display:none;';
    const hudStatus = document.createElement('div');
    hudStatus.style.cssText = 'position:absolute;left:14px;bottom:12px;font-size:15px;color:#9aa0b8;';
    sc.hud.append(hudScore, hudPlay, hudStatus);

    function update(c) {
      const pub = c.pub;
      const t1 = pub.teams.filter(t => t.team === 0).map(t => t.name).join(' & ');
      const t2 = pub.teams.filter(t => t.team === 1).map(t => t.name).join(' & ');
      const bx = ballX(pub);
      const key = bx.toFixed(2) + ':' + pub.down;
      if (key !== lastBallKey) {
        lastBallKey = key;
        sc.hop(ball, ball.position.clone(), new THREE.Vector3(bx, 0.28, 0), 1.4, 700);
      }
      const fdPct = pub.offense === 0 ? pub.ball + pub.toGo : 100 - pub.ball - pub.toGo;
      firstDown.position.x = -5.75 + (Math.max(0, Math.min(100, fdPct)) / 100) * 11.5;

      hudScore.innerHTML = `
        <span style="color:#ffb52e">🟨 ${t1} <b style="font-size:26px">${pub.score[0]}</b></span>
        <span style="color:#9aa0b8;font-size:14px">Q${pub.quarter} · ${pub.playsLeft} plays · ${down(pub)}</span>
        <span style="color:#b78bff"><b style="font-size:26px">${pub.score[1]}</b> ${t2} 🟪</span>`;
      const lp = pub.lastPlay;
      if (lp) {
        hudPlay.style.display = 'block';
        const hot = lp.event || lp.special;
        hudPlay.style.background = hot ? '#ffb52e' : '#10121fee';
        hudPlay.style.color = hot ? '#241a02' : '#f2efe4';
        hudPlay.textContent = lp.special || `${lp.offName}: ${lp.yards >= 0 ? '+' : ''}${lp.yards}${lp.event ? ' — ' + lp.event : ''}`;
      } else hudPlay.style.display = 'none';
      hudStatus.textContent = pub.step === 'offense'
        ? `${c.seats[pub.offCaller]?.name} is calling the play… 🤔`
        : `${c.seats[pub.defCaller]?.name} is setting the defense… 🛡️`;
      sc.invalidate();
    }

    return { update, rehome: h2 => sc.rehome(h2), dispose: () => sc.dispose() };
  },
};

export function padChoices({ pub, priv, seat }) {
  if (pub.phase !== 'play') return null;
  if (pub.step === 'offense' && pub.offCaller === seat) {
    return {
      title: `Offense — ${down(pub)}`, items: [
        ...pub.offPlays.map(p => ({ label: `${p.icon} ${p.name}`, action: { t: 'call', play: p.id } })),
        priv.canPunt && { label: '🦵 Punt', action: { t: 'call', play: 'punt' } },
        priv.canFG && { label: '🥅 Field goal', action: { t: 'call', play: 'fg' } },
      ].filter(Boolean),
    };
  }
  if (pub.step === 'defense' && pub.defCaller === seat) {
    return {
      title: 'Defense — stop them!',
      items: pub.defPlays.map(p => ({ label: `${p.icon} ${p.name}`, action: { t: 'call', play: p.id } })),
    };
  }
  return null;
}
