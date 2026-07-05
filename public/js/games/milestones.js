import { h, mount } from '../ui.js';
import { createScene, THREE, EASE } from '../three-app/scene.js';
import { canvasTex, makeLabel, SEAT_COLORS as SEAT_HEX, SEAT_CSS } from '../three-app/assets.js';

const TOKENS = ['🚗', '🚙', '🚕', '🛻', '🚐', '🏎️'];
const TILE_BG = {
  start: '#3ecf8e', payday: '#ffb52e', life: '#b78bff', event: '#2d3253',
  marriage: '#ff5d73', kids: '#7fc8f8', house: '#f472b6', retire: '#ffb52e',
};
const TILE_ICON = {
  start: '🏁', payday: '💰', life: '💜', event: '❗', marriage: '💒',
  kids: '👶', house: '🏠', retire: '🌅',
};

export const player = {
  render(el, ctx) {
    const { pub, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTurn = pub.turn === you && pub.phase === 'play';

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill', style: 'font-size:18px' }, `${TOKENS[you % 6]} 💵 ${pub.cash[you]}k`),
      h('span', { class: 'dim', style: 'font-size:13px' },
        `💜×${pub.tokens[you]} · 👶×${pub.kids[you]}${pub.career[you] ? ' · ' + pub.career[you].name : ''}`)));

    if (pub.retired[you]) {
      kids.push(h('div', { class: 'banner center' }, `🌅 Retired with ${pub.final[you]}k! Watch the others finish.`));
    } else if (!myTurn) {
      kids.push(h('div', { class: 'banner center' }, `${seats[pub.turn]?.name}’s turn…`));
    } else if (pub.step === 'path') {
      kids.push(h('div', { class: 'banner hot center' }, 'Big decision: how does your story start?'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        h('button', { class: 'tok big', onclick: () => send({ t: 'path', college: true }) },
          '🎓 College — better careers, 50k loan'),
        h('button', { class: 'tok big', onclick: () => send({ t: 'path', college: false }) },
          '💼 Straight to work — debt-free')));
    } else if (pub.step === 'career' && pub.pendingCareers) {
      kids.push(h('div', { class: 'banner hot center' }, 'Pick your career'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        pub.pendingCareers.map((c, i) =>
          h('button', { class: 'tok big', onclick: () => send({ t: 'career', i }) },
            `${c.name} — ${c.salary}k salary`))));
    } else if (pub.step === 'house' && pub.pendingHouses) {
      kids.push(h('div', { class: 'banner hot center' }, '🏠 House hunting!'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        pub.pendingHouses.map((hs, i) =>
          h('button', { class: 'tok big', disabled: hs.cost > pub.cash[you], onclick: () => send({ t: 'house', i }) },
            `${hs.name} — ${hs.cost}k (sells ${hs.sale}k)`)),
        h('button', { class: 'tok ghost', onclick: () => send({ t: 'house', i: -1 }) }, 'Keep renting')));
    } else if (pub.step === 'spin') {
      kids.push(h('div', { class: 'banner hot center' }, 'Your turn!'));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'spin' }) }, '🛞 Spin')));
    }
    mount(el, ...kids);
  },
};

// 3D life road: a winding highway of tiles across rolling green, peg-people
// cars, and a big spinning wheel that lands on your number.
const PER_ROW = 10;
const TILE_HEX = {
  start: 0x3ecf8e, payday: 0xffb52e, life: 0xb78bff, event: 0x2d3253,
  marriage: 0xff5d73, kids: 0x7fc8f8, house: 0xf472b6, retire: 0xff9445,
};

function tileXZ(i) {
  const row = Math.floor(i / PER_ROW);
  const col = row % 2 === 0 ? i % PER_ROW : PER_ROW - 1 - (i % PER_ROW);
  return [(col - (PER_ROW - 1) / 2) * 1.22, 3.3 - row * 1.95];
}

function makeCar(colorHex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.26),
    new THREE.MeshLambertMaterial({ color: colorHex }));
  body.position.y = 0.14;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.22),
    new THREE.MeshLambertMaterial({ color: colorHex }));
  top.position.set(-0.02, 0.27, 0);
  g.add(body, top);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x22222c });
  for (const [dx, dz] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.14], [0.14, -0.14]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(dx, 0.07, dz);
    g.add(w);
  }
  return g;
}

function wheelTex() {
  return canvasTex('ms:wheel', 256, 256, g => {
    for (let k = 0; k < 10; k++) {
      g.fillStyle = ['#ff5d73', '#ffb52e', '#3ecf8e', '#7fc8f8', '#b78bff'][k % 5];
      g.beginPath(); g.moveTo(128, 128);
      g.arc(128, 128, 126, (k / 10) * Math.PI * 2, ((k + 1) / 10) * Math.PI * 2);
      g.fill();
      const a = ((k + 0.5) / 10) * Math.PI * 2;
      g.fillStyle = '#14100a';
      g.font = '800 30px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k + 1, 128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
    }
    g.fillStyle = '#f2efe4';
    g.beginPath(); g.arc(128, 128, 22, 0, 7); g.fill();
  });
}

export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 10.2, 10.8], lookAt: [0, 0, -0.8], fov: 46, bg: 0x1c2438 });
    const ground = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 12.5),
      new THREE.MeshLambertMaterial({ color: 0x3f7a4c }));
    ground.position.y = -0.1;
    sc.scene.add(ground);

    ctx.pub.track.forEach((t, i) => {
      const [x, z] = tileXZ(i);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.12, 0.9),
        new THREE.MeshLambertMaterial({ color: TILE_HEX[t.type] || 0x2d3253 }));
      tile.position.set(x, 0.06, z);
      sc.scene.add(tile);
      if (t.type !== 'event') {
        const lbl = makeLabel(TILE_ICON[t.type] || '', { size: 30, bg: null });
        lbl.position.set(x, 0.55, z);
        sc.scene.add(lbl);
      }
    });

    // The spinner.
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 30),
      [new THREE.MeshLambertMaterial({ color: 0x3a3145 }),
        new THREE.MeshLambertMaterial({ map: wheelTex() }),
        new THREE.MeshLambertMaterial({ color: 0x3a3145 })]);
    wheel.position.set(6.4, 1.9, 1.6);
    wheel.rotation.x = Math.PI / 2; // stand it upright, face the camera
    sc.scene.add(wheel);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4),
      new THREE.MeshLambertMaterial({ color: 0xf2efe4 }));
    pointer.position.set(6.4, 3.6, 1.6);
    pointer.rotation.x = Math.PI; // point down at the rim
    sc.scene.add(pointer);

    const cars = ctx.seats.map((_, i) => {
      const car = makeCar(SEAT_HEX[i % 6]);
      sc.scene.add(car);
      return car;
    });
    const spot = (i, pos) => {
      const [x, z] = tileXZ(Math.max(0, Math.min(pos, ctx.pub.track.length - 1)));
      return new THREE.Vector3(x - 0.2 + (i % 3) * 0.22, 0.12, z - 0.16 + Math.floor(i / 3) * 0.3);
    };
    const lastPos = ctx.pub.pos.slice();
    cars.forEach((c2, i) => c2.position.copy(spot(i, lastPos[i])));
    let lastSpinKey = '';

    const hudPanel = document.createElement('div');
    hudPanel.style.cssText = 'position:absolute;right:14px;top:10px;display:flex;flex-direction:column;gap:8px;font-size:15px;min-width:235px;';
    const hudLog = document.createElement('div');
    hudLog.style.cssText = 'position:absolute;left:14px;bottom:10px;font-size:14px;color:#9aa0b8;line-height:1.6;max-width:32%;';
    const hudTop = document.createElement('div');
    hudTop.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);font-weight:800;font-size:18px;'
      + 'background:#10121fcc;padding:8px 18px;border-radius:12px;';
    sc.hud.append(hudPanel, hudLog, hudTop);

    function update(c) {
      const pub = c.pub;
      pub.pos.forEach((p, i) => {
        cars[i].visible = true;
        if (p !== lastPos[i]) {
          sc.hop(cars[i], cars[i].position.clone(), spot(i, p), 0.7, 500);
          lastPos[i] = p;
        }
      });
      if (pub.lastSpin) {
        const key = pub.lastSpin.seat + ':' + pub.lastSpin.value + ':' + pub.pos.join(',');
        if (key !== lastSpinKey) {
          lastSpinKey = key;
          const target = wheel.rotation.y + Math.PI * 6 + (pub.lastSpin.value / 10) * Math.PI * 2;
          sc.tween(v => { wheel.rotation.y = v; }, wheel.rotation.y, target, 1200, EASE.outCubic);
        }
      }
      hudTop.textContent = pub.step === 'path' ? `${c.seats[pub.turn].name}: college or career?`
        : pub.step === 'career' ? `${c.seats[pub.turn].name} is picking a career…`
          : pub.step === 'house' ? `${c.seats[pub.turn].name} is house hunting 🏠`
            : pub.lastSpin ? `🛞 ${c.seats[pub.lastSpin.seat].name} spun ${pub.lastSpin.value}`
              : `${c.seats[pub.turn].name}'s turn`;
      hudPanel.innerHTML = c.seats.map((s, i) => `
        <div style="background:${pub.turn === i && !pub.retired[i] ? '#3a3145' : '#10121fcc'};border-radius:10px;
          padding:8px 12px;border-left:5px solid ${SEAT_CSS[i % 6]};${pub.retired[i] ? 'opacity:.65' : ''}">
          ${TOKENS[i % 6]} <b>${s.bot ? '🤖 ' : ''}${s.name}</b>
          <span style="float:right;font-weight:800">${pub.retired[i] ? '🌅 ' + pub.final[i] + 'k' : '💵' + pub.cash[i] + 'k'}</span>
          <div style="color:#9aa0b8;font-size:12px">${pub.career[i] ? pub.career[i].name + ' · ' : ''}💜${pub.tokens[i]} 👶${pub.kids[i]}${pub.married[i] ? ' 💍' : ''}${pub.house[i] ? ' 🏠' : ''}</div>
        </div>`).join('');
      hudLog.innerHTML = pub.log.slice(-4).map(l => `<div>${l}</div>`).join('');
      sc.invalidate();
    }

    return { update, rehome: h2 => sc.rehome(h2), dispose: () => sc.dispose() };
  },
};

export function padChoices({ pub, seat }) {
  if (pub.phase !== 'play' || pub.turn !== seat) return null;
  if (pub.step === 'path') {
    return {
      title: 'How does your story start?', items: [
        { label: '🎓 College (better pay, 50k loan)', action: { t: 'path', college: true } },
        { label: '💼 Straight to work', action: { t: 'path', college: false } },
      ],
    };
  }
  if (pub.step === 'career' && pub.pendingCareers) {
    return {
      title: 'Pick your career',
      items: pub.pendingCareers.map((c, i) => ({ label: `${c.name} — ${c.salary}k`, action: { t: 'career', i } })),
    };
  }
  if (pub.step === 'house' && pub.pendingHouses) {
    return {
      title: '🏠 House hunting', items: [
        ...pub.pendingHouses.map((hs, i) => ({
          label: `${hs.name} — ${hs.cost}k (sells ${hs.sale}k)`,
          action: { t: 'house', i }, disabled: hs.cost > pub.cash[seat],
        })),
        { label: 'Keep renting', action: { t: 'house', i: -1 } },
      ],
    };
  }
  if (pub.step === 'spin') {
    return { title: 'Your turn', items: [{ label: '🛞 Spin', action: { t: 'spin' } }] };
  }
  return null;
}
