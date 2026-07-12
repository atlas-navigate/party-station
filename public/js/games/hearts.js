import { h, mount, cardEl, handStrip, chipEl, tableEl, tv2d } from '../ui.js';

// The server hands seat i's pass to seat (i + dir) % n, i.e. dir seats to the
// LEFT; dir past the halfway point reads more naturally as seats to the right.
const dirLabel = (dir, n) =>
  dir === 0 ? 'No passing this round'
    : dir === 1 ? 'Pass 3 cards LEFT ⬅️'
      : dir === n - 1 ? 'Pass 3 cards RIGHT ➡️'
        : n % 2 === 0 && dir === n / 2 ? 'Pass 3 cards ACROSS ⬆️'
          : dir < n / 2 ? `Pass 3 cards ${dir} seats LEFT ⬅️`
            : `Pass 3 cards ${n - dir} seats RIGHT ➡️`;
const passTarget = (dir, you, seats) =>
  dir ? seats[(you + dir) % seats.length]?.name : null;
const NICE = c => (c[0] === 'T' ? '10' : c[0]) + ({ s: '♠', h: '♥', d: '♦', c: '♣' }[c[1]]);
const sweepLine = (pub, seats) =>
  `${seats[pub.sweep.winner]?.name} takes the trick${pub.sweep.pts ? ` (+${pub.sweep.pts})` : ''}`;

// One status line for "what's happening / whose turn" — shown as the body
// banner when the table view is off (the table itself carries it otherwise:
// the active seat glows, the felt center narrates passes and sweeps).
const statusOf = (pub, priv, you, seats) => {
  if (you < 0 || !priv) return null;
  if (pub.phase === 'pass') {
    if (!priv.passing) return { text: 'Cards passed ✓ — waiting for the others…' };
    const to = passTarget(pub.dir, you, seats);
    return { text: dirLabel(pub.dir, seats.length) + (to ? ` — to ${to}` : ''), hot: true };
  }
  if (pub.phase === 'roundEnd') {
    return {
      text: pub.shooter >= 0 ? `🌕 ${seats[pub.shooter]?.name} shot the moon!` : `Round ${pub.round} scores`,
      hot: true,
    };
  }
  const yourTurn = pub.turn === you && !pub.sweep;
  return {
    text: (pub.sweep ? `🏆 ${sweepLine(pub, seats)}`
      : yourTurn ? 'Your turn — play a card' : `${seats[pub.turn]?.name}’s turn…`)
      + (pub.heartsBroken && !pub.sweep ? ' 💔' : ''),
    hot: yourTurn,
  };
};

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const st = statusOf(pub, priv, you, seats);
    const stBanner = () => h('div', { class: 'banner center' + (st.hot ? ' hot' : '') }, st.text);

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill' }, `Round ${pub.round}`),
      h('span', { class: 'dim', style: 'font-size:13px' }, `You: ${pub.scores[you]} pts · to ${pub.target}`),
    ));

    if (pub.phase === 'pass' && priv.passing) {
      state.pick = state.pick || [];
      if (!ctx.tableShown) kids.push(stBanner());
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
      if (!ctx.tableShown) kids.push(stBanner());
      kids.push(handStrip(priv.hand, {}));
    } else if (pub.phase === 'roundEnd') {
      if (!ctx.tableShown) kids.push(stBanner());
      kids.push(h('div', { class: 'stack', style: 'flex:1;justify-content:center' },
        seats.map((s, i) => h('div', { class: 'spread', style: i === you ? 'font-weight:800' : '' },
          h('span', {}, s.name + (i === you ? ' (you)' : '')),
          h('span', { class: 'numpill' }, `+${pub.lastRound?.[i] ?? 0} → ${pub.scores[i]}`)))));
    } else {
      const yourTurn = pub.turn === you && !pub.sweep;
      if (!ctx.tableShown) kids.push(stBanner());
      // The mini table view already lays the trick out seat by seat — only
      // repeat it here when that view is off.
      if (pub.trick.length && !ctx.tableShown) {
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
  let center = null;
  if (pub.phase === 'pass') {
    center = h('div', {},
      h('div', { style: 'font-size:40px;font-weight:800' }, dirLabel(pub.dir, n)),
      h('div', { class: 'dim', style: 'font-size:18px;margin-top:6px' }, 'Pick 3 cards on your phone'));
  } else if (pub.phase === 'roundEnd') {
    center = h('div', {},
      h('div', { style: 'font-size:32px;font-weight:800' },
        pub.shooter >= 0 ? `🌕 ${seats[pub.shooter]?.name} shot the moon!` : `Round ${pub.round} scores`),
      seats.map((s, i) => h('div', { style: 'font-size:21px' },
        `${s.name}   +${pub.lastRound?.[i] ?? 0}   →   ${pub.scores[i]}`)),
      h('div', { class: 'dim', style: 'font-size:16px;margin-top:4px' }, 'Next deal coming up…'));
  } else if (pub.sweep) {
    center = h('div', {
      style: 'background:#10121fd9;border-radius:14px;padding:12px 22px;font-size:26px;font-weight:800;white-space:nowrap',
    }, `🏆 ${sweepLine(pub, seats)}`);
  } else if (pub.lastTrick && !pub.trick.length) {
    center = h('div', { class: 'dim', style: 'font-size:19px' },
      `${seats[pub.lastTrick.winner]?.name} takes the trick`);
  }
  mount(el, tableEl(seats, {
    center,
    // Each played card sits in front of the player who threw it.
    inner: pub.phase === 'play' ? i => {
      const t = pub.trick.find(t => t.seat === i);
      return t && h('div', {
        style: pub.sweep && i === pub.sweep.winner
          ? 'filter:drop-shadow(0 0 16px #ffb52e)' : '',
      }, cardEl(t.card, { size: 'lg', button: false }));
    } : null,
    seatEl: (s, i) => chipEl(s, {
      turn: pub.phase === 'play' && !pub.sweep && pub.turn === i,
      extra: `· ${pub.scores[i]}${pub.takenPts ? ' (+' + pub.takenPts[i] + ')' : ''}`
        + (pub.phase === 'pass' ? (pub.passedFlags?.[i] ? ' ✓' : ' …') : ''),
    }),
  }));
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hand });

export function padChoices({ pub, priv, seats, seat }, stage) {
  if (pub.phase === 'pass' && priv.passing) {
    stage.picks = stage.picks || [];
    const to = passTarget(pub.dir, seat, seats);
    return {
      title: dirLabel(pub.dir, seats.length) + (to ? ` — to ${to}` : ''), sticky: true,
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
