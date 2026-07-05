import { h, mount } from '../ui.js';
import { createScene, THREE } from '../three-app/scene.js';
import { makeLabel, SEAT_COLORS as SEAT_HEX } from '../three-app/assets.js';

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

// 3D game-show stage: everyone at a podium under the spotlights, speech
// bubbles for clues, ghosts when you're voted off.
export const tv = {
  mount(holder, ctx) {
    const sc = createScene(holder, { camPos: [0, 5.4, 10.6], lookAt: [0, 1.2, 0], fov: 44, bg: 0x120f22 });
    const n = ctx.seats.length;
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 0.5, 36, 1, false, Math.PI, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x2a2145 }));
    stage.position.y = -0.25;
    sc.scene.add(stage);

    const podiums = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.16 + 0.68 * (n === 1 ? 0.5 : i / (n - 1)));
      const x = -Math.cos(a) * 6.1, z = -Math.sin(a) * 4.6 + 3.4;
      const g = new THREE.Group();
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.15, 10),
        new THREE.MeshLambertMaterial({ color: 0x3a3160 }));
      pod.position.y = 0.57;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 10),
        new THREE.MeshLambertMaterial({ color: SEAT_HEX[i % 6] }));
      top.position.y = 1.18;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12),
        new THREE.MeshLambertMaterial({ color: SEAT_HEX[i % 6] }));
      head.position.y = 1.85;
      g.add(pod, top, head);
      const name = makeLabel(`${ctx.seats[i].bot ? '🤖 ' : ''}${ctx.seats[i].name}`, { size: 22, bg: '#10121fcc' });
      name.position.y = 0.35;
      g.add(name);
      g.position.set(x, 0, z);
      sc.scene.add(g);
      podiums.push({ group: g, head, bubble: null });
    }

    const hudTop = document.createElement('div');
    hudTop.style.cssText = 'position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center;';
    const hudStatus = document.createElement('div');
    hudStatus.style.cssText = 'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);'
      + 'font-size:19px;color:#9aa0b8;text-align:center;width:80%;';
    sc.hud.append(hudTop, hudStatus);

    function update(c) {
      const pub = c.pub;
      podiums.forEach((p, i) => {
        const alive = pub.alive[i];
        p.group.traverse(o => { if (o.material) { o.material.transparent = !alive; o.material.opacity = alive ? 1 : 0.25; } });
        if (p.bubble) { p.group.remove(p.bubble); p.bubble = null; }
        const clue = pub.clues[i];
        const showClue = clue && clue !== '…';
        const txt = showClue ? `“${clue}”` : (clue === '…' ? '✓' : null);
        if (txt && alive) {
          p.bubble = makeLabel(txt, { size: showClue ? 30 : 22, bg: showClue ? '#f2efe4' : '#10121fcc', color: showClue ? '#1c1c28' : '#9aa0b8' });
          p.bubble.position.y = 2.6;
          p.group.add(p.bubble);
        }
        if (pub.step === 'vote' && alive && !p.voteBadgeShown) {
          // voted-state shown via status line; keep podium clean
        }
      });
      hudTop.innerHTML = `
        <div style="font-size:13px;letter-spacing:2px;color:#9aa0b8;font-weight:800">ROUND ${pub.round} · CATEGORY</div>
        <div style="font-size:38px;font-weight:800">${pub.category}</div>`;
      hudStatus.textContent = pub.step === 'clue'
        ? 'Everyone gives a one-word clue (phone or controller)…'
        : pub.step === 'vote'
          ? `Discuss, then vote! Voted: ${pub.voted.length}/${pub.alive.filter(Boolean).length}`
          : pub.step === 'guess' ? 'Caught! The impostor gets one guess at the word…' : '';
      sc.invalidate();
    }

    return { update, rehome: h2 => sc.rehome(h2), dispose: () => sc.dispose() };
  },
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function padChoices({ pub, priv, seat, seats }, stage) {
  if (pub.phase === 'over' || !pub.alive[seat]) return null;
  if (pub.step === 'clue' && !priv.yourClue) {
    stage.word = stage.word || '';
    return {
      title: `Clue: ${stage.word || '_'}`, sticky: true,
      items: [
        ...LETTERS.map(L => ({
          label: L, pick: L,
          onPick: st => { if (st.word.length < 14) st.word += L; },
        })),
        { label: '⌫ erase', pick: 'del', onPick: st => { st.word = st.word.slice(0, -1); } },
        { label: 'Say it ✓', disabled: !stage.word,
          action: { t: 'clue', word: (stage.word || '').toLowerCase() } },
      ],
    };
  }
  if (pub.step === 'vote' && priv.yourVote == null) {
    return {
      title: 'Who is incognito?',
      items: seats.map((s, i) => (pub.alive[i] && i !== seat)
        ? { label: `${s.name} — “${pub.clues[i] || '…'}”`, action: { t: 'vote', seat: i } }
        : null).filter(Boolean),
    };
  }
  if (pub.step === 'guess' && priv.isImpostor) {
    return {
      title: 'One shot — the word was…',
      items: pub.guessOptions.map(w => ({ label: w, action: { t: 'guess', word: w } })),
    };
  }
  return null;
}
