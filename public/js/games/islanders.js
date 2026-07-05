import { h, mount, sheet } from '../ui.js';

const TERRAIN = {
  wood: '#2e7d46', brick: '#c25b3f', wool: '#9fd47f', grain: '#e3b93e',
  ore: '#8b90a8', desert: '#d9c79a',
};
const RES_ICON = { wood: '🌲', brick: '🧱', wool: '🐑', grain: '🌾', ore: '🪨' };
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

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    mount(el,
      h('div', { style: 'display:flex;gap:24px;width:100%;height:100%;align-items:center;justify-content:center' },
        h('div', { style: 'height:min(74vh,700px);flex:0 1 760px' }, boardSVG(pub, 60)),
        h('div', { class: 'stack', style: 'min-width:270px' },
          pub.dice && h('div', { class: 'banner center', style: 'font-size:26px' },
            `🎲 ${pub.dice[0] + pub.dice[1]}`),
          seats.map((s, i) => h('div', {
            class: 'banner',
            style: `border-left:6px solid ${SEAT_COLORS[i]};`
              + (pub.turn === i ? 'box-shadow:0 4px 0 var(--marquee-edge),0 0 20px #ffb52e55;' : ''),
          },
            h('div', { class: 'spread' },
              h('span', {}, `${s.bot ? '🤖 ' : ''}${s.name}`),
              h('span', { class: 'numpill', style: 'background:var(--marquee);color:#241a02' }, `${pub.scores[i]} VP`)),
            h('div', { class: 'dim', style: 'font-size:14px;margin-top:3px' },
              `${pub.resCounts[i]} cards · roads ${pub.roadLens?.[i] ?? 0}${pub.lrHolder === i ? ' 🛤️👑' : ''}`),
          )),
          h('div', { class: 'log', style: 'font-size:15px' }, pub.log.slice(-4).map(l => h('div', {}, l))),
        )));
  },
};
