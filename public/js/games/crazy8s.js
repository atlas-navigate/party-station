import { h, mount, cardEl, handStrip, chipEl, sheet } from '../ui.js';

const SUITS = [['s', '♠'], ['h', '♥'], ['d', '♦'], ['c', '♣']];
const GLYPH = Object.fromEntries(SUITS);

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const yourTurn = pub.turn === you && pub.phase === 'play';
    const canPass = yourTurn && !priv.legal.length && (pub.drawn >= pub.maxDraws || !pub.deckCount);

    mount(el,
      h('div', { class: 'row', style: 'justify-content:center;gap:14px;margin:6px 0 4px' },
        cardEl(pub.top, { button: false }),
        h('div', {},
          h('div', { class: 'eyebrow' }, 'Suit'),
          h('div', { style: `font-size:34px;color:${pub.suit === 'h' || pub.suit === 'd' ? '#ff5d73' : '#f2efe4'}` }, GLYPH[pub.suit])),
      ),
      h('div', { class: 'banner center' + (yourTurn ? ' hot' : ''), style: 'margin-top:8px' },
        yourTurn ? 'Your turn' : `${seats[pub.turn]?.name}’s turn…`),
      handStrip(priv.hand, {
        legal: yourTurn ? priv.legal : [],
        onTap: c => {
          if (!yourTurn || !priv.legal.includes(c)) return;
          if (c[0] === '8') {
            const s = sheet('Eight is wild — call the suit!',
              h('div', { class: 'row', style: 'justify-content:center' },
                SUITS.map(([k, g]) => h('button', {
                  class: 'tok big', style: `font-size:34px;color:${k === 'h' || k === 'd' ? '#ff5d73' : ''}`,
                  onclick: () => { send({ t: 'play', card: c, suit: k }); s.remove(); },
                }, g))));
          } else send({ t: 'play', card: c });
        },
      }),
      h('div', { class: 'actionbar' },
        h('button', {
          class: 'tok', disabled: !yourTurn || pub.drawn >= pub.maxDraws || !pub.deckCount,
          onclick: () => send({ t: 'draw' }),
        }, `🂠 Draw (${pub.maxDraws - pub.drawn} left)`),
        canPass && h('button', { class: 'tok ghost', onclick: () => send({ t: 'pass' }) }, 'Pass'),
      ),
    );
  },
};

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    mount(el,
      h('div', { class: 'center' },
        h('div', { class: 'row', style: 'justify-content:center;gap:26px;align-items:center' },
          h('div', {}, cardEl('back', { size: 'lg' }), h('div', { class: 'dim center', style: 'font-size:16px;margin-top:6px' }, `${pub.deckCount} left`)),
          cardEl(pub.top, { size: 'lg', button: false }),
          h('div', { style: `font-size:84px;color:${pub.suit === 'h' || pub.suit === 'd' ? '#ff5d73' : '#f2efe4'}` }, GLYPH[pub.suit]),
        ),
        pub.roundsTotal > 1 && h('div', { class: 'dim', style: 'margin-top:10px;font-size:20px' },
          `Round ${pub.round} of ${pub.roundsTotal}`),
        h('div', { class: 'tv-seats', style: 'margin-top:30px' },
          seats.map((s, i) => chipEl(s, {
            turn: pub.turn === i && pub.phase === 'play',
            extra: `· ${pub.handCounts[i]} card${pub.handCounts[i] === 1 ? '❗' : 's'}${pub.roundsTotal > 1 ? ' · ' + pub.wins[i] + 'w' : ''}`,
          }))),
      ));
  },
};
