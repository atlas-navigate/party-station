import { h, mount } from '../ui.js';
import { createScene, THREE } from '../three-app/scene.js';
import { makeToken, SEAT_COLORS as SEAT_HEX, SEAT_CSS } from '../three-app/assets.js';

const TOKENS = ['🍓', '🍊', '🍋', '🍏', '🫐', '🍇'];
const COLOR_HEX = {
  red: '#ef5350', orange: '#ff9445', yellow: '#f7d34c',
  green: '#5fd68a', blue: '#5fa8f5', purple: '#b98af7',
};

function cardFace(card) {
  if (!card) return null;
  if (card.stuckSkip) return h('div', { class: 'banner center', style: 'font-size:20px' }, '🍯 Stuck! Turn skipped.');
  if (card.treat != null) {
    return h('div', { class: 'banner hot center', style: 'font-size:20px' }, `${card.icon} ${card.name}!`);
  }
  return h('div', { class: 'row', style: 'justify-content:center;gap:8px' },
    h('div', { style: `width:64px;height:88px;border-radius:10px;background:${COLOR_HEX[card.color]};box-shadow:0 4px 0 #0007` }),
    card.double && h('div', { style: `width:64px;height:88px;border-radius:10px;background:${COLOR_HEX[card.color]};box-shadow:0 4px 0 #0007` }));
}

export const player = {
  render(el, ctx) {
    const { pub, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const myTurn = pub.turn === you && pub.phase === 'play';
    mount(el,
      h('div', { class: 'center', style: 'margin:6px 0 12px;font-size:15px' },
        `${TOKENS[you % 6]} You’re on space ${pub.pos[you] + 1} of ${pub.spaces.length}`),
      h('div', { class: 'banner center' + (myTurn ? ' hot' : '') },
        myTurn ? (pub.stuck[you] ? '🍯 You’re stuck — draw to wiggle free!' : 'Your turn!') : `${seats[pub.turn]?.name}’s turn…`),
      h('div', { style: 'margin:16px 0;min-height:100px;display:flex;justify-content:center' }, cardFace(pub.lastCard)),
      h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', disabled: !myTurn, onclick: () => send({ t: 'draw' }) }, '🍬 Draw a card')),
    );
  },
};

// 3D candy trail: gumdrop tiles snake across a pastel meadow toward the Sugar
// Castle, with honey pools, shortcut bridges, and lollipop landmarks.
const PER_ROW = 9;
const HEX3 = { red: 0xef5350, orange: 0xff9445, yellow: 0xf7d34c, green: 0x5fd68a, blue: 0x5fa8f5, purple: 0xb98af7 };

function tileXZ(i) {
  const row = Math.floor(i / PER_ROW);
  const col = row % 2 === 0 ? i % PER_ROW : PER_ROW - 1 - (i % PER_ROW);
  return [(col - (PER_ROW - 1) / 2) * 1.32, 4.4 - row * 1.62];
}

export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 10.6, 10.6], lookAt: [0, 0, -0.6], fov: 46, bg: 0x2a2440 });
    // Meadow.
    const ground = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.2, 12.5),
      new THREE.MeshLambertMaterial({ color: 0x7fca8f }));
    ground.position.y = -0.1;
    sc.scene.add(ground);

    ctx.pub.spaces.forEach((sp, i) => {
      const [x, z] = tileXZ(i);
      const tile = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.22, 18),
        new THREE.MeshLambertMaterial({ color: HEX3[sp.color] }));
      tile.position.set(x, 0.11, z);
      sc.scene.add(tile);
      if (sp.sticky) {
        const honey = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8),
          new THREE.MeshLambertMaterial({ color: 0xe8a020 }));
        honey.scale.y = 0.35;
        honey.position.set(x, 0.24, z);
        sc.scene.add(honey);
      }
      if (sp.treat) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6),
          new THREE.MeshLambertMaterial({ color: 0xf5f2e8 }));
        stick.position.set(x + 0.32, 0.5, z);
        const pop = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10),
          new THREE.MeshLambertMaterial({ color: 0xff6ab5 }));
        pop.position.set(x + 0.32, 0.98, z);
        sc.scene.add(stick, pop);
      }
      if (sp.bridgeTo != null) {
        const [tx, tz] = tileXZ(sp.bridgeTo);
        const len = Math.hypot(tx - x, tz - z);
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.42),
          new THREE.MeshLambertMaterial({ color: 0xb98450 }));
        bridge.position.set((x + tx) / 2, 0.6, (z + tz) / 2);
        bridge.rotation.y = -Math.atan2(tz - z, tx - x);
        sc.scene.add(bridge);
      }
    });
    // Sugar Castle past the last tile.
    const [cx, cz] = tileXZ(ctx.pub.spaces.length - 1);
    const castle = new THREE.Group();
    const keep = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshLambertMaterial({ color: 0xf7c8e0 }));
    keep.position.y = 0.55;
    castle.add(keep);
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 10),
        new THREE.MeshLambertMaterial({ color: 0xfae3ef }));
      tower.position.set(dx, 0.75, dz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.45, 10),
        new THREE.MeshLambertMaterial({ color: 0xd45a9c }));
      roof.position.set(dx, 1.72, dz);
      castle.add(tower, roof);
    }
    castle.position.set(cx + 1.9, 0, cz);
    sc.scene.add(castle);

    const tokens = ctx.seats.map((_, i) => {
      const t = makeToken(SEAT_HEX[i % 6]);
      t.scale.setScalar(1.15);
      sc.scene.add(t);
      return t;
    });
    const spot = (i, pos) => {
      if (pos < 0) return new THREE.Vector3(-6.6 + (i % 3) * 0.4, 0.2, 4.4 + Math.floor(i / 3) * 0.5);
      const [x, z] = tileXZ(Math.min(pos, ctx.pub.spaces.length - 1));
      return new THREE.Vector3(x - 0.18 + (i % 3) * 0.18, 0.22, z - 0.14 + Math.floor(i / 3) * 0.3);
    };
    const lastPos = ctx.pub.pos.slice();
    tokens.forEach((t, i) => t.position.copy(spot(i, lastPos[i])));

    const hudCard = document.createElement('div');
    hudCard.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);font-weight:800;'
      + 'font-size:19px;padding:10px 22px;border-radius:14px;background:#10121fcc;display:none;';
    const hudPanel = document.createElement('div');
    hudPanel.style.cssText = 'position:absolute;right:14px;top:10px;display:flex;flex-direction:column;gap:8px;font-size:15px;';
    sc.hud.append(hudCard, hudPanel);

    function update(c) {
      const pub = c.pub;
      pub.pos.forEach((p, i) => {
        if (p !== lastPos[i]) {
          sc.hop(tokens[i], tokens[i].position.clone(), spot(i, p), 1.1, 520);
          lastPos[i] = p;
        }
      });
      const card = pub.lastCard;
      if (card) {
        hudCard.style.display = 'block';
        if (card.stuckSkip) { hudCard.textContent = '🍯 Stuck! Turn skipped'; hudCard.style.background = '#e8a020'; hudCard.style.color = '#241a02'; }
        else if (card.treat != null) { hudCard.textContent = `${card.icon} ${card.name}!`; hudCard.style.background = '#ff6ab5'; hudCard.style.color = '#2b0718'; }
        else {
          hudCard.textContent = (card.double ? 'DOUBLE ' : '') + card.color.toUpperCase() + '!';
          hudCard.style.background = COLOR_HEX[card.color];
          hudCard.style.color = '#1c1216';
        }
      } else hudCard.style.display = 'none';
      hudPanel.innerHTML = c.seats.map((s, i) => `
        <div style="background:${pub.turn === i && pub.phase === 'play' ? '#3a3145' : '#10121fcc'};border-radius:10px;
          padding:8px 12px;border-left:5px solid ${SEAT_CSS[i % 6]}">
          ${TOKENS[i % 6]} <b>${s.bot ? '🤖 ' : ''}${s.name}</b>${pub.stuck[i] ? ' 🍯' : ''}
          <span style="float:right">${pub.pos[i] + 1}/${pub.spaces.length}</span>
        </div>`).join('');
      sc.invalidate();
    }

    return { update, rehome: h2 => sc.rehome(h2), dispose: () => sc.dispose() };
  },
};

export function padChoices({ pub, seat }) {
  if (pub.phase !== 'play' || pub.turn !== seat) return null;
  return {
    title: pub.stuck[seat] ? '🍯 Stuck in taffy!' : 'Your turn',
    items: [{ label: '🍬 Draw a card', action: { t: 'draw' } }],
  };
}
