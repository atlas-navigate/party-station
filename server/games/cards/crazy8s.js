// Crazy 8s — match the top card by suit or rank; 8s are wild and let you call
// the suit. First player to empty their hand wins the round.
import { freshDeck, shuffle, sortHand, removeCard, rank, suit } from './util.js';

export const meta = {
  id: 'crazy8s', name: 'Crazy 8s', tagline: 'Eights are wild', icon: '🎱', emoji: '🃏',
  category: 'cards', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [
    { key: 'rounds', label: 'Rounds', type: 'select', def: 1,
      choices: [{ v: 1, label: 'Single round' }, { v: 3, label: 'Best of 3' }] },
  ],
};

const MAX_DRAWS = 3;

function deal(st, n) {
  st.deck = freshDeck();
  st.hands = Array.from({ length: n }, () => []);
  const per = n <= 2 ? 7 : 5;
  for (let i = 0; i < per; i++) for (let p = 0; p < n; p++) st.hands[p].push(st.deck.pop());
  st.hands.forEach(sortHand);
  let top = st.deck.pop();
  while (rank(top) === '8') { st.deck.unshift(top); top = st.deck.pop(); }
  st.discard = [top];
  st.suit = suit(top);
  st.turn = st.round % n;
  st.drawn = 0;
  st.passStreak = 0;
  st.phase = 'play';
}

function top(st) { return st.discard[st.discard.length - 1]; }

function playable(st, c) {
  return rank(c) === '8' || suit(c) === st.suit || rank(c) === rank(top(st));
}

function refillDeck(st) {
  if (st.deck.length) return;
  const t = st.discard.pop();
  st.deck = shuffle(st.discard);
  st.discard = [t];
}

function advance(st, n) {
  st.turn = (st.turn + 1) % n;
  st.drawn = 0;
}

function endRound(st, n, winner) {
  st.wins[winner]++;
  st.lastWinner = winner;
  const need = Math.ceil(st.roundsTotal / 2) + (st.roundsTotal > 1 ? 0 : 0);
  if (st.wins[winner] > st.roundsTotal / 2 || st.round + 1 >= st.roundsTotal) {
    st.phase = 'over';
  } else {
    st.round++;
    deal(st, n);
  }
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, turn: st.turn, top: top(st), suit: st.suit,
        deckCount: st.deck.length, handCounts: st.hands.map(h => h.length),
        drawn: st.drawn, maxDraws: MAX_DRAWS, wins: st.wins,
        round: st.round + 1, roundsTotal: st.roundsTotal, lastWinner: st.lastWinner,
      };
    },
    priv(seat) {
      return {
        hand: st.hands[seat],
        legal: st.phase === 'play' && st.turn === seat
          ? st.hands[seat].filter(c => playable(st, c)) : [],
      };
    },
    awaiting() { return st.phase === 'play' ? [st.turn] : []; },
    act(seat, a) {
      if (st.phase !== 'play' || seat !== st.turn) return { err: 'Not your turn' };
      if (a.t === 'play') {
        if (!st.hands[seat].includes(a.card)) return { err: 'Not your card' };
        if (!playable(st, a.card)) return { err: 'That card doesn’t match' };
        removeCard(st.hands[seat], a.card);
        st.passStreak = 0;
        st.discard.push(a.card);
        st.suit = rank(a.card) === '8'
          ? ('shdc'.includes(a.suit) ? a.suit : suit(a.card))
          : suit(a.card);
        if (!st.hands[seat].length) { endRound(st, n, seat); return {}; }
        advance(st, n);
        return {};
      }
      if (a.t === 'draw') {
        if (st.drawn >= MAX_DRAWS) return { err: 'No more draws — pass' };
        refillDeck(st);
        if (!st.deck.length) return { err: 'No cards left — pass' };
        const c = st.deck.pop();
        st.hands[seat].push(c);
        sortHand(st.hands[seat]);
        st.drawn++;
        return {};
      }
      if (a.t === 'pass') {
        const canPlay = st.hands[seat].some(c => playable(st, c));
        const mustDraw = st.drawn < MAX_DRAWS && st.deck.length > 0;
        if (canPlay) return { err: 'You have a playable card' };
        if (mustDraw) return { err: 'Draw first' };
        // Stalemate: every card is stuck in hands and a full cycle of passes
        // happened. Fewest cards takes the round.
        if (++st.passStreak >= n && !st.deck.length) {
          const fewest = Math.min(...st.hands.map(h => h.length));
          endRound(st, n, st.hands.findIndex(h => h.length === fewest));
          return {};
        }
        advance(st, n);
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      const hand = st.hands[seat];
      const legal = hand.filter(c => playable(st, c));
      const non8 = legal.filter(c => rank(c) !== '8');
      if (non8.length) {
        // Prefer shedding from our longest suit.
        const bySuit = {};
        for (const c of hand) bySuit[suit(c)] = (bySuit[suit(c)] || 0) + 1;
        non8.sort((a, b) => bySuit[suit(b)] - bySuit[suit(a)]);
        return { t: 'play', card: non8[0] };
      }
      if (legal.length) { // only an 8 — call our longest suit
        const bySuit = { s: 0, h: 0, d: 0, c: 0 };
        for (const c of hand) if (c !== legal[0]) bySuit[suit(c)]++;
        const best = Object.entries(bySuit).sort((a, b) => b[1] - a[1])[0][0];
        return { t: 'play', card: legal[0], suit: best };
      }
      if (st.drawn < MAX_DRAWS && st.deck.length) return { t: 'draw' };
      return { t: 'pass' };
    },
    over() {
      if (st.phase !== 'over') return null;
      const best = Math.max(...st.wins);
      const winners = seats.filter((_, i) => st.wins[i] === best);
      return {
        title: `${winners.map(w => w.name).join(' & ')} wins!`,
        lines: st.roundsTotal > 1 ? seats.map((s, i) => `${s.name}: ${st.wins[i]} round(s)`) : [],
      };
    },
  };
}

export function create({ seats, options }) {
  const st = {
    wins: seats.map(() => 0), round: 0,
    roundsTotal: options.rounds || 1, lastWinner: -1,
  };
  deal(st, seats.length);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
