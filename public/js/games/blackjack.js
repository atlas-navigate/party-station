import { h, mount, cardEl, tv2d } from '../ui.js';

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
        kids.push(h('div', { class: 'row wrap', style: 'justify-content:center;align-content:center;margin-top:14px;flex:1' },
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
      // margin-top:auto sinks your cards + result toward your thumbs
      kids.push(h('div', { class: 'row', style: 'justify-content:center;margin:auto 0 8px' },
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

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  mount(el,
    h('div', { style: 'width:100%;max-width:1200px' },
      h('div', { class: 'center', style: 'margin-bottom:26px' },
        h('div', { class: 'eyebrow', style: 'font-size:15px;margin-bottom:8px' }, 'Dealer'),
        h('div', { class: 'row', style: 'justify-content:center' },
          pub.dealer.map(c => cardEl(c, { size: 'lg', button: false }))),
        pub.dealerValue != null && h('div', { style: 'font-size:26px;font-weight:800;margin-top:6px' },
          pub.dealerValue, pub.dealerValue > 21 ? ' — BUST 💥' : ''),
        pub.phase === 'bet' && h('div', { class: 'banner hot', style: 'display:inline-block;margin-top:10px' }, 'Place your bets…'),
      ),
      h('div', { class: 'row wrap', style: 'justify-content:center;gap:16px' },
        seats.map((s, i) => {
          const r = pub.phase === 'payout' ? pub.results[i] : null;
          return h('div', {
            class: 'banner center',
            style: 'min-width:190px' + (pub.turn === i ? ';box-shadow:0 4px 0 var(--marquee-edge),0 0 24px #ffb52e66' : '')
              + (pub.sittingOut[i] ? ';opacity:.4' : ''),
          },
            h('div', {}, (s.bot ? '🤖 ' : '') + s.name),
            h('div', { class: 'row', style: 'justify-content:center;margin:8px 0;min-height:60px' },
              (pub.hands[i] || []).map(c => cardEl(c, { size: 'sm', button: false }))),
            h('div', { class: 'dim', style: 'font-size:16px' },
              pub.values[i] != null ? `${pub.values[i]} · ` : '', `bet ${pub.bets[i] || '—'} · 🪙 ${pub.bank[i]}`),
            r && h('div', { style: `font-weight:800;margin-top:4px;color:${r.delta > 0 ? 'var(--marquee)' : r.delta < 0 ? 'var(--danger)' : 'var(--chalk-dim)'}` },
              `${r.label} ${r.delta > 0 ? '+' : ''}${r.delta}`),
          );
        })),
    ));
});

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
