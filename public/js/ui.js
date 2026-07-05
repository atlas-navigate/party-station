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
  return h('div', { class: 'hand' }, cards.map(c => cardEl(c, {
    size,
    sel: selected.includes(c),
    dis: legal && !legal.includes(c),
    onclick: onTap ? () => onTap(c) : undefined,
  })));
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
