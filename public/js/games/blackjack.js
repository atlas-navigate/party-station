import { h, mount, cardEl } from '../ui.js';
import { cardTable } from '../three-app/cardtable.js';
import { makeCard } from '../three-app/assets.js';

const CHIP_VALUES = [10, 25, 50, 100];

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const bank = pub.bank[you];

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:10px' },
      h('span', { class: 'numpill', style: 'font-size:18px' }, `🪙 ${bank}`),
      h('span', { class: 'dim' }, `Round ${pub.round + 1}`)));

    if (pub.phase === 'bet') {
      if (priv.betting) {
        kids.push(h('div', { class: 'banner hot center' }, 'Place your bet'));
        kids.push(h('div', { class: 'row wrap', style: 'justify-content:center;margin-top:14px' },
          CHIP_VALUES.filter(v => v <= bank).map(v =>
            h('button', {
              class: 'tok', style: 'width:74px;height:74px;border-radius:50%;font-size:18px',
              onclick: () => send({ t: 'bet', amount: v }),
            }, v)),
          bank >= 10 && h('button', {
            class: 'tok danger', style: 'width:74px;height:74px;border-radius:50%;font-size:15px',
            onclick: () => send({ t: 'bet', amount: bank }),
          }, 'ALL IN'),
        ));
      } else {
        kids.push(h('div', { class: 'banner center' },
          bank < pub.minBet ? 'You’re out of chips — spectating this round.' : 'Bet placed ✓ — waiting for the table…'));
      }
    } else {
      const myHand = pub.hands[you] || [];
      const val = pub.values[you];
      kids.push(h('div', { class: 'row', style: 'justify-content:center;margin:8px 0' },
        myHand.map(c => cardEl(c, { size: 'lg', button: false }))));
      if (myHand.length) {
        kids.push(h('div', { class: 'center', style: 'font-size:22px;font-weight:800' },
          val, val === 21 && myHand.length === 2 ? ' — BLACKJACK! 🎉' : val > 21 ? ' — BUST 💥' : ''));
      }
      if (pub.phase === 'play' && priv.canHit) {
        kids.push(h('div', { class: 'actionbar' },
          h('button', { class: 'tok primary', onclick: () => send({ t: 'hit' }) }, 'Hit'),
          h('button', { class: 'tok', onclick: () => send({ t: 'stand' }) }, 'Stand'),
          priv.canDouble && h('button', { class: 'tok danger', onclick: () => send({ t: 'double' }) }, '2×'),
        ));
      } else if (pub.phase === 'play') {
        kids.push(h('div', { class: 'banner center', style: 'margin-top:10px' },
          pub.turn === you ? '' : `${seats[pub.turn]?.name ?? 'Dealer'} is playing…`));
      }
      if (pub.phase === 'payout') {
        const r = pub.results[you];
        if (r) {
          kids.push(h('div', { class: 'banner center ' + (r.delta > 0 ? 'hot' : ''), style: 'margin-top:10px;font-size:20px' },
            `${r.label} ${r.delta > 0 ? '+' : ''}${r.delta}`));
        }
        kids.push(h('div', { class: 'actionbar' },
          h('button', { class: 'tok primary big', onclick: () => send({ t: 'next' }) }, 'Next round →')));
      }
    }
    mount(el, ...kids);
  },
};

export const tv = {
  mount(holder, ctx) {
    return cardTable(holder, ctx, {
      turnSeat: c => c.pub.phase === 'play' ? c.pub.turn : -1,
      // Blackjack hands are public: lay them face-up in front of each seat.
      seatCards: (c, i) => ({ faces: c.pub.hands[i] || [] }),
      seatSub: (c, i) => {
        const pub = c.pub;
        const r = pub.phase === 'payout' ? pub.results[i] : null;
        const v = pub.values[i] != null ? `${pub.values[i]} · ` : '';
        if (r) return `${v}${r.label} ${r.delta > 0 ? '+' : ''}${r.delta} · 🪙${pub.bank[i]}`;
        return `${v}bet ${pub.bets[i] || '—'} · 🪙${pub.bank[i]}`;
      },
      centerKey: c => JSON.stringify([c.pub.dealer, c.pub.phase, c.pub.round, c.pub.turn]),
      center(c, C) {
        const pub = c.pub;
        C.label('DEALER', { y: 2.3, z: -1.2, size: 22 });
        const row = pub.dealer.length ? pub.dealer : [];
        row.forEach((code, k) => {
          const m = makeCard(code === 'back' ? 'back' : code);
          m.position.set((k - (row.length - 1) / 2) * 0.7, 0.05, -1.1);
          if (code === 'back') m.rotation.y = Math.PI;
          C.group.add(m);
        });
        if (pub.dealerValue != null) {
          C.label(`${pub.dealerValue}${pub.dealerValue > 21 ? ' — BUST 💥' : ''}`,
            { y: 1.5, z: -1.2, size: 26, bg: pub.dealerValue > 21 ? '#ff5d73' : '#10121fcc' });
        }
        if (pub.phase === 'bet') C.label('Place your bets…', { y: 0.6, size: 26, bg: '#ffb52e' });
      },
    });
  },
};

export function padChoices({ pub, priv, seat }) {
  if (pub.phase === 'bet' && priv.betting) {
    const bank = pub.bank[seat];
    return {
      title: `Bet (🪙${bank})`,
      items: [
        ...CHIP_VALUES.filter(v => v <= bank).map(v => ({ label: `${v}`, action: { t: 'bet', amount: v } })),
        bank >= pub.minBet && { label: 'ALL IN', action: { t: 'bet', amount: bank } },
      ].filter(Boolean),
    };
  }
  if (pub.phase === 'play' && pub.turn === seat && priv.canHit) {
    return {
      title: 'Your move', items: [
        { label: 'Hit', action: { t: 'hit' } },
        { label: 'Stand', action: { t: 'stand' } },
        priv.canDouble && { label: 'Double down', action: { t: 'double' } },
      ].filter(Boolean),
    };
  }
  if (pub.phase === 'payout' && pub.results[seat]) {
    return { title: '', items: [{ label: 'Next round →', action: { t: 'next' } }] };
  }
  return null;
}
