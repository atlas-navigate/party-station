import { h, mount } from '../ui.js';

export const player = {
  render(el, ctx) {
    const { pub, priv, you, seats, send, state } = ctx;
    if (you < 0) { mount(el, h('p', { class: 'dim center' }, 'Watch the big screen!')); return; }
    const kids = [];
    const alive = pub.alive[you];

    // Your secret role card.
    kids.push(h('div', {
      class: 'banner center',
      style: priv.isImpostor ? 'background:var(--danger);color:#2b070e' : '',
    },
      priv.isImpostor
        ? [h('div', { style: 'font-weight:800;font-size:18px' }, '🕵️ You are INCOGNITO'),
           h('div', { style: 'font-size:14px;margin-top:4px' }, `You don't know the word. Category: ${pub.category}. Blend in!`)]
        : [h('div', { class: 'eyebrow', style: 'color:inherit' }, 'The secret word'),
           h('div', { style: 'font-weight:800;font-size:26px' }, priv.word)],
    ));

    if (!alive) {
      kids.push(h('div', { class: 'banner center', style: 'margin-top:10px' }, 'You were ejected 👻 — enjoy the show.'));
      mount(el, ...kids); return;
    }

    if (pub.step === 'clue') {
      if (priv.yourClue) {
        kids.push(h('div', { class: 'banner center', style: 'margin-top:10px' }, `Your clue: “${priv.yourClue}” ✓`));
      } else {
        if (ctx.typing()) return; // don't clobber the input mid-word
        const input = h('input', {
          class: 'field', maxlength: 20, placeholder: 'One-word clue…', autocomplete: 'off',
          style: 'margin-top:12px', value: state.draft || '',
          oninput: e => { state.draft = e.target.value; },
        });
        kids.push(input);
        kids.push(h('div', { class: 'actionbar' },
          h('button', {
            class: 'tok primary big',
            onclick: () => { send({ t: 'clue', word: input.value.trim().split(/\s+/)[0] || '' }); state.draft = ''; },
          }, 'Submit clue')));
      }
    } else if (pub.step === 'vote') {
      if (priv.yourVote != null) {
        kids.push(h('div', { class: 'banner center', style: 'margin-top:10px' }, `Voted for ${seats[priv.yourVote].name} ✓`));
      } else {
        kids.push(h('div', { class: 'eyebrow', style: 'margin:14px 0 8px' }, 'Who is incognito?'));
        kids.push(h('div', { class: 'stack' },
          seats.map((s, i) => pub.alive[i] && i !== you
            ? h('button', { class: 'tok big', onclick: () => send({ t: 'vote', seat: i }) },
              `${s.name} — “${pub.clues[i] || '…'}”`)
            : null)));
      }
    } else if (pub.step === 'guess' && priv.isImpostor) {
      kids.push(h('div', { class: 'banner hot center', style: 'margin-top:10px' }, 'Caught! One shot: what was the word?'));
      kids.push(h('div', { class: 'stack', style: 'margin-top:10px' },
        pub.guessOptions.map(w =>
          h('button', { class: 'tok big', onclick: () => send({ t: 'guess', word: w }) }, w))));
    } else {
      kids.push(h('div', { class: 'banner center', style: 'margin-top:10px' }, 'Waiting…'));
    }
    mount(el, ...kids);
  },
};

export const tv = {
  render(el, ctx) {
    const { pub, seats } = ctx;
    mount(el,
      h('div', { style: 'width:100%;max-width:1100px' },
        h('div', { class: 'center', style: 'margin-bottom:22px' },
          h('div', { class: 'eyebrow', style: 'font-size:16px' }, `Round ${pub.round} · Category`),
          h('div', { style: 'font-size:42px;font-weight:800' }, pub.category)),
        h('div', { class: 'row wrap', style: 'justify-content:center;gap:14px' },
          seats.map((s, i) => h('div', {
            class: 'banner center',
            style: 'min-width:170px' + (pub.alive[i] ? '' : ';opacity:.35'),
          },
            h('div', {}, (s.bot ? '🤖 ' : '') + s.name, pub.alive[i] ? '' : ' 👻'),
            h('div', { style: 'font-size:26px;font-weight:800;min-height:38px;margin-top:6px' },
              pub.step === 'vote' || pub.clues[i] !== '…' ? (pub.clues[i] ? `“${pub.clues[i]}”` : '') : (pub.clues[i] ? '✓' : '…')),
            pub.step === 'vote' && pub.alive[i] && h('div', { class: 'dim', style: 'font-size:14px' },
              pub.voted.includes(i) ? 'voted ✓' : 'voting…'),
          ))),
        h('div', { class: 'center dim', style: 'margin-top:26px;font-size:22px' },
          pub.step === 'clue' ? 'Everyone types a one-word clue on their phone…'
            : pub.step === 'vote' ? 'Discuss! Then vote on your phones. 🗳️'
              : pub.step === 'guess' ? 'The impostor gets one guess at the word…' : ''),
        pub.allClues.length > 1 && h('div', { class: 'center dim', style: 'margin-top:14px;font-size:16px' },
          pub.allClues.slice(0, -1).map(hh =>
            h('div', {}, `R${hh.round}: ` + Object.entries(hh.clues).map(([s2, c]) => `${seats[s2].name}: ${c}`).join(' · ')))),
      ));
  },
};
