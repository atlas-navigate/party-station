import { h, mount, sheet } from '../ui.js';
import { createScene, THREE } from '../three-app/scene.js';
import {
  canvasTex, makeToken, makeHouse, makeDie, rollDie, makeCursorRing,
  SEAT_COLORS, SEAT_CSS,
} from '../three-app/assets.js';

const GROUP_COLORS = {
  brown: '#9c6644', sky: '#7fc8f8', pink: '#f472b6', orange: '#fb923c',
  red: '#ef4444', yellow: '#facc15', green: '#4ade80', navy: '#60a5fa',
};
const TOKENS = ['🎩', '🚗', '🐕', '🚢', '👞', '🐈'];
const TYPE_ICON = { start: '🏁', fund: '🎁', tax: '💸', transit: '🚂', fortune: '❓', lockup: '🚔', utility: '⚡', plaza: '⛲', busted: '👮' };

function cellPos(i) {
  if (i <= 10) return { r: 11, c: 11 - i };
  if (i <= 20) return { r: 11 - (i - 10), c: 1 };
  if (i <= 30) return { r: 1, c: i - 19 };
  return { r: i - 29, c: 11 };
}

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTurn = pub.turn === you && pub.phase === 'play';
    const sp = pub.board[pub.pos[you]];

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill', style: 'font-size:18px' }, `${TOKENS[you % 6]} 💵 ${pub.cash[you]}`),
      h('span', { class: 'dim', style: 'font-size:13px' },
        `Round ${pub.round}${pub.roundCap ? '/' + pub.roundCap : ''} · at ${sp?.name}`)));

    if (pub.out[you]) {
      kids.push(h('div', { class: 'banner center' }, 'Bankrupt! 💀 Enjoy the schadenfreude.'));
      mount(el, ...kids); return;
    }

    if (!myTurn) {
      kids.push(h('div', { class: 'banner center' }, `${seats[pub.turn]?.name}’s turn…`));
    } else if (pub.step === 'roll' || pub.step === 'rollAgain') {
      kids.push(h('div', { class: 'banner hot center' },
        pub.step === 'rollAgain' ? 'Doubles — roll again!' : 'Your turn!'));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'roll' }) }, '🎲 Roll')));
    } else if (pub.step === 'lockup') {
      kids.push(h('div', { class: 'banner center' }, '🚔 You’re in Lockup.'));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok', onclick: () => send({ t: 'rollOut' }) }, '🎲 Roll doubles'),
        h('button', { class: 'tok primary', disabled: pub.cash[you] < 50, onclick: () => send({ t: 'payOut' }) }, 'Pay 50')));
    } else if (pub.step === 'buy') {
      const b = pub.board[pub.pendingBuy];
      kids.push(h('div', { class: 'banner hot center' }, `Buy ${b.name} for 💵${b.price}?`));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok ghost', onclick: () => send({ t: 'pass' }) }, 'Pass'),
        h('button', { class: 'tok primary', disabled: pub.cash[you] < b.price, onclick: () => send({ t: 'buy' }) }, `Buy it`)));
    } else if (pub.step === 'end') {
      if (priv.buildable.length) {
        kids.push(h('div', { class: 'eyebrow', style: 'margin:8px 0' }, 'Build (own the district!)'));
        kids.push(h('div', { class: 'stack' }, priv.buildable.map(i =>
          h('button', { class: 'tok', onclick: () => send({ t: 'build', space: i }) },
            `🏠 ${pub.board[i].name} — ${pub.upgradeCost[pub.board[i].tier]} (lvl ${pub.level[i] || 0})`))));
      }
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'endTurn' }) }, 'End turn ✓')));
    }

    if (pub.lastCard && pub.lastCard.seat === you) {
      kids.splice(1, 0, h('div', { class: 'banner', style: 'margin-bottom:8px' },
        `${pub.lastCard.kind === 'fortune' ? '❓' : '🎁'} ${pub.lastCard.text}`));
    }

    const owned = Object.keys(pub.owner).map(Number).filter(i => pub.owner[i] === you);
    if (owned.length) {
      kids.push(h('div', { class: 'divider' }));
      kids.push(h('div', { class: 'row wrap' }, owned.map(i =>
        h('span', {
          class: 'numpill',
          style: `border-left:5px solid ${GROUP_COLORS[pub.board[i].group] || '#888'};font-size:12px`,
        }, `${pub.board[i].name}${'⭐'.repeat(pub.level[i] || 0)}`))));
    }
    mount(el, ...kids);
  },
};

// 3D board: an 11×11 perimeter of textured tiles seen at a player's angle,
// with rolling dice, hopping pawns, and little houses on built streets.
function idxToXZ(i) {
  if (i <= 10) return [5 - i, 5];
  if (i <= 20) return [-5, 5 - (i - 10)];
  if (i <= 30) return [-5 + (i - 20), -5];
  return [5, -5 + (i - 30)];
}

function tileTex(sp) {
  const key = 'ty:' + sp.name;
  return canvasTex(key, 128, 128, g => {
    g.fillStyle = '#e6e1cf'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#3a3630'; g.lineWidth = 4; g.strokeRect(0, 0, 128, 128);
    if (sp.group) { g.fillStyle = GROUP_COLORS[sp.group]; g.fillRect(4, 4, 120, 26); }
    g.fillStyle = '#26231e';
    g.textAlign = 'center';
    if (TYPE_ICON[sp.type]) {
      g.font = '44px system-ui';
      g.fillText(TYPE_ICON[sp.type], 64, sp.group ? 76 : 66);
    }
    g.font = '800 15px system-ui';
    const words = sp.name.split(' ');
    words.forEach((w, k) => g.fillText(w, 64, (sp.group ? 52 : 88) + k * 17, 118));
    if (sp.price) { g.font = '700 15px system-ui'; g.fillText('💵' + sp.price, 64, 118); }
  });
}

export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 11.5, 10.4], lookAt: [0, 0, 0.3], fov: 44 });
    const n = ctx.seats.length;

    // Board base + inner center.
    const base = new THREE.Mesh(new THREE.BoxGeometry(11.7, 0.24, 11.7),
      new THREE.MeshLambertMaterial({ color: 0x1d5c3a }));
    base.position.y = -0.13;
    sc.scene.add(base);
    const center = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.05, 8.9),
      new THREE.MeshLambertMaterial({ color: 0x24704a }));
    center.position.y = 0.01;
    sc.scene.add(center);

    ctx.pub.board.forEach((sp, i) => {
      const [x, z] = idxToXZ(i);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.1, 0.97),
        [null, null, new THREE.MeshLambertMaterial({ map: tileTex(sp) }), null, null, null]
          .map(m => m || new THREE.MeshLambertMaterial({ color: 0xcfc9b6 })));
      tile.position.set(x, 0.05, z);
      // Tile art faces the center of the board, like a printed board.
      tile.rotation.y = i <= 10 ? 0 : i <= 20 ? -Math.PI / 2 : i <= 30 ? Math.PI : Math.PI / 2;
      sc.scene.add(tile);
    });

    const dynamic = new THREE.Group(); // owners, houses, highlight
    sc.scene.add(dynamic);
    const tokens = ctx.seats.map((_, i) => {
      const t = makeToken(SEAT_COLORS[i % 6]);
      sc.scene.add(t);
      return t;
    });
    const dice = [makeDie(), makeDie()];
    dice[0].position.set(-0.7, 0.24, 1.6);
    dice[1].position.set(0.7, 0.24, 1.6);
    sc.scene.add(dice[0], dice[1]);
    const buyRing = makeCursorRing();
    buyRing.visible = false;
    sc.scene.add(buyRing);

    const tokenSpot = (i, boardIdx) => {
      const [x, z] = idxToXZ(boardIdx);
      return new THREE.Vector3(x - 0.22 + (i % 3) * 0.22, 0, z - 0.2 + Math.floor(i / 3) * 0.35);
    };
    const lastPos = ctx.pub.pos.slice();
    tokens.forEach((t, i) => t.position.copy(tokenSpot(i, lastPos[i])));
    let lastRollKey = '';

    // Crisp DOM HUD: player panel + log + event banner.
    const hudPanel = document.createElement('div');
    hudPanel.style.cssText = 'position:absolute;right:14px;top:10px;display:flex;flex-direction:column;gap:8px;font-size:15px;';
    const hudLog = document.createElement('div');
    hudLog.style.cssText = 'position:absolute;left:14px;bottom:10px;font-size:14px;color:#9aa0b8;line-height:1.6;max-width:30%;';
    const hudCard = document.createElement('div');
    hudCard.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);font-weight:800;font-size:17px;'
      + 'background:#ffb52e;color:#241a02;padding:8px 18px;border-radius:12px;display:none;max-width:46%;';
    sc.hud.append(hudPanel, hudLog, hudCard);

    function update(c) {
      const pub = c.pub;
      sc.clearGroup(dynamic);
      // ownership markers + houses
      pub.board.forEach((sp, i) => {
        const [x, z] = idxToXZ(i);
        const owner = pub.owner[i];
        if (owner != null && !pub.out[owner]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.03, 0.16),
            new THREE.MeshLambertMaterial({ color: SEAT_COLORS[owner % 6] }));
          const inward = 0.62;
          if (i <= 10) m.position.set(x, 0.12, z - inward);
          else if (i <= 20) { m.position.set(x + inward, 0.12, z); m.rotation.y = Math.PI / 2; }
          else if (i <= 30) m.position.set(x, 0.12, z + inward);
          else { m.position.set(x - inward, 0.12, z); m.rotation.y = Math.PI / 2; }
          dynamic.add(m);
        }
        const lvl = pub.level[i] || 0;
        if (lvl > 0) {
          if (lvl >= 4) {
            const hb = makeHouse(0xd9483b, true);
            hb.position.set(x, 0.1, z + (i <= 10 ? -0.28 : i >= 21 && i <= 30 ? 0.28 : 0));
            dynamic.add(hb);
          } else {
            for (let k = 0; k < lvl; k++) {
              const hh = makeHouse(0x3ecf8e);
              const [dx, dz] = i <= 10 ? [-0.3 + k * 0.3, -0.3] : i <= 20 ? [0.3, -0.3 + k * 0.3]
                : i <= 30 ? [-0.3 + k * 0.3, 0.3] : [-0.3, -0.3 + k * 0.3];
              hh.position.set(x + dx, 0.1, z + dz);
              dynamic.add(hh);
            }
          }
        }
      });
      // pending-buy highlight
      if (pub.step === 'buy' && pub.pendingBuy != null) {
        const [x, z] = idxToXZ(pub.pendingBuy);
        buyRing.visible = true;
        buyRing.position.set(x, 0.16, z);
      } else buyRing.visible = false;
      // tokens hop when they moved
      c.pub.pos.forEach((p, i) => {
        tokens[i].visible = !pub.out[i];
        if (p !== lastPos[i]) {
          sc.hop(tokens[i], tokens[i].position.clone(), tokenSpot(i, p), 0.9, 420);
          lastPos[i] = p;
        }
      });
      // dice
      if (pub.lastRoll) {
        const key2 = pub.lastRoll.join(',') + ':' + pub.turn + ':' + pub.step;
        if (key2 !== lastRollKey) {
          lastRollKey = key2;
          rollDie(sc, dice[0], pub.lastRoll[0]);
          rollDie(sc, dice[1], pub.lastRoll[1]);
        }
      }
      // HUD
      hudPanel.innerHTML = c.seats.map((s, i) => `
        <div style="background:${pub.turn === i && !pub.out[i] ? '#3a3145' : '#10121fcc'};border-radius:10px;padding:8px 12px;
          border-left:5px solid ${SEAT_CSS[i % 6]};${pub.out[i] ? 'opacity:.4' : ''}">
          <b>${s.bot ? '🤖 ' : ''}${s.name}${pub.inLock[i] ? ' 🚔' : ''}</b>
          <span style="float:right;font-weight:800">${pub.out[i] ? '💀' : '💵' + pub.cash[i]}</span>
          <div style="color:#9aa0b8;font-size:12px">net ${pub.netWorth[i]} · round ${pub.round}${pub.roundCap ? '/' + pub.roundCap : ''}</div>
        </div>`).join('');
      hudLog.innerHTML = pub.log.slice(-4).map(l => `<div>${l}</div>`).join('');
      if (pub.lastCard) {
        hudCard.style.display = 'block';
        hudCard.textContent = `${pub.lastCard.kind === 'fortune' ? '❓' : '🎁'} ${pub.lastCard.text}`;
      } else hudCard.style.display = 'none';
      sc.invalidate();
    }

    return { update, rehome: h2 => sc.rehome(h2), dispose: () => sc.dispose() };
  },
};

export function padChoices({ pub, priv, seat }) {
  if (pub.turn !== seat || pub.phase !== 'play') return null;
  if (pub.step === 'roll' || pub.step === 'rollAgain') {
    return {
      title: pub.step === 'rollAgain' ? 'Doubles!' : 'Your turn',
      items: [{ label: '🎲 Roll', action: { t: 'roll' } }],
    };
  }
  if (pub.step === 'lockup') {
    return {
      title: '🚔 In Lockup', items: [
        { label: '🎲 Try for doubles', action: { t: 'rollOut' } },
        { label: 'Pay 50', action: { t: 'payOut' }, disabled: pub.cash[seat] < 50 },
      ],
    };
  }
  if (pub.step === 'buy') {
    const b = pub.board[pub.pendingBuy];
    return {
      title: `${b.name} — 💵${b.price}`, items: [
        { label: `Buy it`, action: { t: 'buy' }, disabled: pub.cash[seat] < b.price },
        { label: 'Pass', action: { t: 'pass' } },
      ],
    };
  }
  if (pub.step === 'end') {
    return {
      title: 'Build?', items: [
        ...(priv.buildable || []).map(i => ({
          label: `🏠 ${pub.board[i].name} (${pub.upgradeCost[pub.board[i].tier]})`,
          action: { t: 'build', space: i },
        })),
        { label: 'End turn ✓', action: { t: 'endTurn' } },
      ],
    };
  }
  return null;
}
