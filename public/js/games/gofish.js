import { h, mount, handStrip, tableEl, tv2d } from '../ui.js';

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

const statusOf = (pub, you, seats) => you < 0 ? null
  : pub.turn === you && pub.phase === 'play'
    ? { text: 'Your turn — pick a rank, then who to ask', hot: true }
    : { text: `${seats[pub.turn]?.name} is fishing…` };

export const player = {
  status: ctx => statusOf(ctx.pub, ctx.you, ctx.seats),
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const yourTurn = pub.turn === you && pub.phase === 'play';
    const myRanks = [...new Set(priv.hand.map(c => c[0]))];
    if (!myRanks.includes(state.rank)) state.rank = null;
    const st = statusOf(pub, you, seats);

    mount(el,
      ctx.tableShown ? null
        : h('div', { class: 'banner center' + (st.hot ? ' hot' : '') }, st.text),
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

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  mount(el, tableEl(seats, {
    center: h('div', {},
      h('div', { style: 'font-size:26px' }, `🌊 Pond: ${pub.deckCount} cards`),
      h('div', { class: 'log center', style: 'margin-top:10px;font-size:18px' },
        pub.log.slice(-3).map(e => h('div', {}, logLine(e, seats)))),
    ),
    seatEl: (s, i) => h('div', {
      class: 'banner center', style: 'min-width:180px'
        + (pub.turn === i ? ';box-shadow:0 4px 0 var(--marquee-edge),0 0 24px #ffb52e55' : ''),
    },
      h('div', {}, (s.bot ? '🤖 ' : '') + s.name, ' ',
        h('span', { class: 'numpill' }, `${pub.handCounts[i]} cards`)),
      h('div', { style: 'font-size:20px;margin-top:4px;min-height:26px' },
        pub.books[i].length ? pub.books[i].map(() => '📕').join('') : h('span', { class: 'dim', style: 'font-size:14px' }, 'no books yet'),
        h('span', { class: 'dim', style: 'font-size:14px' }, pub.books[i].length ? ` ${pub.books[i].map(rankWord).join(', ')}` : '')),
    ),
  }));
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hand });

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
