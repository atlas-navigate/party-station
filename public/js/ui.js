// Tiny DOM helpers + shared components (cards, chips, toasts, gamepad).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

export function mount(el, ...children) {
  el.replaceChildren(...children.flat().filter(Boolean));
}

export function toast(text, isErr = false) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, text);
  box.append(t);
  setTimeout(() => t.remove(), 3200);
}

export function sheet(title, ...children) {
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) wrap.remove(); } },
    h('div', { class: 'sheet' }, h('h2', {}, title), ...children));
  document.body.append(wrap);
  return wrap;
}

// ------------------------------------------------------------ playing cards
const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_LABEL = { T: '10' };

export function cardEl(card, opts = {}) {
  if (card === 'back' || !card) {
    return h('div', { class: `pcard back ${opts.size || ''}` });
  }
  const r = card[0], s = card[1];
  const red = s === 'h' || s === 'd';
  return h(opts.button === false ? 'div' : 'button', {
    class: `pcard ${red ? 'red' : ''} ${opts.size || ''} ${opts.sel ? 'sel' : ''} ${opts.dis ? 'dis' : ''}`,
    onclick: opts.onclick,
    'aria-label': `${RANK_LABEL[r] || r} of ${SUIT_GLYPH[s]}`,
  },
    h('span', { class: 'r' }, (RANK_LABEL[r] || r) + SUIT_GLYPH[s]),
    h('span', { class: 's' }, SUIT_GLYPH[s]),
  );
}

export function handStrip(cards, { legal = null, selected = [], onTap, size = '' } = {}) {
  // Split the hand into near-equal rows sized to the phone width, then fan
  // each row like really held cards: every card tilts away from the row's
  // middle (--rot) and the edges droop slightly (--lift, along the card's
  // own axis). Card width (--cw, consumed by .hand-row CSS — overlap is
  // -.45 × width) steps down as the hand grows, so a big hand fans into two
  // compact rows instead of stacking tall ones off the bottom of the screen.
  const usable = Math.min(window.innerWidth || 400, 560) - 48; // screen+hand padding
  const capAt = w => Math.max(4, Math.floor((usable - w) / (w * 0.55)) + 1);
  let cw = 80;
  if (cards.length > capAt(80)) cw = cards.length > capAt(70) * 2 ? 62 : 70;
  const cap = capAt(cw);
  const nRows = Math.max(1, Math.ceil(cards.length / cap));
  const per = Math.ceil(cards.length / nRows);
  const rows = [];
  for (let i = 0; i < cards.length; i += per) rows.push(cards.slice(i, i + per));
  return h('div', { class: 'hand', style: `--cw:${cw}px` }, rows.map(row => {
    const mid = (row.length - 1) / 2;
    const tilt = Math.min(4, 26 / Math.max(row.length, 1));
    return h('div', { class: 'hand-row' }, row.map((c, i) => {
      const el = cardEl(c, {
        size,
        sel: selected.includes(c),
        dis: legal && !legal.includes(c),
        onclick: onTap ? () => onTap(c) : undefined,
      });
      el.style.setProperty('--rot', ((i - mid) * tilt).toFixed(2) + 'deg');
      el.style.setProperty('--lift', (Math.abs(i - mid) ** 2 * 1.6).toFixed(1) + 'px');
      return el;
    }));
  }));
}

// Adapts a per-sync 2D TV render function to the console shell's scene API
// (mount/update/rehome/dispose). Overlays a "peek" panel with the cards of
// any controller player holding Y — pads have no private screen, so this is
// the only place a pad player can check their hand.
export function tv2d(render, { peekCards } = {}) {
  return {
    // The raw per-sync render, exposed so the phone app can draw the same
    // table scene (scaled down) without the console's scene lifecycle.
    render2d: render,
    mount(holder) {
      // .tv-main fills the scene area and centers the game, like the shell
      // did before games moved to 3D; absolute because .tv-scene isn't flex.
      const box = h('div', { class: 'tv-main', style: 'position:absolute;inset:0' });
      holder.append(box);
      return {
        update(ctx) {
          render(box, ctx);
          if (!peekCards || !ctx.peeked?.size) return;
          const panels = [...ctx.peeked].map(seat => {
            const cards = peekCards(ctx, seat);
            if (!cards?.length) return null;
            return h('div', { class: 'pad-menu' },
              h('div', { class: 'pad-menu-title' }, `🎮 ${ctx.seats[seat]?.name} — your cards`),
              h('div', { class: 'row wrap', style: 'gap:4px;max-width:340px' },
                cards.map(c => cardEl(c, { size: 'sm', button: false }))));
          }).filter(Boolean);
          if (panels.length) box.append(h('div', { class: 'peek-panels' }, panels));
        },
        rehome(h2) { h2.append(box); },
        dispose() { box.remove(); },
      };
    },
  };
}

// Oval card table with the players arranged around the rim — seat 0 at the
// bottom, seat i+1 clockwise from seat i. Clockwise matters: it puts seat
// i+1 on seat i's LEFT (players face the middle), which is where server card
// games send passes and turns, so "pass left" visibly goes to your left.
// seatEl(seat, i) builds each player's rim panel; inner(i) optionally places
// content (a played card, …) between that seat and the middle; center fills
// the felt.
export function tableEl(seats, { seatEl, inner, center } = {}) {
  const n = seats.length;
  const spot = (i, r) => {
    const th = (i / n) * 2 * Math.PI;
    return `position:absolute;left:${(50 - r * Math.sin(th)).toFixed(1)}%;`
      + `top:${(50 + r * Math.cos(th)).toFixed(1)}%;transform:translate(-50%,-50%)`;
  };
  return h('div', { class: 'tv-table' },
    h('div', { class: 'felt' }),
    center && h('div', { class: 'tv-table-center' }, center),
    inner ? seats.map((_, i) => {
      const c = inner(i);
      return c && h('div', { style: spot(i, 28) + ';z-index:2' }, c);
    }) : null,
    seats.map((s, i) => h('div', { class: 'tv-seat', style: spot(i, 48) }, seatEl(s, i))),
  );
}

export function chipEl(seat, opts = {}) {
  const initial = (seat.name || '?').trim()[0]?.toUpperCase() || '?';
  return h('div', {
    class: 'chip' + (seat.bot ? ' bot' : '') + (opts.turn ? ' turn' : '')
      + (seat.connected === false ? ' off' : ''),
  },
    h('span', { class: 'dot' }, seat.bot ? '🤖' : initial),
    h('span', {}, seat.name + (opts.extra ? ` ${opts.extra}` : '')),
  );
}

// ------------------------------------------------------------ arcade gamepad
// Renders a touch gamepad and streams button state via send({t:'input',...}).
export function gamepad(el, layout, send) {
  el.innerHTML = '';
  el.style.cssText = 'position:fixed;inset:0;display:flex;justify-content:space-between;align-items:flex-end;padding:20px;touch-action:none;';
  const state = {};
  const press = (k, down) => {
    if (state[k] === down) return;
    state[k] = down;
    send({ t: 'input', d: { k, v: down } });
  };
  const mkBtn = (k, label, style) => {
    const b = h('button', { class: 'tok', style: `width:76px;height:76px;border-radius:50%;font-size:24px;${style || ''}` }, label);
    for (const [ev, down] of [['pointerdown', true], ['pointerup', false], ['pointercancel', false], ['pointerleave', false]]) {
      b.addEventListener(ev, e => { e.preventDefault(); press(k, down); });
    }
    return b;
  };
  const dpad = h('div', { style: 'display:grid;grid-template-columns:repeat(3,64px);grid-template-rows:repeat(3,64px);gap:4px;' });
  const cells = { 1: ['up', '▲'], 3: ['left', '◀'], 5: ['right', '▶'], 7: ['down', '▼'] };
  for (let i = 0; i < 9; i++) {
    if (cells[i]) {
      const [k, label] = cells[i];
      if (layout.dpad.includes(k)) {
        const b = mkBtn(k, label, 'width:64px;height:64px;border-radius:14px;');
        dpad.append(b);
        continue;
      }
    }
    dpad.append(h('div'));
  }
  const btns = h('div', { style: 'display:flex;flex-direction:column;gap:12px;align-items:flex-end;' },
    layout.buttons.map(([k, label, color]) =>
      mkBtn(k, label, color ? `background:var(--${color});box-shadow:0 4px 0 var(--${color}-edge);color:#111;` : '')),
  );
  el.append(dpad, btns);
}
