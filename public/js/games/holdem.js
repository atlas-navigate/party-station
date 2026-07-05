import { h, mount, cardEl, sheet } from '../ui.js';
import { cardTable } from '../three-app/cardtable.js';
import { makeCard } from '../three-app/assets.js';
import { SEAT_COLORS } from '../three-app/assets.js';

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

    kids.push(h('div', { class: 'row', style: 'justify-content:center;margin:10px 0' },
      priv.hole
        ? priv.hole.map(c => cardEl(c, { size: 'lg', button: false }))
        : [cardEl('back', { size: 'lg' }), cardEl('back', { size: 'lg' })]));

    if (pub.phase === 'hand') {
      if (!pub.inHand[you]) {
        kids.push(h('div', { class: 'banner center' }, 'Folded — waiting for the next hand.'));
      } else if (priv.yourTurn) {
        const toCall = priv.toCall;
        kids.push(h('div', { class: 'banner hot center' },
          toCall > 0 ? `${toCall} to call` : 'Your action'));
        kids.push(h('div', { class: 'actionbar' },
          h('button', { class: 'tok danger', onclick: () => send({ t: 'fold' }) }, 'Fold'),
          toCall > 0
            ? h('button', { class: 'tok primary', onclick: () => send({ t: 'call' }) },
              toCall >= stack ? 'ALL IN' : `Call ${toCall}`)
            : h('button', { class: 'tok primary', onclick: () => send({ t: 'check' }) }, 'Check'),
          stack > toCall && h('button', { class: 'tok', onclick: () => raiseSheet(pub, priv, you, send) }, 'Raise'),
        ));
      } else {
        kids.push(h('div', { class: 'banner center' },
          pub.turn >= 0 ? `${seats[pub.turn]?.name} is thinking…` : 'Dealing…'));
        if (pub.allin[you]) kids.push(h('div', { class: 'center dim', style: 'margin-top:8px' }, 'You’re all in! 🚀'));
      }
    }
    if (pub.phase === 'payout') {
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

export const tv = {
  mount(holder, ctx) {
    return cardTable(holder, ctx, {
      turnSeat: c => c.pub.phase === 'hand' ? c.pub.turn : -1,
      seatCards: (c, i) => {
        const r = c.pub.phase === 'payout' ? c.pub.results : null;
        if (r?.shown?.[i]) return { faces: r.shown[i].cards };
        return { count: c.pub.inHand[i] && !c.pub.busted[i] ? 2 : 0 };
      },
      peekCards: (c, i) => c.privOf(i)?.hole || [],
      seatSub: (c, i) => {
        const pub = c.pub;
        if (pub.busted[i]) return '💀 busted';
        const r = pub.phase === 'payout' ? pub.results : null;
        const won = r?.pots?.filter(p => p.winners.includes(i))
          .reduce((a, p) => a + Math.floor(p.amount / p.winners.length), 0) || 0;
        let s = `🪙${pub.stacks[i]}`;
        if (pub.button === i) s += ' 🔘';
        if (pub.committed[i]) s += ` · bet ${pub.committed[i]}`;
        if (pub.allin[i]) s += ' · ALL IN';
        if (!pub.inHand[i] && pub.phase === 'hand') s += ' · folded';
        if (won) s += ` · +${won} 🏆`;
        if (r?.shown?.[i]) s += ` · ${r.shown[i].name}`;
        return s;
      },
      centerKey: c => JSON.stringify([c.pub.board, c.pub.pot, c.pub.phase, c.pub.street, c.pub.turn, c.pub.handNum]),
      center(c, C) {
        const pub = c.pub;
        const r = pub.phase === 'payout' ? pub.results : null;
        const board = r ? r.board : pub.board;
        for (let k = 0; k < 5; k++) {
          const m = makeCard(board[k] || 'back');
          m.position.set((k - 2) * 0.72, 0.05, -0.2);
          if (!board[k]) { m.rotation.y = Math.PI; m.scale.setScalar(0.92); }
          C.group.add(m);
        }
        C.label(`Pot ${pub.pot} 🪙`, { y: 1.35, size: 30, bg: '#ffb52e' });
        C.label(pub.phase === 'payout' ? 'Showdown' : (STREETS[pub.street] || '') + ` · hand #${pub.handNum}`,
          { y: 2.3, size: 21 });
        // Committed chips in front of each live better.
        c.seats.forEach((s, i) => {
          if (pub.committed[i] > 0) {
            const p = C.seatPos(i, 2.6);
            C.chips(p.x, p.z, SEAT_COLORS[i % 6], Math.max(1, Math.round(pub.committed[i] / pub.bb)));
          }
        });
      },
    });
  },
};

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
