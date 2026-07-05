import { h, mount } from '../ui.js';

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const myTeam = priv.team;
    const onOffense = pub.offense === myTeam;

    kids.push(h('div', { class: 'spread', style: 'margin-bottom:10px' },
      h('span', { class: 'numpill', style: 'font-size:17px' }, `Q${pub.quarter} · ${pub.playsLeft} plays left`),
      h('span', { class: 'numpill', style: 'font-size:17px' }, `${pub.score[0]} — ${pub.score[1]}`)));

    kids.push(h('div', { class: 'banner center', style: 'margin-bottom:10px;font-size:14px' },
      onOffense ? `🏈 Your team has the ball — ${down(pub)}` : `🛡️ Defense — stop them! ${down(pub)}`));

    if (priv.callingOffense) {
      kids.push(h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Call the play'));
      kids.push(h('div', { class: 'game-grid' },
        pub.offPlays.map(p =>
          h('button', { class: 'game-tile cat-arcade', style: 'min-height:84px', onclick: () => send({ t: 'call', play: p.id }) },
            h('span', { class: 'g-icon', style: 'font-size:26px' }, p.icon),
            h('span', { class: 'g-name', style: 'font-size:14px' }, p.name)))));
      if (priv.canPunt || priv.canFG) {
        kids.push(h('div', { class: 'row', style: 'margin-top:10px' },
          priv.canPunt && h('button', { class: 'tok grow', onclick: () => send({ t: 'call', play: 'punt' }) }, '🦵 Punt'),
          priv.canFG && h('button', { class: 'tok primary grow', onclick: () => send({ t: 'call', play: 'fg' }) }, '🥅 Field goal')));
      }
    } else if (priv.callingDefense) {
      kids.push(h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Call the defense'));
      kids.push(h('div', { class: 'game-grid' },
        pub.defPlays.map(p =>
          h('button', { class: 'game-tile cat-board', style: 'min-height:84px', onclick: () => send({ t: 'call', play: p.id }) },
            h('span', { class: 'g-icon', style: 'font-size:26px' }, p.icon),
            h('span', { class: 'g-name', style: 'font-size:14px' }, p.name)))));
    } else {
      const caller = pub.step === 'offense' ? pub.offCaller : pub.defCaller;
      kids.push(h('div', { class: 'banner center' },
        pub.step === 'offense' && pub.offPicked === false
          ? `${seats[caller]?.name} is calling the play…`
          : `${seats[caller]?.name} is picking…`));
      if (pub.lastPlay) kids.push(lastPlayBanner(pub));
    }
    mount(el, ...kids);
  },
};

function down(pub) {
  const names = ['1st', '2nd', '3rd', '4th'];
  return `${names[pub.down - 1]} & ${pub.toGo}`;
}

function lastPlayBanner(pub) {
  const lp = pub.lastPlay;
  const text = lp.special
    ? `${lp.special}${lp.yards ? ` (${lp.yards} yds)` : ''}`
    : `${lp.offName} vs ${lp.defName}: ${lp.yards >= 0 ? '+' : ''}${lp.yards} yds${lp.event ? ' — ' + lp.event : ''}`;
  return h('div', { class: 'banner' + (lp.event ? ' hot' : ''), style: 'margin-top:10px;text-align:center;font-size:14px' }, text);
}

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    const ballPct = pub.ball;
    const t1 = pub.teams.filter(t => t.team === 0).map(t => t.name).join(' & ');
    const t2 = pub.teams.filter(t => t.team === 1).map(t => t.name).join(' & ');
    mount(el,
      h('div', { style: 'width:100%;max-width:1150px' },
        h('div', { class: 'spread', style: 'margin-bottom:18px' },
          h('div', { class: 'banner', style: pub.offense === 0 ? 'box-shadow:0 4px 0 var(--marquee-edge)' : '' },
            `🟨 ${t1}`, h('span', { class: 'numpill', style: 'margin-left:10px;font-size:26px' }, pub.score[0])),
          h('div', { class: 'center' },
            h('div', { style: 'font-size:26px;font-weight:800' }, `Q${pub.quarter}`),
            h('div', { class: 'dim' }, `${pub.playsLeft} plays left · ${down(pub)}`)),
          h('div', { class: 'banner', style: pub.offense === 1 ? 'box-shadow:0 4px 0 var(--marquee-edge)' : '' },
            `🟪 ${t2}`, h('span', { class: 'numpill', style: 'margin-left:10px;font-size:26px' }, pub.score[1]))),
        // field
        h('div', { style: 'position:relative;height:150px;background:linear-gradient(90deg,#1e6b38,#2b8c4b 10%,#2b8c4b 90%,#1e6b38);border-radius:14px;box-shadow:0 6px 0 var(--edge);overflow:hidden' },
          [10, 20, 30, 40, 50, 60, 70, 80, 90].map(y =>
            h('div', { style: `position:absolute;left:${y}%;top:0;bottom:0;width:2px;background:#ffffff44` })),
          [10, 20, 30, 40, 50, 60, 70, 80, 90].map(y =>
            h('div', { style: `position:absolute;left:${y}%;top:6px;transform:translateX(-50%);font-size:13px;color:#fff9;font-weight:800` },
              y <= 50 ? y : 100 - y)),
          h('div', { style: 'position:absolute;left:0;top:0;bottom:0;width:5%;background:#ffb52e55' }),
          h('div', { style: 'position:absolute;right:0;top:0;bottom:0;width:5%;background:#b78bff55' }),
          h('div', {
            style: `position:absolute;left:${pub.offense === 0 ? ballPct : 100 - ballPct}%;top:50%;transform:translate(-50%,-50%);
              font-size:44px;transition:left .8s ease;filter:drop-shadow(0 3px 4px #000a)`,
          }, '🏈'),
        ),
        pub.lastPlay && h('div', { class: 'center', style: 'margin-top:18px' },
          h('div', {
            style: `display:inline-block;font-size:30px;font-weight:800;padding:10px 26px;border-radius:14px;
            background:${pub.lastPlay.event || pub.lastPlay.special ? 'var(--marquee)' : 'var(--raised)'};
            color:${pub.lastPlay.event || pub.lastPlay.special ? '#241a02' : 'var(--chalk)'};box-shadow:0 5px 0 var(--edge)`,
          },
            pub.lastPlay.special
              ? pub.lastPlay.special
              : `${pub.lastPlay.offName}: ${pub.lastPlay.yards >= 0 ? '+' : ''}${pub.lastPlay.yards}${pub.lastPlay.event ? ' — ' + pub.lastPlay.event : ''}`)),
        h('div', { class: 'center dim', style: 'margin-top:14px;font-size:20px' },
          pub.step === 'offense'
            ? `${seats[pub.offCaller]?.name} is calling the play… 🤔`
            : `${seats[pub.defCaller]?.name} is setting the defense… 🛡️`),
        h('div', { class: 'log center', style: 'margin-top:12px;font-size:16px' },
          pub.log.slice(-3).map(l => h('div', {}, l))),
      ));
  },
};
