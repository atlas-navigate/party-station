import { h, mount, cardEl, handStrip } from '../ui.js';
import { cardTable } from '../three-app/cardtable.js';
import { makeCard } from '../three-app/assets.js';

const DIRS = { 1: 'Pass 3 cards LEFT ⬅️', 3: 'Pass 3 cards RIGHT ➡️', 2: 'Pass 3 cards ACROSS ⬆️', 0: 'No passing this round' };
const NICE = c => (c[0] === 'T' ? '10' : c[0]) + ({ s: '♠', h: '♥', d: '♦', c: '♣' }[c[1]]);

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill' }, `Round ${pub.round}`),
      h('span', { class: 'dim', style: 'font-size:13px' }, `You: ${pub.scores[you]} pts · to ${pub.target}`),
    ));

    if (pub.phase === 'pass' && priv.passing) {
      state.pick = state.pick || [];
      kids.push(h('div', { class: 'banner hot center' }, DIRS[pub.dir]));
      kids.push(handStrip(priv.hand, {
        selected: state.pick,
        onTap: c => {
          if (state.pick.includes(c)) state.pick = state.pick.filter(x => x !== c);
          else if (state.pick.length < 3) state.pick.push(c);
          ctx.rerender();
        },
      }));
      kids.push(h('div', { class: 'actionbar' },
        h('button', {
          class: 'tok primary big', disabled: state.pick.length !== 3,
          onclick: () => { send({ t: 'pass', cards: state.pick }); state.pick = []; },
        }, `Pass ${state.pick.length}/3`)));
    } else if (pub.phase === 'pass') {
      kids.push(h('div', { class: 'banner center' }, 'Cards passed ✓ — waiting for the others…'));
      kids.push(handStrip(priv.hand, {}));
    } else {
      const yourTurn = pub.turn === you;
      kids.push(h('div', { class: 'banner center' + (yourTurn ? ' hot' : '') },
        yourTurn ? 'Your turn — play a card' : `${seats[pub.turn]?.name}’s turn…`,
        pub.heartsBroken ? ' 💔' : ''));
      if (pub.trick.length) {
        kids.push(h('div', { class: 'row', style: 'justify-content:center;margin-top:10px' },
          pub.trick.map(t => cardEl(t.card, { size: 'sm', button: false }))));
      }
      kids.push(handStrip(priv.hand, {
        legal: yourTurn ? priv.legal : [],
        onTap: c => { if (yourTurn && priv.legal.includes(c)) send({ t: 'play', card: c }); },
      }));
    }
    mount(el, ...kids);
  },
};

export const tv = {
  mount(holder, ctx) {
    return cardTable(holder, ctx, {
      turnSeat: c => c.pub.phase === 'play' ? c.pub.turn : -1,
      seatCards: (c, i) => ({ count: c.pub.handCounts[i] }),
      peekCards: (c, i) => c.privOf(i)?.hand || [],
      seatSub: (c, i) => `${c.pub.scores[i]} pts${c.pub.takenPts?.[i] ? ` (+${c.pub.takenPts[i]})` : ''}`,
      centerKey: c => JSON.stringify([c.pub.phase, c.pub.trick, c.pub.lastTrick, c.pub.round, c.pub.passedFlags]),
      center(c, C) {
        const pub = c.pub;
        C.label(`Round ${pub.round} · to ${pub.target}${pub.heartsBroken ? ' · 💔 broken' : ''}`,
          { y: 2.6, size: 24 });
        if (pub.phase === 'pass') {
          C.label(DIRS[pub.dir], { y: 1.6, size: 34, bg: '#ffb52e', });
          C.label(c.seats.map((s, i) => pub.passedFlags?.[i] ? `${s.name} ✓` : s.name).join('   '),
            { y: 0.9, size: 20 });
          return;
        }
        // Trick cards slide toward whoever played them.
        for (const t of pub.trick) {
          const m = makeCard(t.card);
          const p = C.seatPos(t.seat, 1.7);
          m.position.set(p.x, 0.05 + pub.trick.indexOf(t) * 0.012, p.z);
          m.rotation.z = (t.seat / c.seats.length) * Math.PI * 2;
          C.group.add(m);
        }
        if (!pub.trick.length && pub.lastTrick) {
          C.label(`${c.seats[pub.lastTrick.winner].name} takes the trick`, { y: 0.7, size: 22 });
        }
      },
    });
  },
};

export function padChoices({ pub, priv, seat }, stage) {
  if (pub.phase === 'pass' && priv.passing) {
    stage.picks = stage.picks || [];
    return {
      title: DIRS[pub.dir], sticky: true,
      items: [
        ...priv.hand.map(c => ({
          label: NICE(c), pick: c, on: stage.picks.includes(c),
          onPick: st => {
            if (st.picks.includes(c)) st.picks = st.picks.filter(x => x !== c);
            else if (st.picks.length < 3) st.picks.push(c);
          },
        })),
        { label: `Pass ${stage.picks.length}/3 ✓`, disabled: stage.picks.length !== 3,
          action: { t: 'pass', cards: stage.picks } },
      ],
    };
  }
  if (pub.phase === 'play' && pub.turn === seat) {
    return { title: 'Play a card', items: priv.legal.map(c => ({ label: NICE(c), action: { t: 'play', card: c } })) };
  }
  return null;
}
