import { h, mount, handStrip } from '../ui.js';
import { cardTable } from '../three-app/cardtable.js';
import { makeCard } from '../three-app/assets.js';

const RANK_WORD = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: '10s' };
const rankWord = r => RANK_WORD[r] || r + 's';

function logLine(e, seats) {
  const n = i => seats[i]?.name || '?';
  switch (e.e) {
    case 'took': return `${n(e.seat)} took ${e.n} ${rankWord(e.rank)} from ${n(e.target)}!`;
    case 'gofish': return `${n(e.seat)} asked ${n(e.target)} for ${rankWord(e.rank)} — GO FISH! 🎣`;
    case 'lucky': return `${n(e.seat)} fished up the ${rankWord(e.rank).slice(0, -1)}! 🍀`;
    case 'book': return `${n(e.seat)} completed the book of ${rankWord(e.rank)}! 📚`;
    default: return '';
  }
}

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const yourTurn = pub.turn === you && pub.phase === 'play';
    const myRanks = [...new Set(priv.hand.map(c => c[0]))];
    if (!myRanks.includes(state.rank)) state.rank = null;

    mount(el,
      h('div', { class: 'banner center' + (yourTurn ? ' hot' : '') },
        yourTurn ? 'Your turn — pick a rank, then who to ask' : `${seats[pub.turn]?.name} is fishing…`),
      handStrip(priv.hand, {
        legal: yourTurn ? priv.hand.filter(c => !state.rank || c[0] === state.rank) : null,
        selected: priv.hand.filter(c => c[0] === state.rank),
        onTap: c => { if (yourTurn) { state.rank = state.rank === c[0] ? null : c[0]; ctx.rerender(); } },
      }),
      yourTurn && state.rank && h('div', { class: 'stack', style: 'margin-top:6px' },
        h('div', { class: 'eyebrow' }, `Ask who for ${rankWord(state.rank)}?`),
        h('div', { class: 'row wrap' },
          seats.map((s, i) => i !== you && pub.handCounts[i] > 0
            ? h('button', {
              class: 'tok', onclick: () => { send({ t: 'ask', target: i, rank: state.rank }); state.rank = null; },
            }, `${s.name} (${pub.handCounts[i]})`)
            : null))),
      h('div', { class: 'divider' }),
      h('div', { class: 'spread' },
        h('span', { class: 'dim' }, `Your books: ${pub.books[you].map(rankWord).join(', ') || 'none yet'}`),
        h('span', { class: 'numpill' }, `🌊 ${pub.deckCount}`)),
    );
  },
};

export const tv = {
  mount(holder, ctx) {
    return cardTable(holder, ctx, {
      turnSeat: c => c.pub.phase === 'play' ? c.pub.turn : -1,
      seatCards: (c, i) => ({ count: c.pub.handCounts[i] }),
      peekCards: (c, i) => c.privOf(i)?.hand || [],
      seatSub: (c, i) => `${c.pub.books[i].length} 📚 ${c.pub.books[i].map(rankWord).join(' ')}`,
      centerKey: c => JSON.stringify([c.pub.deckCount, c.pub.log, c.pub.turn]),
      center(c, C) {
        const pub = c.pub;
        // The pond: a loose pile of face-down cards.
        const piles = Math.min(7, Math.max(1, Math.round(pub.deckCount / 6)));
        for (let k = 0; k < piles; k++) {
          const m = makeCard('back');
          const a = (k / piles) * Math.PI * 2;
          m.position.set(Math.cos(a) * 0.5, 0.03 + (k % 3) * 0.015, Math.sin(a) * 0.35);
          m.rotation.y = Math.PI;
          m.rotation.z = a;
          C.group.add(m);
        }
        C.label(`🌊 ${pub.deckCount} in the pond`, { y: 2.5, size: 24 });
        const last = pub.log.slice(-2);
        last.forEach((e, k) => C.label(logLine(e, c.seats), { y: 1.7 - k * 0.42, size: 21 }));
      },
    });
  },
};

export function padChoices({ pub, priv, seat, seats }, stage) {
  if (pub.phase !== 'play' || pub.turn !== seat) return null;
  const myRanks = [...new Set(priv.hand.map(c => c[0]))];
  if (!stage.rank) {
    return {
      title: 'Ask for which rank?',
      items: myRanks.map(r => ({ label: rankWord(r), pick: r, onPick: st => { st.rank = r; } })),
    };
  }
  return {
    title: `${rankWord(stage.rank)} — ask who?`,
    items: [
      ...seats.map((s, i) => (i !== seat && pub.handCounts[i] > 0)
        ? { label: `${s.name} (${pub.handCounts[i]} cards)`, action: { t: 'ask', target: i, rank: stage.rank } }
        : null).filter(Boolean),
      { label: '← different rank', pick: 'back', onPick: st => { st.rank = null; } },
    ],
  };
}
