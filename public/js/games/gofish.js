import { h, mount, handStrip, chipEl } from '../ui.js';

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
  render(el, ctx) {
    const { pub, seats } = ctx;
    mount(el,
      h('div', { style: 'width:100%;max-width:1100px' },
        h('div', { class: 'center', style: 'margin-bottom:24px' },
          h('div', { style: 'font-size:26px' }, `🌊 Pond: ${pub.deckCount} cards`)),
        h('div', { class: 'row wrap', style: 'justify-content:center;gap:18px' },
          seats.map((s, i) => h('div', {
            class: 'banner', style: 'min-width:220px' + (pub.turn === i ? ';box-shadow:0 4px 0 var(--marquee-edge),0 0 24px #ffb52e55' : ''),
          },
            h('div', { class: 'spread' },
              h('span', {}, (s.bot ? '🤖 ' : '') + s.name),
              h('span', { class: 'numpill' }, `${pub.handCounts[i]} 🂠`)),
            h('div', { style: 'font-size:24px;margin-top:6px;min-height:32px' },
              pub.books[i].length ? pub.books[i].map(r => '📕').join('') : h('span', { class: 'dim', style: 'font-size:15px' }, 'no books yet'),
              h('span', { class: 'dim', style: 'font-size:15px' }, pub.books[i].length ? `  ${pub.books[i].map(rankWord).join(', ')}` : '')),
          ))),
        h('div', { class: 'log center', style: 'margin-top:26px;font-size:19px' },
          pub.log.map(e => h('div', {}, logLine(e, seats)))),
      ));
  },
};
