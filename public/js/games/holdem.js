import { h, mount, cardEl, sheet, tableEl, tv2d } from '../ui.js';

const STREETS = ['Pre-flop', 'Flop', 'Turn', 'River'];

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const stack = pub.stacks[you];

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill', style: 'font-size:18px' }, `🪙 ${stack}`),
      h('span', { class: 'dim' }, `Hand #${pub.handNum} · Pot ${pub.pot}`)));

    if (pub.busted[you]) {
      kids.push(h('div', { class: 'banner center' }, 'You busted out — spectating. 💀'));
      mount(el, ...kids); return;
    }

    // flex:1 floats your hole cards mid-screen; banners/actions sit below
    kids.push(h('div', { class: 'row', style: 'justify-content:center;margin:10px 0;flex:1' },
      priv.hole
        ? priv.hole.map(c => cardEl(c, { size: 'lg', button: false }))
        : [cardEl('back', { size: 'lg' }), cardEl('back', { size: 'lg' })]));

    if (pub.phase === 'hand') {
      if (!pub.inHand[you]) {
        if (!ctx.tableShown) kids.push(h('div', { class: 'banner center' }, 'Folded — waiting for the next hand.'));
      } else if (priv.yourTurn) {
        const toCall = priv.toCall;
        if (!ctx.tableShown) {
          kids.push(h('div', { class: 'banner hot center' },
            toCall > 0 ? `${toCall} to call` : 'Your action'));
        }
        kids.push(h('div', { class: 'actionbar' },
          h('button', { class: 'tok danger', onclick: () => send({ t: 'fold' }) }, 'Fold'),
          toCall > 0
            ? h('button', { class: 'tok primary', onclick: () => send({ t: 'call' }) },
              toCall >= stack ? 'ALL IN' : `Call ${toCall}`)
            : h('button', { class: 'tok primary', onclick: () => send({ t: 'check' }) }, 'Check'),
          stack > toCall && h('button', { class: 'tok', onclick: () => raiseSheet(pub, priv, you, send) }, 'Raise'),
        ));
      } else {
        if (!ctx.tableShown) {
          kids.push(h('div', { class: 'banner center' },
            pub.turn >= 0 ? `${seats[pub.turn]?.name} is thinking…` : 'Dealing…'));
        }
        if (pub.allin[you]) kids.push(h('div', { class: 'center dim', style: 'margin-top:8px' }, 'You’re all in! 🚀'));
      }
    }
    if (pub.phase === 'payout') {
      // Your result is personal news, not table state — always shown.
      const r = pub.results;
      const won = r?.pots?.filter(p => p.winners.includes(you)).reduce((a, p) => a + p.amount, 0) || 0;
      kids.push(h('div', { class: 'banner center' + (won ? ' hot' : ''), style: 'margin-top:8px' },
        won ? `You win ${won}! 🎉` : 'Hand over.'));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'next' }) }, 'Next hand →')));
    }
    mount(el, ...kids);
  },
};

function raiseSheet(pub, priv, you, send) {
  const min = priv.minRaiseTo;
  const max = pub.committed[you] + pub.stacks[you];
  let val = Math.min(max, min);
  const label = h('div', { class: 'center', style: 'font-size:34px;font-weight:800;margin:10px 0' }, val);
  const slider = h('input', {
    type: 'range', min, max, step: pub.bb, value: val, style: 'width:100%',
    oninput: e => { val = Number(e.target.value); label.textContent = val >= max ? `${val} (ALL IN)` : val; },
  });
  const s = sheet('Raise to…', label, slider,
    h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'tok ghost grow', onclick: () => s.remove() }, 'Never mind'),
      h('button', { class: 'tok primary grow', onclick: () => { send({ t: 'raise', to: val }); s.remove(); } }, 'Raise')));
}

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  const r = pub.phase === 'payout' ? pub.results : null;
  const board = r ? r.board : pub.board;
  mount(el, tableEl(seats, {
    center: h('div', {},
      h('div', { class: 'eyebrow', style: 'font-size:15px' },
        pub.phase === 'payout' ? 'Showdown' : STREETS[pub.street] || ''),
      h('div', { class: 'row', style: 'justify-content:center;margin-top:8px;min-height:110px' },
        [0, 1, 2, 3, 4].map(i => board[i] ? cardEl(board[i], { size: 'lg', button: false }) : cardEl('back', { size: 'lg' }))),
      h('div', { style: 'font-size:30px;font-weight:800;margin-top:8px' }, `Pot ${pub.pot} 🪙`),
    ),
    seatEl: (s, i) => {
      const shown = r?.shown?.[i];
      const winner = r?.pots?.some(p => p.winners.includes(i));
      return h('div', {
        class: 'banner center',
        style: 'min-width:160px'
          + (pub.turn === i ? ';box-shadow:0 4px 0 var(--marquee-edge),0 0 24px #ffb52e66' : '')
          + (pub.busted[i] || (!pub.inHand[i] && pub.phase === 'hand') ? ';opacity:.4' : '')
          + (winner ? ';background:#3a3145' : ''),
      },
        h('div', {}, (s.bot ? '🤖 ' : '') + s.name, pub.button === i ? ' 🔘' : ''),
        shown
          ? h('div', { class: 'row', style: 'justify-content:center;margin:6px 0' },
            shown.cards.map(c => cardEl(c, { size: 'sm', button: false })))
          : pub.inHand[i] && h('div', { class: 'row', style: 'justify-content:center;margin:6px 0' },
            [cardEl('back', { size: 'sm' }), cardEl('back', { size: 'sm' })]),
        h('div', { class: 'dim', style: 'font-size:16px' },
          `🪙 ${pub.stacks[i]}`, pub.committed[i] ? ` · bet ${pub.committed[i]}` : '', pub.allin[i] ? ' · ALL IN' : ''),
        shown && h('div', { style: 'font-size:14px;color:var(--marquee)' }, shown.name),
        winner && h('div', { style: 'font-weight:800;color:var(--marquee)' },
          `+${r.pots.filter(p => p.winners.includes(i)).reduce((a, p) => a + Math.floor(p.amount / p.winners.length), 0)} 🏆`),
      );
    },
  }));
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hole });

export function padChoices({ pub, priv, seat }) {
  if (pub.phase === 'payout' && !pub.busted[seat]) {
    return { title: '', items: [{ label: 'Next hand →', action: { t: 'next' } }] };
  }
  if (pub.phase !== 'hand' || pub.turn !== seat) return null;
  const toCall = priv.toCall;
  const stack = pub.stacks[seat];
  const maxTo = (pub.committed[seat] || 0) + stack;
  const half = Math.min(maxTo, priv.minRaiseTo + Math.floor(pub.pot / 2 / pub.bb) * pub.bb);
  const potR = Math.min(maxTo, priv.minRaiseTo + Math.floor(pub.pot / pub.bb) * pub.bb);
  const raises = [...new Set([Math.min(priv.minRaiseTo, maxTo), half, potR, maxTo])]
    .filter(v => v > pub.currentBet);
  return {
    title: toCall > 0 ? `${toCall} to call` : 'Your action',
    items: [
      toCall > 0
        ? { label: toCall >= stack ? 'Call ALL-IN' : `Call ${toCall}`, action: { t: 'call' } }
        : { label: 'Check', action: { t: 'check' } },
      ...raises.map(v => ({
        label: v === maxTo ? `Raise ALL-IN (${v})` : `Raise to ${v}`,
        action: { t: 'raise', to: v },
      })),
      { label: 'Fold', action: { t: 'fold' } },
    ],
  };
}
