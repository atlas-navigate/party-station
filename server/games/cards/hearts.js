// Hearts — classic 4-player trick-taking. Pass 3 cards (left/right/across/hold
// cycle), avoid hearts (1pt) and the queen of spades (13pts). Shooting the moon
// gives everyone else 26. Lowest score when someone hits the target wins.
import { freshDeck, sortHand, removeCard, rank, suit, rv } from './util.js';

export const meta = {
  id: 'hearts', name: 'Hearts', tagline: 'Dodge the queen of spades',
  icon: '🂱', emoji: '💔', category: 'cards', mode: 'server',
  minPlayers: 4, maxPlayers: 4, saveable: true,
  options: [
    { key: 'target', label: 'Play to', type: 'select', def: 100,
      choices: [{ v: 50, label: '50 points' }, { v: 100, label: '100 points' }] },
  ],
};

const PASS_DIRS = [1, 3, 2, 0]; // left, right, across, hold (seat offsets)

function deal(st) {
  const deck = freshDeck();
  st.hands = [[], [], [], []];
  for (let i = 0; i < 52; i++) st.hands[i % 4].push(deck[i]);
  st.hands.forEach(sortHand);
  st.dir = PASS_DIRS[st.round % 4];
  st.passed = [null, null, null, null];
  st.trick = [];
  st.taken = [[], [], [], []];
  st.heartsBroken = false;
  st.firstTrick = true;
  st.lastTrick = null;
  if (st.dir === 0) startPlay(st);
  else st.phase = 'pass';
}

function startPlay(st) {
  st.phase = 'play';
  st.turn = st.hands.findIndex(h => h.includes('2c'));
}

function applyPasses(st) {
  const incoming = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    for (const c of st.passed[i]) removeCard(st.hands[i], c);
    incoming[(i + st.dir) % 4] = st.passed[i];
  }
  for (let i = 0; i < 4; i++) { st.hands[i].push(...incoming[i]); sortHand(st.hands[i]); }
  startPlay(st);
}

function legalPlays(st, seat) {
  const hand = st.hands[seat];
  const isPoint = c => suit(c) === 'h' || c === 'Qs';
  if (!st.trick.length) {
    if (st.firstTrick) return hand.includes('2c') ? ['2c'] : hand;
    if (!st.heartsBroken) {
      const nonHearts = hand.filter(c => suit(c) !== 'h');
      if (nonHearts.length) return nonHearts;
    }
    return hand;
  }
  const lead = suit(st.trick[0].card);
  const follow = hand.filter(c => suit(c) === lead);
  if (follow.length) return follow;
  if (st.firstTrick) {
    const safe = hand.filter(c => !isPoint(c));
    if (safe.length) return safe; // no blood on the first trick
  }
  return hand;
}

function points(cards) {
  return cards.reduce((n, c) => n + (suit(c) === 'h' ? 1 : c === 'Qs' ? 13 : 0), 0);
}

function endRound(st) {
  const roundPts = st.taken.map(points);
  const shooter = roundPts.findIndex(p => p === 26);
  st.lastRound = [];
  for (let i = 0; i < 4; i++) {
    const add = shooter >= 0 ? (i === shooter ? 0 : 26) : roundPts[i];
    st.scores[i] += add;
    st.lastRound.push(add);
  }
  st.shooter = shooter;
  if (st.scores.some(s => s >= st.target)) {
    st.phase = 'over';
  } else {
    st.round++;
    deal(st);
  }
}

function make(seats, options, st) {
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, scores: st.scores, round: st.round + 1, target: st.target,
        dir: st.dir, turn: st.turn,
        trick: st.trick, lastTrick: st.lastTrick,
        handCounts: st.hands.map(h => h.length),
        passedFlags: st.passed ? st.passed.map(p => !!p) : null,
        heartsBroken: st.heartsBroken,
        takenPts: st.taken ? st.taken.map(points) : null,
        lastRound: st.lastRound || null, shooter: st.shooter,
      };
    },
    priv(seat) {
      return {
        hand: st.hands[seat],
        legal: st.phase === 'play' && st.turn === seat ? legalPlays(st, seat) : [],
        passing: st.phase === 'pass' && !st.passed[seat],
      };
    },
    awaiting() {
      if (st.phase === 'pass') return [0, 1, 2, 3].filter(i => !st.passed[i]);
      if (st.phase === 'play') return [st.turn];
      return [];
    },
    act(seat, a) {
      if (st.phase === 'pass' && a.t === 'pass') {
        if (st.passed[seat]) return { err: 'Already passed' };
        const cards = a.cards || [];
        if (cards.length !== 3 || new Set(cards).size !== 3) return { err: 'Pick exactly 3 cards' };
        if (!cards.every(c => st.hands[seat].includes(c))) return { err: 'Not your cards' };
        st.passed[seat] = cards;
        if (st.passed.every(Boolean)) applyPasses(st);
        return {};
      }
      if (st.phase === 'play' && a.t === 'play') {
        if (seat !== st.turn) return { err: 'Not your turn' };
        if (!legalPlays(st, seat).includes(a.card)) return { err: 'You can’t play that card' };
        removeCard(st.hands[seat], a.card);
        st.trick.push({ seat, card: a.card });
        if (suit(a.card) === 'h') st.heartsBroken = true;
        if (st.trick.length === 4) {
          const lead = suit(st.trick[0].card);
          let win = st.trick[0];
          for (const t of st.trick) {
            if (suit(t.card) === lead && rv(t.card) > rv(win.card)) win = t;
          }
          st.taken[win.seat].push(...st.trick.map(t => t.card));
          st.lastTrick = { cards: st.trick, winner: win.seat };
          st.trick = [];
          st.firstTrick = false;
          st.turn = win.seat;
          if (st.hands.every(h => !h.length)) endRound(st);
        } else {
          st.turn = (st.turn + 1) % 4;
        }
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.phase === 'pass') {
        // Ship the most dangerous cards: high spades, then highest cards.
        const danger = c => (c === 'Qs' ? 100 : c === 'As' || c === 'Ks' ? 90 : 0)
          + rv(c) + (suit(c) === 'h' ? 6 : 0);
        const cards = [...st.hands[seat]].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
        return { t: 'pass', cards };
      }
      if (st.phase === 'play') {
        const legal = legalPlays(st, seat);
        const low = [...legal].sort((a, b) => rv(a) - rv(b));
        if (!st.trick.length) {
          const safe = low.filter(c => c !== 'Qs' && suit(c) !== 'h');
          return { t: 'play', card: (safe[0] || low[0]) };
        }
        const lead = suit(st.trick[0].card);
        let winning = st.trick[0].card;
        for (const t of st.trick) {
          if (suit(t.card) === lead && rv(t.card) > rv(winning)) winning = t.card;
        }
        const following = legal.filter(c => suit(c) === lead);
        if (following.length) {
          // Duck with the highest card that still loses; otherwise dump lowest
          // (unless we're last and the trick is pointless — then take it high).
          const ducks = following.filter(c => rv(c) < rv(winning)).sort((a, b) => rv(b) - rv(a));
          if (ducks.length) return { t: 'play', card: ducks[0] };
          const last = st.trick.length === 3;
          const trickPts = points(st.trick.map(t => t.card));
          if (last && trickPts === 0) {
            return { t: 'play', card: following.sort((a, b) => rv(b) - rv(a))[0] };
          }
          return { t: 'play', card: following.sort((a, b) => rv(a) - rv(b))[0] };
        }
        // Void in the led suit: dump the nastiest card we hold.
        const dump = [...legal].sort((a, b) => {
          const val = c => (c === 'Qs' ? 100 : 0) + (suit(c) === 'h' ? 20 : 0) + rv(c);
          return val(b) - val(a);
        });
        return { t: 'play', card: dump[0] };
      }
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const best = Math.min(...st.scores);
      const winners = seats.map((s, i) => ({ s, i })).filter(x => st.scores[x.i] === best);
      return {
        title: `${winners.map(w => w.s.name).join(' & ')} wins!`,
        lines: seats.map((s, i) => `${s.name}: ${st.scores[i]} points`),
      };
    },
  };
}

export function create({ seats, options }) {
  const st = {
    target: options.target || 100,
    scores: [0, 0, 0, 0], round: 0, shooter: -1,
  };
  deal(st);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
