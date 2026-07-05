import { h, mount, cardEl, handStrip, chipEl } from '../ui.js';

const DIRS = { 1: 'Pass 3 cards LEFT ⬅️', 3: 'Pass 3 cards RIGHT ➡️', 2: 'Pass 3 cards ACROSS ⬆️', 0: 'No passing this round' };

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
  render(el, ctx) {
    const { pub, seats } = ctx;
    const positions = ['bottom:8%;left:50%;transform:translateX(-50%)', 'left:16%;top:50%;transform:translateY(-50%)',
      'top:6%;left:50%;transform:translateX(-50%)', 'right:16%;top:50%;transform:translateY(-50%)'];
    mount(el,
      h('div', { style: 'position:relative;width:min(66vh,700px);height:min(60vh,620px);background:#1d2138;border-radius:50%;box-shadow:inset 0 0 80px #0008, 0 8px 0 var(--edge)' },
        pub.phase === 'pass'
          ? h('div', { class: 'center', style: 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:8px' },
            h('div', { style: 'font-size:44px;font-weight:800' }, DIRS[pub.dir]),
            h('div', { class: 'dim' }, seats.map((s, i) => pub.passedFlags?.[i] ? `${s.name} ✓` : s.name).join(' · ')))
          : pub.trick.map(t => h('div', { style: `position:absolute;${positions[t.seat]}` },
            cardEl(t.card, { size: 'lg', button: false }))),
        pub.lastTrick && !pub.trick.length && pub.phase === 'play'
          ? h('div', { class: 'center dim', style: 'position:absolute;bottom:42%;width:100%;font-size:19px' },
            `${seats[pub.lastTrick.winner].name} takes the trick`)
          : null,
      ),
      h('div', { class: 'tv-seats', style: 'position:absolute;bottom:0;width:100%' },
        seats.map((s, i) => chipEl(s, {
          turn: pub.phase === 'play' && pub.turn === i,
          extra: `· ${pub.scores[i]}${pub.takenPts ? ' (+' + pub.takenPts[i] + ')' : ''}`,
        }))),
    );
  },
};
