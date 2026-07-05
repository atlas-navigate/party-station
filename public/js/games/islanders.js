import { h, mount, sheet } from '../ui.js';
import { createScene, THREE } from '../three-app/scene.js';
import {
  makeHouse, makeLabel, makeCursorRing, canvasTex, SEAT_COLORS as SEAT_HEX3D,
} from '../three-app/assets.js';

const TERRAIN = {
  wood: '#2e7d46', brick: '#c25b3f', wool: '#9fd47f', grain: '#e3b93e',
  ore: '#8b90a8', desert: '#d9c79a',
};
const RES_ICON = { wood: '🌲', brick: '🧱', wool: '🐑', grain: '🌾', ore: '🪨' };
const RES = Object.keys(RES_ICON);
const SEAT_COLORS = ['#ffb52e', '#ff5d73', '#3ecf8e', '#b78bff'];
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

// Renders the island. interact: {verts:[], edges:[], hexes:[], onVert, onEdge, onHex}
export function boardSVG(pub, scale, interact = {}) {
  const B = pub.board;
  const S = scale;
  const pad = S * 1.1;
  const xs = B.verts.map(v => v.x * S), ys = B.verts.map(v => v.y * S);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const svg = svgEl('svg', {
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    style: `width:100%;height:100%;max-height:100%;`,
  });
  // hexes
  B.hexes.forEach((hex, hi) => {
    const pts = hex.verts.map(vi => `${B.verts[vi].x * S},${B.verts[vi].y * S}`).join(' ');
    const clickable = interact.hexes?.includes(hi);
    const poly = svgEl('polygon', {
      points: pts, fill: TERRAIN[hex.res], stroke: '#10121f', 'stroke-width': S * 0.045,
      ...(clickable ? { style: 'cursor:pointer', onclick: () => interact.onHex(hi) } : {}),
    });
    svg.append(poly);
    if (clickable) {
      svg.append(svgEl('polygon', {
        points: pts, fill: 'none', stroke: '#ffb52e', 'stroke-width': S * 0.06,
        'stroke-dasharray': `${S * 0.12} ${S * 0.08}`, 'pointer-events': 'none',
      }));
    }
    if (hex.num) {
      const hot = hex.num === 6 || hex.num === 8;
      svg.append(svgEl('circle', { cx: hex.x * S, cy: hex.y * S, r: S * 0.21, fill: '#f2efe4' }));
      svg.append(svgEl('text', {
        x: hex.x * S, y: hex.y * S + S * 0.075, 'text-anchor': 'middle',
        'font-size': S * 0.22, 'font-weight': 800, fill: hot ? '#d22c47' : '#1c1c28',
      }, String(hex.num)));
    }
    if (pub.bandit === hi) {
      svg.append(svgEl('text', {
        x: hex.x * S, y: hex.y * S - S * 0.26, 'text-anchor': 'middle', 'font-size': S * 0.42,
        'pointer-events': 'none',
      }, '🦹'));
    }
  });
  // roads
  for (const [ei, seat] of Object.entries(pub.roads)) {
    const e = B.edges[ei];
    svg.append(svgEl('line', {
      x1: B.verts[e.a].x * S, y1: B.verts[e.a].y * S,
      x2: B.verts[e.b].x * S, y2: B.verts[e.b].y * S,
      stroke: SEAT_COLORS[seat], 'stroke-width': S * 0.09, 'stroke-linecap': 'round',
    }));
  }
  // legal edge targets
  for (const ei of interact.edges || []) {
    const e = B.edges[ei];
    const mx = (B.verts[e.a].x + B.verts[e.b].x) / 2 * S;
    const my = (B.verts[e.a].y + B.verts[e.b].y) / 2 * S;
    svg.append(svgEl('circle', {
      cx: mx, cy: my, r: S * 0.14, fill: '#ffb52e', stroke: '#10121f', 'stroke-width': S * 0.03,
      style: 'cursor:pointer', onclick: () => interact.onEdge(ei),
    }));
  }
  // buildings
  for (const [vi, b] of Object.entries(pub.builds)) {
    const v = B.verts[vi];
    if (b.city) {
      svg.append(svgEl('rect', {
        x: v.x * S - S * 0.15, y: v.y * S - S * 0.15, width: S * 0.3, height: S * 0.3,
        fill: SEAT_COLORS[b.seat], stroke: '#10121f', 'stroke-width': S * 0.035, rx: S * 0.05,
      }));
    } else {
      svg.append(svgEl('circle', {
        cx: v.x * S, cy: v.y * S, r: S * 0.13,
        fill: SEAT_COLORS[b.seat], stroke: '#10121f', 'stroke-width': S * 0.035,
      }));
    }
  }
  // legal vertex targets
  for (const vi of interact.verts || []) {
    const v = B.verts[vi];
    svg.append(svgEl('circle', {
      cx: v.x * S, cy: v.y * S, r: S * 0.15, fill: '#ffb52e88', stroke: '#ffb52e',
      'stroke-width': S * 0.04, style: 'cursor:pointer', onclick: () => interact.onVert(vi),
    }));
  }
  return svg;
}

function resRow(res) {
  return h('div', { class: 'row wrap', style: 'gap:6px' },
    Object.keys(RES_ICON).map(k =>
      h('span', { class: 'numpill', style: 'font-size:15px' }, `${RES_ICON[k]}${res[k] || 0}`)));
}

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTurn = pub.turn === you;
    const mode = state.mode; // 'road' | 'settlement' | 'city' | null

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:6px' },
      resRow(priv.res),
      h('span', { class: 'numpill', style: 'background:var(--marquee);color:#241a02' }, `${pub.scores[you]} VP`)));

    let interact = {};
    let hint = null;

    if (priv.mustDiscard > 0) {
      hint = h('div', { class: 'banner hot center' }, `Bandit! Discard ${priv.mustDiscard} cards`);
      kids.push(hint, discardPicker(priv, send, state, ctx));
      mount(el, ...kids);
      return;
    }

    if (pub.phase === 'setup' && myTurn) {
      if (pub.setupStage === 'settlement') {
        hint = h('div', { class: 'banner hot center' }, '🏠 Tap a glowing spot for your settlement');
        interact = { verts: priv.legalVerts || [], onVert: v => send({ t: 'placeSet', v }) };
      } else {
        hint = h('div', { class: 'banner hot center' }, '🛤️ Now tap a road next to it');
        interact = { edges: priv.legalEdges || [], onEdge: e => send({ t: 'placeRoad', e }) };
      }
    } else if (myTurn && pub.step === 'roll') {
      hint = h('div', { class: 'banner hot center' }, 'Your turn!');
    } else if (myTurn && pub.step === 'bandit') {
      hint = h('div', { class: 'banner hot center' }, '🦹 Tap a hex to move the bandit');
      interact = {
        hexes: pub.board.hexes.map((_, i) => i).filter(i => i !== pub.bandit),
        onHex: hex => send({ t: 'bandit', hex }),
      };
    } else if (myTurn && pub.step === 'main') {
      if (mode === 'road') {
        hint = h('div', { class: 'banner hot center' }, 'Tap where the road goes');
        interact = { edges: priv.legalEdges || [], onEdge: e => { send({ t: 'build', kind: 'road', e }); state.mode = null; } };
      } else if (mode === 'settlement') {
        hint = h('div', { class: 'banner hot center' }, 'Tap a spot for the settlement');
        interact = { verts: priv.legalVerts || [], onVert: v => { send({ t: 'build', kind: 'settlement', v }); state.mode = null; } };
      } else if (mode === 'city') {
        hint = h('div', { class: 'banner hot center' }, 'Tap one of your settlements to upgrade');
        interact = { verts: priv.upgradable || [], onVert: v => { send({ t: 'build', kind: 'city', v }); state.mode = null; } };
      }
    } else if (!myTurn) {
      hint = h('div', { class: 'banner center' }, `${seats[pub.turn]?.name}’s turn…`);
    }
    if (hint) kids.push(hint);

    kids.push(h('div', { style: 'height:44vh;margin:10px -6px' }, boardSVG(pub, 60, interact)));

    if (myTurn && pub.step === 'roll') {
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'roll' }) }, '🎲 Roll')));
    } else if (myTurn && pub.step === 'main' && !mode) {
      kids.push(h('div', { class: 'row wrap', style: 'justify-content:center' },
        h('button', {
          class: 'tok small', disabled: !(priv.legalEdges || []).length,
          onclick: () => { state.mode = 'road'; ctx.rerender(); },
        }, '🛤️ Road (🌲🧱)'),
        h('button', {
          class: 'tok small', disabled: !(priv.legalVerts || []).length,
          onclick: () => { state.mode = 'settlement'; ctx.rerender(); },
        }, '🏠 Settle (🌲🧱🐑🌾)'),
        h('button', {
          class: 'tok small', disabled: !(priv.upgradable || []).length,
          onclick: () => { state.mode = 'city'; ctx.rerender(); },
        }, '🏛️ City (🪨×3 🌾×2)'),
        h('button', { class: 'tok small', onclick: () => tradeSheet(priv, send) }, '🔁 Trade 4:1'),
      ));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'end' }) }, 'End turn ✓')));
    } else if (mode) {
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok ghost big', onclick: () => { state.mode = null; ctx.rerender(); } }, 'Cancel')));
    }
    mount(el, ...kids);
  },
};

function discardPicker(priv, send, state, ctx) {
  state.give = state.give || {};
  const count = Object.values(state.give).reduce((a, b) => a + b, 0);
  return h('div', { class: 'stack', style: 'margin-top:10px' },
    h('div', { class: 'row wrap', style: 'justify-content:center' },
      Object.keys(RES_ICON).map(k => {
        const have = priv.res[k] || 0;
        const giving = state.give[k] || 0;
        return h('button', {
          class: 'tok', disabled: !have,
          onclick: () => {
            state.give[k] = (giving + 1) % (have + 1);
            ctx.rerender();
          },
        }, `${RES_ICON[k]} ${giving}/${have}`);
      })),
    h('button', {
      class: 'tok primary big', disabled: count !== priv.mustDiscard,
      onclick: () => { send({ t: 'discard', give: state.give }); state.give = {}; },
    }, `Discard ${count}/${priv.mustDiscard}`));
}

function tradeSheet(priv, send) {
  let give = null;
  const s = sheet('Bank trade — give 4, get 1',
    h('div', { class: 'eyebrow' }, 'Give 4×'),
    h('div', { class: 'row wrap', id: 'give-row' },
      Object.keys(RES_ICON).map(k => h('button', {
        class: 'tok', disabled: (priv.res[k] || 0) < 4,
        onclick: e => {
          give = k;
          for (const b of e.target.parentElement.children) b.classList.remove('primary');
          e.target.classList.add('primary');
        },
      }, `${RES_ICON[k]} ×4`))),
    h('div', { class: 'eyebrow', style: 'margin-top:12px' }, 'Get 1×'),
    h('div', { class: 'row wrap' },
      Object.keys(RES_ICON).map(k => h('button', {
        class: 'tok',
        onclick: () => { if (give && give !== k) { send({ t: 'trade', give, get: k }); s.remove(); } },
      }, `${RES_ICON[k]}`))),
  );
}

// 3D island: extruded terrain hexes, trees on forests, peaks on mountains,
// wooden roads, little settlements that grow into cities, a skulking bandit.
const T3D = {
  wood: { color: 0x2e7d46, h: 0.34 }, brick: { color: 0xc2593c, h: 0.3 },
  wool: { color: 0x9fd47f, h: 0.2 }, grain: { color: 0xe3b93e, h: 0.22 },
  ore: { color: 0x8b90a8, h: 0.44 }, desert: { color: 0xd9c79a, h: 0.14 },
};
const S3 = 1.62;
const DOTS3 = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function numTokenTex(num) {
  const hot = num === 6 || num === 8;
  return canvasTex('itok:' + num, 64, 64, g => {
    g.fillStyle = '#f2ecd8'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.fillStyle = hot ? '#d22c47' : '#26231e';
    g.font = '800 26px system-ui'; g.textAlign = 'center';
    g.fillText(num, 32, 38);
    for (let d = 0; d < (DOTS3[num] || 0); d++) {
      g.beginPath(); g.arc(32 + (d - (DOTS3[num] - 1) / 2) * 9, 52, 2.6, 0, 7); g.fill();
    }
  });
}

export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 10.8, 9.8], lookAt: [0, 0, -0.2], fov: 44 });
    const B = ctx.pub.board;
    const P = (x, y) => [x * S3, y * S3]; // board 2D -> world x/z

    // Sea.
    const sea = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.12, 40),
      new THREE.MeshLambertMaterial({ color: 0x1c4f7a }));
    sea.position.y = -0.09;
    sc.scene.add(sea);

    // Terrain hexes with scenery.
    B.hexes.forEach(hex => {
      const t = T3D[hex.res] || T3D.desert;
      const [x, z] = P(hex.x, hex.y);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.565 * S3, 0.585 * S3, t.h, 6),
        new THREE.MeshLambertMaterial({ color: t.color }));
      m.position.set(x, t.h / 2, z);
      m.rotation.y = Math.PI / 6;
      sc.scene.add(m);
      if (hex.res === 'wood') {
        for (const [dx, dz] of [[-0.32, -0.1], [0.3, 0.22], [0.05, -0.38]]) {
          const tr = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 7),
            new THREE.MeshLambertMaterial({ color: 0x1e5c34 }));
          tr.position.set(x + dx, t.h + 0.2, z + dz);
          sc.scene.add(tr);
        }
      }
      if (hex.res === 'ore') {
        const pk = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 5),
          new THREE.MeshLambertMaterial({ color: 0x6e7387 }));
        pk.position.set(x + 0.1, t.h + 0.24, z);
        sc.scene.add(pk);
      }
      if (hex.res === 'wool') {
        for (const [dx, dz] of [[-0.25, 0.15], [0.3, -0.2]]) {
          const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
            new THREE.MeshLambertMaterial({ color: 0xf5f2e8 }));
          sh.position.set(x + dx, t.h + 0.08, z + dz);
          sc.scene.add(sh);
        }
      }
      if (hex.num) {
        const tok = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 18),
          [new THREE.MeshLambertMaterial({ color: 0xd8d2be }),
            new THREE.MeshLambertMaterial({ map: numTokenTex(hex.num) }),
            new THREE.MeshLambertMaterial({ color: 0xd8d2be })]);
        tok.position.set(x, t.h + 0.03, z);
        sc.scene.add(tok);
      }
    });

    const dynamic = new THREE.Group();
    sc.scene.add(dynamic);
    const bandit = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 8),
      new THREE.MeshLambertMaterial({ color: 0x1a1a24 }));
    sc.scene.add(bandit);
    const focusRing = makeCursorRing(0xffb52e);
    focusRing.visible = false;
    sc.scene.add(focusRing);

    const hudPanel = document.createElement('div');
    hudPanel.style.cssText = 'position:absolute;right:14px;top:10px;display:flex;flex-direction:column;gap:8px;font-size:15px;min-width:230px;';
    const hudLog = document.createElement('div');
    hudLog.style.cssText = 'position:absolute;left:14px;bottom:10px;font-size:14px;color:#9aa0b8;line-height:1.6;max-width:32%;';
    const hudTop = document.createElement('div');
    hudTop.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);font-weight:800;font-size:18px;'
      + 'background:#10121fcc;padding:8px 18px;border-radius:12px;';
    sc.hud.append(hudPanel, hudLog, hudTop);

    function update(c) {
      const pub = c.pub;
      sc.clearGroup(dynamic);
      for (const [ei, seat] of Object.entries(pub.roads)) {
        const e = B.edges[ei];
        const a = B.verts[e.a], b = B.verts[e.b];
        const [ax, az] = P(a.x, a.y), [bx, bz] = P(b.x, b.y);
        const len = Math.hypot(bx - ax, bz - az);
        const road = new THREE.Mesh(new THREE.BoxGeometry(len * 0.72, 0.1, 0.13),
          new THREE.MeshLambertMaterial({ color: SEAT_HEX3D[seat % 6] }));
        road.position.set((ax + bx) / 2, 0.42, (az + bz) / 2);
        road.rotation.y = -Math.atan2(bz - az, bx - ax);
        dynamic.add(road);
      }
      for (const [vi, bld] of Object.entries(pub.builds)) {
        const v = B.verts[vi];
        const [x, z] = P(v.x, v.y);
        const house = makeHouse(SEAT_HEX3D[bld.seat % 6], bld.city);
        house.position.set(x, 0.4, z);
        house.scale.setScalar(bld.city ? 1.5 : 1.15);
        dynamic.add(house);
      }
      const bh = B.hexes[pub.bandit];
      const [bx2, bz2] = P(bh.x, bh.y);
      bandit.position.set(bx2 + 0.3, (T3D[bh.res] || T3D.desert).h + 0.3, bz2 + 0.3);

      hudTop.textContent = pub.phase === 'setup'
        ? `Setup — ${c.seats[pub.turn].name} places a ${pub.setupStage}`
        : pub.step === 'discard' ? 'Rolled 7! Over-stocked players discard…'
          : pub.step === 'bandit' ? `${c.seats[pub.turn].name} moves the bandit 🦹`
            : pub.dice ? `🎲 ${pub.dice[0] + pub.dice[1]} — ${c.seats[pub.turn].name}'s turn`
              : `${c.seats[pub.turn].name}'s turn`;
      hudPanel.innerHTML = c.seats.map((s, i) => `
        <div style="background:${pub.turn === i ? '#3a3145' : '#10121fcc'};border-radius:10px;padding:8px 12px;
          border-left:5px solid ${SEAT_COLORS[i]}">
          <b>${s.bot ? '🤖 ' : ''}${s.name}</b>
          <span style="float:right;font-weight:800;color:#ffb52e">${pub.scores[i]} VP</span>
          <div style="color:#9aa0b8;font-size:12px">${pub.resCounts[i]} cards · road ${pub.roadLens?.[i] ?? 0}${pub.lrHolder === i ? ' 👑' : ''}</div>
        </div>`).join('');
      hudLog.innerHTML = pub.log.slice(-4).map(l => `<div>${l}</div>`).join('');
      sc.invalidate();
    }

    return {
      update,
      rehome: h2 => sc.rehome(h2),
      dispose: () => sc.dispose(),
      focus(seat, f) {
        focusRing.visible = false;
        if (f && typeof f === 'object') {
          let x, z, y = 0.45;
          if (f.v != null) { const v = B.verts[f.v]; [x, z] = P(v.x, v.y); }
          else if (f.e != null) {
            const e = B.edges[f.e];
            [x, z] = P((B.verts[e.a].x + B.verts[e.b].x) / 2, (B.verts[e.a].y + B.verts[e.b].y) / 2);
          } else if (f.hex != null) { const hx = B.hexes[f.hex]; [x, z] = P(hx.x, hx.y); y = 0.7; }
          if (x !== undefined) {
            focusRing.visible = true;
            focusRing.position.set(x, y, z);
          }
        }
        sc.invalidate();
      },
    };
  },
};

function vertLabel(pub, vi) {
  const pips = pub.board.verts[vi].hexes.reduce((a, hi) => {
    const hx = pub.board.hexes[hi];
    return a + (DOTS3[hx.num] || 0);
  }, 0);
  return `Spot ${'⭐'.repeat(Math.max(1, Math.round(pips / 4)))} (${pips} pips)`;
}

export function padChoices({ pub, priv, seat, seats }, stage) {
  if (priv.mustDiscard > 0) {
    stage.give = stage.give || {};
    const total = RES.reduce((a, k) => a + (stage.give[k] || 0), 0);
    return {
      title: `Discard ${total}/${priv.mustDiscard}`, sticky: true,
      items: [
        ...RES.filter(k => (priv.res[k] || 0) > 0).map(k => ({
          label: `${RES_ICON[k]} ${stage.give[k] || 0}/${priv.res[k]}`,
          pick: k, on: (stage.give[k] || 0) > 0,
          onPick: st => { st.give[k] = ((st.give[k] || 0) + 1) % ((priv.res[k] || 0) + 1); },
        })),
        { label: 'Discard ✓', disabled: total !== priv.mustDiscard,
          action: { t: 'discard', give: stage.give } },
      ],
    };
  }
  if (pub.turn !== seat) return null;
  if (pub.phase === 'setup') {
    if (pub.setupStage === 'settlement') {
      return {
        title: 'Place a settlement',
        items: (priv.legalVerts || []).slice(0, 20).map(v => ({
          label: vertLabel(pub, v), focus: { v }, action: { t: 'placeSet', v },
        })),
      };
    }
    return {
      title: 'Place the road',
      items: (priv.legalEdges || []).map((e, k) => ({
        label: `Road option ${k + 1}`, focus: { e }, action: { t: 'placeRoad', e },
      })),
    };
  }
  if (pub.step === 'roll') return { title: 'Your turn', items: [{ label: '🎲 Roll', action: { t: 'roll' } }] };
  if (pub.step === 'bandit') {
    return {
      title: 'Move the bandit',
      items: pub.board.hexes.map((hx, hi) => hi !== pub.bandit
        ? { label: `${hx.res}${hx.num ? ' ' + hx.num : ''}`, focus: { hex: hi }, action: { t: 'bandit', hex: hi } }
        : null).filter(Boolean),
    };
  }
  if (pub.step === 'main') {
    if (stage.mode === 'road') {
      return {
        title: 'Build road', items: [
          ...(priv.legalEdges || []).map((e, k) => ({ label: `Road option ${k + 1}`, focus: { e }, action: { t: 'build', kind: 'road', e } })),
          { label: '← back', pick: 'b', onPick: st => { st.mode = null; } },
        ],
      };
    }
    if (stage.mode === 'settlement') {
      return {
        title: 'Build settlement', items: [
          ...(priv.legalVerts || []).map(v => ({ label: vertLabel(pub, v), focus: { v }, action: { t: 'build', kind: 'settlement', v } })),
          { label: '← back', pick: 'b', onPick: st => { st.mode = null; } },
        ],
      };
    }
    if (stage.mode === 'city') {
      return {
        title: 'Upgrade to city', items: [
          ...(priv.upgradable || []).map(v => ({ label: vertLabel(pub, v), focus: { v }, action: { t: 'build', kind: 'city', v } })),
          { label: '← back', pick: 'b', onPick: st => { st.mode = null; } },
        ],
      };
    }
    if (stage.mode === 'trade') {
      if (!stage.give) {
        return {
          title: 'Give 4 of…', items: [
            ...RES.filter(k => (priv.res[k] || 0) >= 4).map(k => ({
              label: `${RES_ICON[k]} ×4`, pick: k, onPick: st => { st.give = k; },
            })),
            { label: '← back', pick: 'b', onPick: st => { st.mode = null; } },
          ],
        };
      }
      return {
        title: `4 ${RES_ICON[stage.give]} → 1 of…`, items: [
          ...RES.filter(k => k !== stage.give).map(k => ({
            label: RES_ICON[k], action: { t: 'trade', give: stage.give, get: k },
          })),
          { label: '← back', pick: 'b', onPick: st => { st.give = null; } },
        ],
      };
    }
    return {
      title: 'Build & trade', items: [
        { label: '🛤️ Road (🌲🧱)', pick: 'm', disabled: !(priv.legalEdges || []).length, onPick: st => { st.mode = 'road'; } },
        { label: '🏠 Settlement (🌲🧱🐑🌾)', pick: 'm', disabled: !(priv.legalVerts || []).length, onPick: st => { st.mode = 'settlement'; } },
        { label: '🏛️ City (🪨×3 🌾×2)', pick: 'm', disabled: !(priv.upgradable || []).length, onPick: st => { st.mode = 'city'; } },
        { label: '🔁 Trade 4:1', pick: 'm', disabled: !RES.some(k => (priv.res[k] || 0) >= 4), onPick: st => { st.mode = 'trade'; } },
        { label: 'End turn ✓', action: { t: 'end' } },
      ],
    };
  }
  return null;
}
