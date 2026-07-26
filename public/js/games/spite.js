import { h, mount, handStrip, cardEl, tableEl, tv2d } from '../ui.js';

// Everything is a two-step choice: pick a card (hand / payoff / a discard
// pile top), then pick where it goes. `state.pick` holds the first step.
// The server sends the legal targets for every source in priv.legal, so the
// rules live in exactly one place.
const PILE_LABEL = ['①', '②', '③', '④'];

const sameSource = (a, b) => a && b && a.from === b.from && a.i === b.i;

function targetsFor(legal, pick) {
  if (!pick) return [];
  if (pick.from === 'payoff') return legal.payoff || [];
  if (pick.from === 'hand') return legal.hand?.[pick.i] || [];
  if (pick.from === 'discard') return legal.discard?.[pick.i] || [];
  return [];
}

// A build pile shows what it wants next, so "where can this go" is readable
// without knowing the rules.
const needLabel = need => (need > 12 ? '—' : ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'][need]);

function buildPileEl(b, { onClick, live, size = 'lg' } = {}) {
  return h('div', { class: 'pile' + (live ? ' live' : ''), onclick: onClick },
    b.top ? cardEl(b.top, { size, button: false }) : cardEl('back', { size }),
    h('div', { class: 'pile-need' }, b.count >= 12 ? 'done' : `needs ${needLabel(b.need)}`));
}

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const yourTurn = pub.turn === you && pub.phase === 'play';
    const legal = priv.legal || { hand: {}, payoff: [], discard: {} };
    if (!yourTurn && state.pick) state.pick = null;

    const pick = state.pick;
    const targets = targetsFor(legal, pick);
    const choose = src => {
      state.pick = sameSource(state.pick, src) ? null : src;
      ctx.rerender();
    };
    const playTo = to => { send({ t: 'play', from: pick.from, i: pick.i, to }); state.pick = null; };

    const myPayoff = pub.payoff[you];
    const myDiscards = pub.discards[you];
    const handIdx = Object.keys(legal.hand).map(Number);

    mount(el,
      ctx.tableShown ? null : h('div', { class: 'banner center' + (yourTurn ? ' hot' : '') },
        yourTurn
          ? (pick ? 'Now pick a build pile' : 'Your turn — play cards, then discard to end it')
          : `${seats[pub.turn]?.name || 'Someone'} is playing…`),

      // Your payoff pile: the card you're actually racing to get rid of.
      h('div', { class: 'row', style: 'gap:12px;align-items:center;margin:8px 0' },
        h('button', {
          class: 'srcbtn' + (pick?.from === 'payoff' ? ' sel' : '')
            + (yourTurn && legal.payoff?.length ? ' can' : ''),
          disabled: !yourTurn || !legal.payoff?.length,
          onclick: () => choose({ from: 'payoff', i: 0 }),
        },
          myPayoff.top ? cardEl(myPayoff.top, { size: 'sm', button: false }) : cardEl('back', { size: 'sm' }),
          h('span', { class: 'srcbtn-txt' }, h('b', {}, 'Payoff'), h('span', { class: 'dim' }, ` ${myPayoff.count} left`))),
        h('span', { class: 'numpill' }, `🂠 ${pub.stock}`)),

      // The four shared build piles — tap one once a card is picked.
      h('div', { class: 'row', style: 'gap:8px;justify-content:center' },
        pub.build.map((b, i) => buildPileEl(b, {
          size: 'sm',
          live: pick && targets.includes(i),
          onClick: () => { if (pick && targets.includes(i)) playTo(i); },
        }))),

      h('div', { class: 'divider' }),

      // Your discard piles: playable sources on your turn, and where you
      // throw to end the turn.
      h('div', { class: 'eyebrow' },
        pick?.from === 'hand' ? 'Tap a pile to discard and end your turn' : 'Your discard piles'),
      h('div', { class: 'row', style: 'gap:8px;justify-content:center' },
        myDiscards.map((d, i) => h('button', {
          class: 'pile discard' + (pick?.from === 'discard' && pick.i === i ? ' sel' : '')
            + (yourTurn && pick?.from === 'hand' ? ' live' : '')
            + (yourTurn && !pick && legal.discard?.[i]?.length ? ' can' : ''),
          disabled: !yourTurn,
          onclick: () => {
            if (pick?.from === 'hand') { send({ t: 'discard', i: pick.i, to: i }); state.pick = null; ctx.rerender(); }
            else if (legal.discard?.[i]?.length) choose({ from: 'discard', i });
          },
        },
          d.top ? cardEl(d.top, { size: 'sm', button: false }) : cardEl('back', { size: 'sm' }),
          h('div', { class: 'pile-need' }, `${PILE_LABEL[i]} ${d.count}`))),
      ),

      legal.canPass ? h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'pass' }) }, 'Nothing to play — pass'))
        : null,

      handStrip(priv.hand, {
        legalIdx: yourTurn ? (pick?.from === 'hand' ? [pick.i] : handIdx) : [],
        selIdx: pick?.from === 'hand' ? [pick.i] : [],
        onTap: (_c, i) => {
          if (!yourTurn) return;
          // Any card can be discarded, so a card with no build target is
          // still a valid pick — it just means "discard this".
          choose({ from: 'hand', i });
        },
      }),
    );
  },
};

export const tv = tv2d((el, ctx) => {
  const { pub, seats } = ctx;
  mount(el, tableEl(seats, {
    center: h('div', {},
      h('div', { class: 'row', style: 'justify-content:center;gap:14px;align-items:flex-start' },
        pub.build.map(b => buildPileEl(b, { size: 'lg' }))),
      h('div', { class: 'dim center', style: 'margin-top:10px;font-size:18px' },
        `🂠 ${pub.stock} in the stock`),
      h('div', { class: 'log center', style: 'margin-top:6px;font-size:17px' },
        (pub.log || []).map(t => h('div', {}, t)))),

    // Between each player and the middle: the card they're racing to shed.
    inner: i => h('div', { class: 'pile' },
      pub.payoff[i].top ? cardEl(pub.payoff[i].top, { size: 'lg', button: false }) : cardEl('back', { size: 'lg' }),
      h('div', { class: 'pile-need' }, `payoff ${pub.payoff[i].count}`)),

    seatEl: (s, i) => h('div', {
      class: 'banner center', style: 'min-width:200px'
        + (pub.turn === i ? ';box-shadow:0 4px 0 var(--marquee-edge),0 0 24px #ffb52e55' : ''),
    },
      h('div', {}, (s.bot ? '🤖 ' : '') + s.name, ' ',
        h('span', { class: 'numpill' }, `${pub.handCounts[i]} in hand`)),
      h('div', { class: 'row', style: 'gap:4px;justify-content:center;margin-top:6px' },
        pub.discards[i].map(d => h('div', { class: 'pile mini' },
          d.top ? cardEl(d.top, { size: 'sm', button: false }) : cardEl('back', { size: 'sm' }),
          d.count > 1 ? h('div', { class: 'pile-need' }, d.count) : null))),
    ),
  }));
}, { peekCards: (ctx, seat) => ctx.privOf(seat)?.hand });

export function padChoices({ pub, priv, seat }, stage) {
  if (pub.phase !== 'play' || pub.turn !== seat) return null;
  const legal = priv.legal || { hand: {}, payoff: [], discard: {} };

  if (legal.canPass) {
    return { title: 'Nothing to play', items: [{ label: 'Pass the turn', action: { t: 'pass' } }] };
  }

  // Step 2: a source is chosen — pick a build pile, or discard a hand card.
  if (stage.src) {
    const src = stage.src;
    const targets = targetsFor(legal, src);
    const label = src.from === 'payoff' ? 'payoff card'
      : src.from === 'discard' ? `discard pile ${PILE_LABEL[src.i]}`
        : priv.hand[src.i];
    return {
      title: `Where does the ${label} go?`,
      items: [
        ...targets.map(t => ({
          label: `Build pile ${PILE_LABEL[t]} — needs ${needLabel(pub.build[t].need)}`,
          action: { t: 'play', from: src.from, i: src.i, to: t },
        })),
        ...(src.from === 'hand'
          ? pub.discards[seat].map((d, i) => ({
            label: `Discard onto ${PILE_LABEL[i]}${d.top ? ` (on ${d.top})` : ' (empty)'} — ends turn`,
            action: { t: 'discard', i: src.i, to: i },
          }))
          : []),
        { label: '← pick another card', pick: 'back', onPick: st => { st.src = null; } },
      ],
    };
  }

  // Step 1: choose what to play.
  const items = [];
  if (legal.payoff?.length) {
    items.push({
      label: `▶ Payoff card ${pub.payoff[seat].top} (${pub.payoff[seat].count} left)`,
      pick: 'payoff', onPick: st => { st.src = { from: 'payoff', i: 0 }; },
    });
  }
  priv.hand.forEach((c, i) => {
    const can = legal.hand?.[i]?.length;
    items.push({
      label: `${can ? '▶' : '·'} ${c === 'Xj' ? 'Joker (wild)' : c}${can ? '' : ' — discard only'}`,
      pick: 'h' + i, onPick: st => { st.src = { from: 'hand', i }; },
    });
  });
  Object.keys(legal.discard || {}).forEach(k => {
    const i = Number(k);
    items.push({
      label: `▶ From discard ${PILE_LABEL[i]} (${pub.discards[seat][i].top})`,
      pick: 'd' + i, onPick: st => { st.src = { from: 'discard', i }; },
    });
  });
  return { title: 'Your turn', items };
}
