import { h, mount, cardEl, handStrip, chipEl, sheet, tableEl, tv2d } from '../ui.js';

const SUITS = [['s', '♠'], ['h', '♥'], ['d', '♦'], ['c', '♣']];
const GLYPH = Object.fromEntries(SUITS);
const NICE = c => (c[0] === 'T' ? '10' : c[0]) + GLYPH[c[1]];

const statusOf = (pub, you, seats) => you < 0 ? null
  : pub.turn === you && pub.phase === 'play'
    ? { text: 'Your turn', hot: true }
    : { text: `${seats[pub.turn]?.name}’s turn…` };

export const player = {
  status: ctx => statusOf(ctx.pub, ctx.you, ctx.seats),
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const yourTurn = pub.turn === you && pub.phase === 'play';
    const canPass = yourTurn && !priv.legal.length && (pub.drawn >= pub.maxDraws || !pub.deckCount);
    const st = statusOf(pub, you, seats);

    mount(el,
      // flex:1 floats the discard/suit mid-screen; turn banner sits by your
      // hand. The mini table view shows the same discard + suit on the felt,
      // so while it's up this block yields to a plain spacer.
      ctx.tableShown
        ? h('div', { style: 'flex:1' })
        : h('div', { class: 'row', style: 'justify-content:center;gap:14px;margin:6px 0 4px;flex:1' },
          cardEl(pub.top, { button: false }),
          h('div', {},
            h('div', { class: 'eyebrow' }, 'Suit'),
            h('div', { style: `font-size:34px;color:${pub.suit === 'h' || pub.suit === 'd' ? '#ff5d73' : '#f2efe4'}` }, GLYPH[pub.suit])),
        ),
      ctx.tableShown ? null : h('div', {
        class: 'banner center' + (st.hot ? ' hot' : ''), style: 'margin-top:8px',
      }, st.text),
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

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  mount(el, tableEl(seats, {
    center: h('div', {},
      h('div', { class: 'row', style: 'justify-content:center;gap:26px;align-items:center' },
        h('div', {}, cardEl('back', { size: 'lg' }), h('div', { class: 'dim center', style: 'font-size:16px;margin-top:6px' }, `${pub.deckCount} left`)),
        cardEl(pub.top, { size: 'lg', button: false }),
        h('div', { style: `font-size:84px;color:${pub.suit === 'h' || pub.suit === 'd' ? '#ff5d73' : '#f2efe4'}` }, GLYPH[pub.suit]),
      ),
      pub.roundsTotal > 1 && h('div', { class: 'dim', style: 'margin-top:10px;font-size:20px' },
        `Round ${pub.round} of ${pub.roundsTotal}`),
    ),
    seatEl: (s, i) => chipEl(s, {
      turn: pub.turn === i && pub.phase === 'play',
      extra: `· ${pub.handCounts[i]} card${pub.handCounts[i] === 1 ? '❗' : 's'}${pub.roundsTotal > 1 ? ' · ' + pub.wins[i] + 'w' : ''}`,
    }),
  }));
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hand });

export function padChoices({ pub, priv, seat }, stage) {
  if (pub.phase !== 'play' || pub.turn !== seat) return null;
  if (stage.eight) {
    return {
      title: 'Call the suit',
      items: SUITS.map(([k, g]) => ({ label: g, action: { t: 'play', card: stage.eight, suit: k } })),
    };
  }
  const items = priv.legal.map(c => c[0] === '8'
    ? { label: NICE(c) + ' (wild)', pick: c, onPick: st => { st.eight = c; } }
    : { label: NICE(c), action: { t: 'play', card: c } });
  const canDraw = pub.drawn < pub.maxDraws && pub.deckCount > 0;
  items.push({ label: `🂠 Draw (${pub.maxDraws - pub.drawn} left)`, action: { t: 'draw' }, disabled: !canDraw });
  if (!priv.legal.length && !canDraw) items.push({ label: 'Pass', action: { t: 'pass' } });
  return { title: 'Your turn', items };
}
