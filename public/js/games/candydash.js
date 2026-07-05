import { h, mount } from '../ui.js';

const TOKENS = ['🍓', '🍊', '🍋', '🍏', '🫐', '🍇'];
const COLOR_HEX = {
  red: '#ef5350', orange: '#ff9445', yellow: '#f7d34c',
  green: '#5fd68a', blue: '#5fa8f5', purple: '#b98af7',
};

function cardFace(card) {
  if (!card) return null;
  if (card.stuckSkip) return h('div', { class: 'banner center', style: 'font-size:20px' }, '🍯 Stuck! Turn skipped.');
  if (card.treat != null) {
    return h('div', { class: 'banner hot center', style: 'font-size:20px' }, `${card.icon} ${card.name}!`);
  }
  return h('div', { class: 'row', style: 'justify-content:center;gap:8px' },
    h('div', { style: `width:64px;height:88px;border-radius:10px;background:${COLOR_HEX[card.color]};box-shadow:0 4px 0 #0007` }),
    card.double && h('div', { style: `width:64px;height:88px;border-radius:10px;background:${COLOR_HEX[card.color]};box-shadow:0 4px 0 #0007` }));
}

export const player = {
  render(el, ctx) {
    const { pub, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const myTurn = pub.turn === you && pub.phase === 'play';
    mount(el,
      h('div', { class: 'center', style: 'margin:6px 0 12px;font-size:15px' },
        `${TOKENS[you % 6]} You’re on space ${pub.pos[you] + 1} of ${pub.spaces.length}`),
      h('div', { class: 'banner center' + (myTurn ? ' hot' : '') },
        myTurn ? (pub.stuck[you] ? '🍯 You’re stuck — draw to wiggle free!' : 'Your turn!') : `${seats[pub.turn]?.name}’s turn…`),
      h('div', { style: 'margin:16px 0;min-height:100px;display:flex;justify-content:center' }, cardFace(pub.lastCard)),
      h('div', { class: 'actionbar' },
        h('button', { class: 'tok primary big', disabled: !myTurn, onclick: () => send({ t: 'draw' }) }, '🍬 Draw a card')),
    );
  },
};

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    const perRow = 9;
    const tiles = pub.spaces.map((sp, i) => {
      const row = Math.floor(i / perRow);
      const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
      const here = pub.pos.map((p, s) => p === i ? s : null).filter(v => v != null);
      return h('div', {
        style: `grid-row:${row + 1};grid-column:${col + 1};height:58px;border-radius:12px;
          background:${COLOR_HEX[sp.color]};position:relative;box-shadow:0 3px 0 #0006;
          display:flex;align-items:center;justify-content:center;font-size:20px`,
      },
        sp.sticky ? '🍯' : sp.bridgeTo ? '🌉' : sp.treat ? '🍭' : '',
        here.length > 0 && h('div', { style: 'position:absolute;top:-14px;font-size:22px;filter:drop-shadow(0 2px 2px #000a)' },
          here.map(s => TOKENS[s % 6]).join('')));
    });
    mount(el,
      h('div', { style: 'width:100%;max-width:1150px' },
        h('div', { class: 'row', style: 'gap:26px;align-items:center' },
          h('div', { style: `display:grid;grid-template-columns:repeat(${perRow},1fr);gap:8px;flex:1` },
            tiles,
            h('div', {
              style: `grid-row:${Math.ceil(pub.spaces.length / perRow)};grid-column:${perRow};transform:translateX(110%);
              font-size:44px;display:flex;align-items:center`,
            }, '🏰')),
          h('div', { class: 'stack', style: 'min-width:220px' },
            h('div', { style: 'min-height:120px;display:flex;justify-content:center;align-items:center' }, cardFace(pub.lastCard)),
            seats.map((s, i) => h('div', {
              class: 'banner',
              style: pub.turn === i && pub.phase === 'play' ? 'box-shadow:0 4px 0 var(--marquee-edge),0 0 20px #ffb52e55' : '',
            },
              h('div', { class: 'spread' },
                h('span', {}, `${TOKENS[i % 6]} ${s.bot ? '🤖 ' : ''}${s.name}${pub.stuck[i] ? ' 🍯' : ''}`),
                h('span', { class: 'numpill' }, `${pub.pos[i] + 1}/${pub.spaces.length}`)))),
          )),
      ));
  },
};
