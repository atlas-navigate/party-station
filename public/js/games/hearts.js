import { h, mount, cardEl, handStrip, chipEl, tv2d } from '../ui.js';

const dirLabel = (dir, n) =>
  dir === 0 ? 'No passing this round'
    : dir === 1 ? 'Pass 3 cards LEFT ⬅️'
      : dir === n - 1 ? 'Pass 3 cards RIGHT ➡️'
        : n === 4 && dir === 2 ? 'Pass 3 cards ACROSS ⬆️'
          : `Pass 3 cards ${dir} seats LEFT ⬅️`;
const NICE = c => (c[0] === 'T' ? '10' : c[0]) + ({ s: '♠', h: '♥', d: '♦', c: '♣' }[c[1]]);
const sweepLine = (pub, seats) =>
  `${seats[pub.sweep.winner]?.name} takes the trick${pub.sweep.pts ? ` (+${pub.sweep.pts})` : ''}`;

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
      kids.push(h('div', { class: 'banner hot center' }, dirLabel(pub.dir, seats.length)));
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
    } else if (pub.phase === 'roundEnd') {
      kids.push(h('div', { class: 'banner hot center' },
        pub.shooter >= 0 ? `🌕 ${seats[pub.shooter]?.name} shot the moon!` : `Round ${pub.round} scores`));
      kids.push(h('div', { class: 'stack', style: 'flex:1;justify-content:center' },
        seats.map((s, i) => h('div', { class: 'spread', style: i === you ? 'font-weight:800' : '' },
          h('span', {}, s.name + (i === you ? ' (you)' : '')),
          h('span', { class: 'numpill' }, `+${pub.lastRound?.[i] ?? 0} → ${pub.scores[i]}`)))));
    } else {
      const yourTurn = pub.turn === you && !pub.sweep;
      kids.push(h('div', { class: 'banner center' + (yourTurn ? ' hot' : '') },
        pub.sweep ? `🏆 ${sweepLine(pub, seats)}`
          : yourTurn ? 'Your turn — play a card' : `${seats[pub.turn]?.name}’s turn…`,
        pub.heartsBroken && !pub.sweep ? ' 💔' : ''));
      if (pub.trick.length) {
        // flex:1 floats the trick mid-screen, between the banner and your hand
        kids.push(h('div', { class: 'row', style: 'justify-content:center;align-items:center;flex:1;margin-top:10px' },
          pub.trick.map(t => h('div', {
            style: pub.sweep && t.seat === pub.sweep.winner
              ? 'filter:drop-shadow(0 0 10px #ffb52e);transform:translateY(-6px)' : '',
          }, cardEl(t.card, { size: 'sm', button: false })))));
      }
      kids.push(handStrip(priv.hand, {
        legal: yourTurn ? priv.legal : [],
        onTap: c => { if (yourTurn && priv.legal.includes(c)) send({ t: 'play', card: c }); },
      }));
    }
    mount(el, ...kids);
  },
};

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  const n = seats.length;
  // Seats spaced evenly around the table, seat 0 at the bottom.
  const pos = i => {
    const th = (i / n) * 2 * Math.PI;
    return `left:${(50 + 40 * Math.sin(th)).toFixed(1)}%;top:${(50 + 38 * Math.cos(th)).toFixed(1)}%;`
      + 'transform:translate(-50%,-50%)';
  };
  let center = null;
  if (pub.phase === 'pass') {
    center = h('div', { class: 'center', style: 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:8px' },
      h('div', { style: 'font-size:44px;font-weight:800' }, dirLabel(pub.dir, n)),
      h('div', { class: 'dim' }, seats.map((s, i) => pub.passedFlags?.[i] ? `${s.name} ✓` : s.name).join(' · ')));
  } else if (pub.phase === 'roundEnd') {
    center = h('div', { class: 'center', style: 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:8px' },
      h('div', { style: 'font-size:38px;font-weight:800' },
        pub.shooter >= 0 ? `🌕 ${seats[pub.shooter]?.name} shot the moon!` : `Round ${pub.round} scores`),
      seats.map((s, i) => h('div', { style: 'font-size:22px' },
        `${s.name}   +${pub.lastRound?.[i] ?? 0}   →   ${pub.scores[i]}`)),
      h('div', { class: 'dim', style: 'font-size:17px;margin-top:6px' }, 'Next deal coming up…'));
  } else if (pub.sweep) {
    center = h('div', {
      style: 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
        + 'background:#10121fd9;border-radius:14px;padding:12px 22px;font-size:26px;font-weight:800;white-space:nowrap',
    }, `🏆 ${sweepLine(pub, seats)}`);
  } else if (pub.lastTrick && !pub.trick.length) {
    center = h('div', { class: 'center dim', style: 'position:absolute;bottom:42%;width:100%;font-size:19px' },
      `${seats[pub.lastTrick.winner]?.name} takes the trick`);
  }
  mount(el,
    h('div', { style: 'position:relative;width:min(66vh,700px);height:min(60vh,620px);background:#1d2138;border-radius:50%;box-shadow:inset 0 0 80px #0008, 0 8px 0 var(--edge)' },
      pub.phase === 'play'
        ? pub.trick.map(t => h('div', {
          style: `position:absolute;${pos(t.seat)}`
            + (pub.sweep && t.seat === pub.sweep.winner
              ? ';filter:drop-shadow(0 0 16px #ffb52e);z-index:2' : ''),
        }, cardEl(t.card, { size: 'lg', button: false })))
        : null,
      center,
    ),
    h('div', { class: 'tv-seats', style: 'position:absolute;bottom:0;width:100%' },
      seats.map((s, i) => chipEl(s, {
        turn: pub.phase === 'play' && !pub.sweep && pub.turn === i,
        extra: `· ${pub.scores[i]}${pub.takenPts ? ' (+' + pub.takenPts[i] + ')' : ''}`,
      }))),
  );
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hand });

export function padChoices({ pub, priv, seats, seat }, stage) {
  if (pub.phase === 'pass' && priv.passing) {
    stage.picks = stage.picks || [];
    return {
      title: dirLabel(pub.dir, seats.length), sticky: true,
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
  if (pub.phase === 'play' && !pub.sweep && pub.turn === seat) {
    return { title: 'Play a card', items: priv.legal.map(c => ({ label: NICE(c), action: { t: 'play', card: c } })) };
  }
  return null;
}
