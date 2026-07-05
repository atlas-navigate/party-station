import { h, mount, cardEl, handStrip, sheet } from '../ui.js';
import { cardTable } from '../three-app/cardtable.js';
import { makeCard, makeLabel } from '../three-app/assets.js';

const SUITS = [['s', '♠'], ['h', '♥'], ['d', '♦'], ['c', '♣']];
const GLYPH = Object.fromEntries(SUITS);
const NICE = c => (c[0] === 'T' ? '10' : c[0]) + GLYPH[c[1]];

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
  mount(holder, ctx) {
    return cardTable(holder, ctx, {
      turnSeat: c => c.pub.phase === 'play' ? c.pub.turn : -1,
      seatCards: (c, i) => ({ count: c.pub.handCounts[i] }),
      peekCards: (c, i) => c.privOf(i)?.hand || [],
      seatSub: (c, i) => `${c.pub.handCounts[i]} card${c.pub.handCounts[i] === 1 ? '❗' : 's'}`
        + (c.pub.roundsTotal > 1 ? ` · ${c.pub.wins[i]}w` : ''),
      centerKey: c => JSON.stringify([c.pub.top, c.pub.suit, c.pub.deckCount, c.pub.turn]),
      center(c, C) {
        const pub = c.pub;
        // Draw pile.
        for (let k = 0; k < Math.min(3, Math.max(1, Math.ceil(pub.deckCount / 15))); k++) {
          const b = makeCard('back');
          b.position.set(-1.1, 0.03 + k * 0.02, 0);
          b.rotation.y = Math.PI;
          C.group.add(b);
        }
        C.label(`${pub.deckCount}`, { x: -1.1, y: 0.75, size: 22 });
        // Top of the discard, slightly askew like a real pile.
        const top = makeCard(pub.top);
        top.position.set(0.35, 0.06, 0);
        top.rotation.z = 0.12;
        C.group.add(top);
        const red = pub.suit === 'h' || pub.suit === 'd';
        const suitLbl = makeLabel(GLYPH[pub.suit], { size: 64, color: red ? '#ff5d73' : '#f2efe4', bg: '#10121fcc' });
        suitLbl.position.set(1.8, 0.9, 0);
        C.group.add(suitLbl);
        if (pub.roundsTotal > 1) C.label(`Round ${pub.round}/${pub.roundsTotal}`, { y: 2.4, size: 22 });
      },
    });
  },
};

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
