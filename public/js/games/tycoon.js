import { h, mount, sheet } from '../ui.js';

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

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    const cells = pub.board.map((sp, i) => {
      const { r, c } = cellPos(i);
      const here = pub.pos.map((p, s) => p === i && !pub.out[s] ? s : null).filter(v => v != null);
      const owner = pub.owner[i];
      return h('div', {
        style: `grid-row:${r};grid-column:${c};background:var(--raised);border-radius:6px;padding:3px;
          position:relative;font-size:9px;overflow:hidden;display:flex;flex-direction:column;
          ${owner != null ? `outline:2px solid ${['#ffb52e', '#ff5d73', '#3ecf8e', '#b78bff', '#7fc8f8', '#f472b6'][owner]}` : ''}`,
      },
        sp.group && h('div', { style: `height:6px;border-radius:3px;background:${GROUP_COLORS[sp.group]};margin-bottom:2px` }),
        h('div', { style: 'font-weight:700;line-height:1.15;font-size:9.5px' },
          (TYPE_ICON[sp.type] ? TYPE_ICON[sp.type] + ' ' : '') + sp.name),
        pub.level[i] > 0 && h('div', { style: 'color:var(--marquee);font-size:9px' }, '⭐'.repeat(pub.level[i])),
        here.length > 0 && h('div', { style: 'position:absolute;bottom:2px;right:3px;font-size:14px' },
          here.map(s => TOKENS[s % 6]).join('')),
      );
    });
    mount(el,
      h('div', { style: 'display:flex;gap:28px;align-items:center;width:100%;justify-content:center' },
        h('div', {
          style: `display:grid;grid-template-rows:repeat(11,1fr);grid-template-columns:repeat(11,1fr);
            gap:3px;width:min(78vh,760px);height:min(78vh,760px);position:relative`,
        },
          cells,
          h('div', { style: 'grid-row:2/11;grid-column:2/11;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px' },
            pub.lastRoll && h('div', { style: 'font-size:52px' },
              ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][pub.lastRoll[0] - 1], ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][pub.lastRoll[1] - 1]),
            pub.lastCard && h('div', { class: 'banner', style: 'max-width:340px;font-size:16px;text-align:center' },
              `${pub.lastCard.kind === 'fortune' ? '❓' : '🎁'} ${pub.lastCard.text}`),
            h('div', { class: 'log center', style: 'font-size:14px' }, pub.log.slice(-5).map(l => h('div', {}, l))),
          )),
        h('div', { class: 'stack', style: 'min-width:240px' },
          seats.map((s, i) => h('div', {
            class: 'banner',
            style: (pub.turn === i && !pub.out[i] ? 'box-shadow:0 4px 0 var(--marquee-edge),0 0 20px #ffb52e55;' : '')
              + (pub.out[i] ? 'opacity:.4;' : ''),
          },
            h('div', { class: 'spread' },
              h('span', {}, `${TOKENS[i % 6]} ${s.bot ? '🤖 ' : ''}${s.name}${pub.inLock[i] ? ' 🚔' : ''}`),
              h('span', { class: 'numpill' }, pub.out[i] ? '💀' : `💵${pub.cash[i]}`)),
            h('div', { class: 'dim', style: 'font-size:13px;margin-top:3px' }, `net worth ${pub.netWorth[i]}`),
          ))),
      ));
  },
};
