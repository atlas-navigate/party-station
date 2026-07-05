// Shared 3D card table used by all five card games: a felt table seen from a
// player's-eye angle, opponents' hands fanned as card backs, name plates,
// per-game center zone (tricks, boards, dealer hands…), and a peek fan for
// gamepad players (hold Y).
import { createScene, THREE, EASE } from './scene.js';
import {
  makeCard, makeFeltTable, makeLabel, makeChipStack, makeCursorRing,
  SEAT_COLORS, SEAT_CSS, CARD_W,
} from './assets.js';

export function cardTable(holder, ctx0, hooks) {
  const n = ctx0.seats.length;
  const sc = createScene(holder, { camPos: [0, 8.6, 10.2], lookAt: [0, 0, -0.6], fov: 42 });
  sc.scene.add(makeFeltTable(6.4));

  const centerGroup = new THREE.Group();
  sc.scene.add(centerGroup);
  const seatGroups = [];
  const ring = makeCursorRing();
  ring.visible = false;
  sc.scene.add(ring);
  const focusRing = makeCursorRing(0x7fc8f8);
  focusRing.visible = false;
  sc.scene.add(focusRing);

  // Seat 0 sits at the bottom (closest to camera), the rest go around.
  function seatAngle(i) { return Math.PI / 2 + (i / n) * Math.PI * 2; }
  function seatPos(i, r = 4.7) {
    return new THREE.Vector3(Math.cos(seatAngle(i)) * r, 0, Math.sin(seatAngle(i)) * r * 0.82);
  }

  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const p = seatPos(i);
    g.position.copy(p);
    g.lookAt(0, 0, 0);
    sc.scene.add(g);
    seatGroups.push({ group: g, fan: new THREE.Group(), plate: null, sub: '', nameLabel: null });
    g.add(seatGroups[i].fan);
  }

  // ---- helpers exposed to game hooks -------------------------------------
  const C = {
    sc, THREE, group: centerGroup,
    clear() { sc.clearGroup(centerGroup); },
    // Lay a row of cards flat in the center.
    lay(cards, { y = 0.05, z = 0, spacing = 0.72, faceUp = true, scale = 1 } = {}) {
      const row = new THREE.Group();
      cards.forEach((code, k) => {
        const m = makeCard(faceUp ? code : 'back');
        m.position.set((k - (cards.length - 1) / 2) * spacing, y, z);
        if (!faceUp) m.rotation.y = Math.PI;
        m.scale.setScalar(scale);
        row.add(m);
      });
      centerGroup.add(row);
      return row;
    },
    label(text, { x = 0, y = 1.1, z = 0, size = 30, bg = '#10121fcc' } = {}) {
      const l = makeLabel(text, { size, bg });
      l.position.set(x, y, z);
      centerGroup.add(l);
      return l;
    },
    chips(x, z, color, count) {
      const s = makeChipStack(color, count);
      s.position.set(x, 0, z);
      centerGroup.add(s);
      return s;
    },
    seatPos,
  };

  function fanCards(seatIdx, info, peekCodes) {
    const S = seatGroups[seatIdx];
    sc.clearGroup(S.fan);
    if (peekCodes && peekCodes.length) {
      // Peek: lift the cards and face them up toward the camera.
      peekCodes.forEach((code, k) => {
        const m = makeCard(code);
        const spread = Math.min(0.62, 2.6 / peekCodes.length);
        m.position.set((k - (peekCodes.length - 1) / 2) * spread, 1.35, 0.4);
        m.rotation.set(-Math.PI / 5, 0, 0);
        S.fan.add(m);
      });
      return;
    }
    if (info.faces) {
      // Face-up table cards (blackjack style), slightly overlapped toward center.
      info.faces.forEach((code, k) => {
        const m = makeCard(code);
        m.position.set((k - (info.faces.length - 1) / 2) * 0.34, 0.03 + k * 0.013, -1.15);
        S.fan.add(m);
      });
      return;
    }
    const count = Math.min(info.count || 0, 13);
    for (let k = 0; k < count; k++) {
      const m = makeCard('back');
      const spread = Math.min(0.34, 2.2 / Math.max(count, 1));
      m.position.set((k - (count - 1) / 2) * spread, 0.55, 0);
      m.rotation.set(-Math.PI / 3.1, Math.PI, 0); // leaned back, back to the room
      S.fan.add(m);
    }
  }

  let lastCenterKey = null;

  function update(ctx) {
    const turn = hooks.turnSeat ? hooks.turnSeat(ctx) : -1;
    for (let i = 0; i < n; i++) {
      const S = seatGroups[i];
      const info = hooks.seatCards ? hooks.seatCards(ctx, i) : { count: 0 };
      const peek = ctx.peeked?.has(i) && hooks.peekCards ? hooks.peekCards(ctx, i) : null;
      fanCards(i, info, peek);

      const seat = ctx.seats[i];
      const sub = hooks.seatSub ? hooks.seatSub(ctx, i) : '';
      const nameText = `${seat.bot ? '🤖 ' : ''}${seat.name}`;
      const plateKey = nameText + '|' + sub + '|' + (turn === i);
      if (S.plateKey !== plateKey) {
        S.plateKey = plateKey;
        if (S.nameLabel) S.group.remove(S.nameLabel);
        if (S.subLabel) S.group.remove(S.subLabel);
        S.nameLabel = makeLabel(nameText, {
          size: 26, bg: turn === i ? '#ffb52e' : '#10121fcc',
          color: turn === i ? '#241a02' : SEAT_CSS[i % 6],
        });
        S.nameLabel.position.set(0, 1.95, 0);
        S.group.add(S.nameLabel);
        if (sub) {
          S.subLabel = makeLabel(sub, { size: 20, bg: '#10121fb0', color: '#f2efe4' });
          S.subLabel.position.set(0, 1.55, 0);
          S.group.add(S.subLabel);
        } else S.subLabel = null;
      }
    }
    if (turn >= 0) {
      ring.visible = true;
      const p = seatPos(turn, 4.0);
      ring.position.set(p.x, 0.06, p.z);
    } else ring.visible = false;

    const key = hooks.centerKey ? hooks.centerKey(ctx) : JSON.stringify(ctx.pub);
    if (key !== lastCenterKey) {
      lastCenterKey = key;
      C.clear();
      hooks.center(ctx, C);
    }
    sc.invalidate();
  }

  return {
    update,
    rehome: h2 => sc.rehome(h2),
    dispose: () => sc.dispose(),
    focus(seat, focusId) {
      if (hooks.focus) { hooks.focus(seat, focusId, C, focusRing); sc.invalidate(); return; }
      focusRing.visible = false;
      sc.invalidate();
    },
  };
}
