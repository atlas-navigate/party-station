// Hearts — classic trick-taking for 4–6 players. Pass 3 cards (left/right/
// across cycle), avoid hearts (1pt) and the queen of spades (13pts). Shooting
// the moon gives everyone else 26. Lowest score when someone hits the target
// wins. With 5–6 players a few low clubs/diamonds sit out so the deal comes
// out even (every heart and the queen stay in — the moon is always 26).
//
// Flow: a finished trick stays face-up on the table (sweep pause) before the
// winner gathers it, and each round ends on a score summary — the lobby
// drives these via pending()/tick().
import { freshDeck, sortHand, removeCard, rank, suit, rv } from './util.js';

export const meta = {
  id: 'hearts', name: 'Hearts', tagline: 'Dodge the queen of spades',
  icon: '🂱', emoji: '💔', category: 'cards', mode: 'server',
  minPlayers: 4, maxPlayers: 6, saveable: true,
  options: [
    { key: 'target', label: 'Play to', type: 'select', def: 100,
      choices: [{ v: 50, label: '50 points' }, { v: 100, label: '100 points' }] },
  ],
};

const SWEEP_MS = 2200;  // finished trick shown face-up before it's gathered
const ROUND_MS = 5000;  // round score summary before the next deal

// Cards set aside so 52 divides evenly (never hearts, never the queen).
const SIT_OUT = { 4: [], 5: ['2d', '2c'], 6: ['2d', '2c', '3d', '3c'] };

// Pass-direction cycle: left, right, then closer seats, then a hold round —
// the classic [left, right, across, hold] when 4 play.
function passDirs(n) {
  const dirs = [];
  for (let k = 1; k <= Math.floor((n - 1) / 2); k++) dirs.push(k, n - k);
  if (n % 2 === 0) dirs.push(n / 2);
  dirs.push(0);
  return dirs;
}

function deal(st) {
  const n = st.n;
  const deck = freshDeck().filter(c => !(SIT_OUT[n] || []).includes(c));
  st.hands = Array.from({ length: n }, () => []);
  for (let i = 0; i < deck.length; i++) st.hands[i % n].push(deck[i]);
  st.hands.forEach(sortHand);
  // The lowest club still in the deck opens the round (2♣ unless it sat out).
  st.open = ['2c', '3c', '4c'].find(c => st.hands.some(hd => hd.includes(c)));
  const dirs = passDirs(n);
  st.dir = dirs[st.round % dirs.length];
  st.passed = Array(n).fill(null);
  st.trick = [];
  st.taken = Array.from({ length: n }, () => []);
  st.heartsBroken = false;
  st.firstTrick = true;
  st.lastTrick = null;
  st.sweep = null;
  if (st.dir === 0) startPlay(st);
  else st.phase = 'pass';
}

function startPlay(st) {
  st.phase = 'play';
  st.turn = st.hands.findIndex(h => h.includes(st.open));
}

function applyPasses(st) {
  const n = st.n;
  const incoming = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (const c of st.passed[i]) removeCard(st.hands[i], c);
    incoming[(i + st.dir) % n] = st.passed[i];
  }
  for (let i = 0; i < n; i++) { st.hands[i].push(...incoming[i]); sortHand(st.hands[i]); }
  startPlay(st);
}

function legalPlays(st, seat) {
  const hand = st.hands[seat];
  const isPoint = c => suit(c) === 'h' || c === 'Qs';
  if (!st.trick.length) {
    if (st.firstTrick) return hand.includes(st.open) ? [st.open] : hand;
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
  for (let i = 0; i < st.n; i++) {
    const add = shooter >= 0 ? (i === shooter ? 0 : 26) : roundPts[i];
    st.scores[i] += add;
    st.lastRound.push(add);
  }
  st.shooter = shooter;
  st.phase = 'roundEnd'; // linger on the summary; tick() deals the next round
}

function make(seats, options, st) {
  // Saves from the 4-player-only era carry no seat count or opening card.
  st.n = st.n || (st.hands ? st.hands.length : 4);
  st.open = st.open || '2c';
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, scores: st.scores, round: st.round + 1, target: st.target,
        dir: st.dir, turn: st.turn,
        trick: st.trick, lastTrick: st.lastTrick, sweep: st.sweep,
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
      if (st.phase === 'pass') return st.hands.map((_, i) => i).filter(i => !st.passed[i]);
      if (st.phase === 'play') return st.sweep ? [] : [st.turn];
      return [];
    },
    // Timed display states: the lobby (or simulator) calls tick() after
    // pending() milliseconds whenever nobody is awaited.
    pending() {
      if (st.phase === 'play' && st.sweep) return SWEEP_MS;
      if (st.phase === 'roundEnd') return ROUND_MS;
      return null;
    },
    tick() {
      if (st.phase === 'play' && st.sweep) {
        const winner = st.sweep.winner;
        st.taken[winner].push(...st.trick.map(t => t.card));
        st.lastTrick = { cards: st.trick, winner };
        st.trick = [];
        st.firstTrick = false;
        st.sweep = null;
        st.turn = winner;
        if (st.hands.every(h => !h.length)) endRound(st);
      } else if (st.phase === 'roundEnd') {
        if (st.scores.some(s => s >= st.target)) st.phase = 'over';
        else { st.round++; deal(st); }
      }
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
        if (st.sweep) return { err: 'Trick is being gathered…' };
        if (seat !== st.turn) return { err: 'Not your turn' };
        if (!legalPlays(st, seat).includes(a.card)) return { err: 'You can’t play that card' };
        removeCard(st.hands[seat], a.card);
        st.trick.push({ seat, card: a.card });
        if (suit(a.card) === 'h') st.heartsBroken = true;
        if (st.trick.length === st.n) {
          // Leave the full trick face-up; tick() sweeps it after the pause.
          const lead = suit(st.trick[0].card);
          let win = st.trick[0];
          for (const t of st.trick) {
            if (suit(t.card) === lead && rv(t.card) > rv(win.card)) win = t;
          }
          st.sweep = { winner: win.seat, pts: points(st.trick.map(t => t.card)) };
          st.turn = -1;
        } else {
          st.turn = (st.turn + 1) % st.n;
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
          const last = st.trick.length === st.n - 1;
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
    n: seats.length,
    target: options.target || 100,
    scores: Array(seats.length).fill(0), round: 0, shooter: -1,
  };
  deal(st);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
