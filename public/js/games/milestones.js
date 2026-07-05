import { h, mount } from '../ui.js';

const TOKENS = ['🚗', '🚙', '🚕', '🛻', '🚐', '🏎️'];
const TILE_BG = {
  start: '#3ecf8e', payday: '#ffb52e', life: '#b78bff', event: '#2d3253',
  marriage: '#ff5d73', kids: '#7fc8f8', house: '#f472b6', retire: '#ffb52e',
};
const TILE_ICON = {
  start: '🏁', payday: '💰', life: '💜', event: '❗', marriage: '💒',
  kids: '👶', house: '🏠', retire: '🌅',
};

export const player = {
  render(el, ctx) {
    const { pub, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTurn = pub.turn === you && pub.phase === 'play';

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:8px' },
      h('span', { class: 'numpill', style: 'font-size:18px' }, `${TOKENS[you % 6]} 💵 ${pub.cash[you]}k`),
      h('span', { class: 'dim', style: 'font-size:13px' },
        `💜×${pub.tokens[you]} · 👶×${pub.kids[you]}${pub.career[you] ? ' · ' + pub.career[you].name : ''}`)));

    if (pub.retired[you]) {
      kids.push(h('div', { class: 'banner center' }, `🌅 Retired with ${pub.final[you]}k! Watch the others finish.`));
    } else if (!myTurn) {
      kids.push(h('div', { class: 'banner center' }, `${seats[pub.turn]?.name}’s turn…`));
    } else if (pub.step === 'path') {
      kids.push(h('div', { class: 'banner hot center' }, 'Big decision: how does your story start?'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        h('button', { class: 'tok big', onclick: () => send({ t: 'path', college: true }) },
          '🎓 College — better careers, 50k loan'),
        h('button', { class: 'tok big', onclick: () => send({ t: 'path', college: false }) },
          '💼 Straight to work — debt-free')));
    } else if (pub.step === 'career' && pub.pendingCareers) {
      kids.push(h('div', { class: 'banner hot center' }, 'Pick your career'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        pub.pendingCareers.map((c, i) =>
          h('button', { class: 'tok big', onclick: () => send({ t: 'career', i }) },
            `${c.name} — ${c.salary}k salary`))));
    } else if (pub.step === 'house' && pub.pendingHouses) {
      kids.push(h('div', { class: 'banner hot center' }, '🏠 House hunting!'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        pub.pendingHouses.map((hs, i) =>
          h('button', { class: 'tok big', disabled: hs.cost > pub.cash[you], onclick: () => send({ t: 'house', i }) },
            `${hs.name} — ${hs.cost}k (sells ${hs.sale}k)`)),
        h('button', { class: 'tok ghost', onclick: () => send({ t: 'house', i: -1 }) }, 'Keep renting')));
    } else if (pub.step === 'spin') {
      kids.push(h('div', { class: 'banner hot center' }, 'Your turn!'));
      kids.push(h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', onclick: () => send({ t: 'spin' }) }, '🛞 Spin')));
    }
    mount(el, ...kids);
  },
};

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    const perRow = 10;
    const tiles = pub.track.map((t, i) => {
      const row = Math.floor(i / perRow);
      const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
      const here = pub.pos.map((p, s) => p === i && !pub.retired[s] ? s : null).filter(v => v != null);
      return h('div', {
        style: `grid-row:${row + 1};grid-column:${col + 1};height:64px;border-radius:10px;
          background:${TILE_BG[t.type] || '#2d3253'};${t.type === 'event' ? '' : 'color:#14100a;'}
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          font-size:19px;position:relative;box-shadow:0 3px 0 #0007`,
        title: t.text,
      },
        TILE_ICON[t.type] || '',
        here.length > 0 && h('div', { style: 'position:absolute;top:-12px;font-size:20px' },
          here.map(s => TOKENS[s % 6]).join('')));
    });
    mount(el,
      h('div', { style: 'display:flex;gap:26px;width:100%;justify-content:center;align-items:center' },
        h('div', {},
          h('div', { style: `display:grid;grid-template-columns:repeat(${perRow},1fr);gap:6px;width:min(62vw,900px)` }, tiles),
          h('div', { class: 'row', style: 'margin-top:16px;justify-content:space-between' },
            pub.lastSpin && h('div', { class: 'banner' }, `🛞 ${seats[pub.lastSpin.seat].name} spun ${pub.lastSpin.value}`),
            h('div', { class: 'log', style: 'font-size:14px;text-align:right' }, pub.log.slice(-3).map(l => h('div', {}, l)))),
        ),
        h('div', { class: 'stack', style: 'min-width:250px' },
          seats.map((s, i) => h('div', {
            class: 'banner',
            style: (pub.turn === i && !pub.retired[i] ? 'box-shadow:0 4px 0 var(--marquee-edge),0 0 20px #ffb52e55;' : ''),
          },
            h('div', { class: 'spread' },
              h('span', {}, `${TOKENS[i % 6]} ${s.bot ? '🤖 ' : ''}${s.name}`),
              h('span', { class: 'numpill' }, pub.retired[i] ? `🌅 ${pub.final[i]}k` : `💵${pub.cash[i]}k`)),
            h('div', { class: 'dim', style: 'font-size:13px;margin-top:3px' },
              `${pub.career[i] ? pub.career[i].name + ' · ' : ''}💜×${pub.tokens[i]} 👶×${pub.kids[i]}${pub.married[i] ? ' 💍' : ''}${pub.house[i] ? ' 🏠' : ''}`),
          ))),
      ));
  },
};
