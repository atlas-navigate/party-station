// Go Fish — ask a player for a rank you hold; collect books of four.
// Most books when the pond runs dry wins.
import { freshDeck, sortHand, rank, RANKS } from './util.js';

export const meta = {
  id: 'gofish', name: 'Go Fish', tagline: 'Got any threes?', icon: '🐟', emoji: '🐟',
  category: 'cards', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [],
};

function draw(st, seat, n) {
  for (let i = 0; i < n && st.deck.length; i++) st.hands[seat].push(st.deck.pop());
  sortHand(st.hands[seat]);
}

function layBooks(st, seat) {
  const counts = {};
  for (const c of st.hands[seat]) counts[rank(c)] = (counts[rank(c)] || 0) + 1;
  for (const r in counts) {
    if (counts[r] === 4) {
      st.hands[seat] = st.hands[seat].filter(c => rank(c) !== r);
      st.books[seat].push(r);
      if (st.mem[seat]) delete st.mem[seat][r]; // no longer holds it
      st.log.push({ e: 'book', seat, rank: r });
    }
  }
}

function refillIfEmpty(st, seat) {
  if (!st.hands[seat].length && st.deck.length) draw(st, seat, 5);
}

function gameDone(st) {
  return st.books.flat().length === 13;
}

function nextTurn(st, n) {
  for (let i = 1; i <= n; i++) {
    const cand = (st.turn + i) % n;
    refillIfEmpty(st, cand);
    if (st.hands[cand].length) { st.turn = cand; return; }
  }
  st.phase = 'over'; // nobody can move
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, turn: st.turn,
        deckCount: st.deck.length,
        handCounts: st.hands.map(h => h.length),
        books: st.books,
        log: st.log.slice(-6),
      };
    },
    priv(seat) { return { hand: st.hands[seat] }; },
    awaiting() { return st.phase === 'play' ? [st.turn] : []; },
    act(seat, a) {
      if (st.phase !== 'play' || seat !== st.turn) return { err: 'Not your turn' };
      if (a.t !== 'ask') return { err: 'Invalid action' };
      const target = a.target;
      if (target === seat || !seats[target]) return { err: 'Pick another player' };
      if (!st.hands[target] || !st.hands[target].length && !st.deck.length && !st.hands[seat].length) {
        return { err: 'They have no cards' };
      }
      if (!RANKS.includes(a.rank)) return { err: 'Bad rank' };
      if (!st.hands[seat].some(c => rank(c) === a.rank)) {
        return { err: 'You must hold a card of that rank' };
      }
      st.mem[seat] = st.mem[seat] || {};
      st.mem[seat][a.rank] = true; // everyone heard this ask
      const hits = st.hands[target].filter(c => rank(c) === a.rank);
      if (hits.length) {
        st.hands[target] = st.hands[target].filter(c => rank(c) !== a.rank);
        if (st.mem[target]) delete st.mem[target][a.rank]; // their stash moved
        st.hands[seat].push(...hits);
        sortHand(st.hands[seat]);
        st.log.push({ e: 'took', seat, target, rank: a.rank, n: hits.length });
        layBooks(st, seat);
        refillIfEmpty(st, target);
        refillIfEmpty(st, seat);
        if (gameDone(st)) { st.phase = 'over'; return {}; }
        if (!st.hands[seat].length) nextTurn(st, n); // out of cards, out of luck
        return {}; // hit: go again
      }
      st.log.push({ e: 'gofish', seat, target, rank: a.rank });
      if (st.deck.length) {
        const c = st.deck.pop();
        st.hands[seat].push(c);
        sortHand(st.hands[seat]);
        layBooks(st, seat);
        if (gameDone(st)) { st.phase = 'over'; return {}; }
        if (rank(c) === a.rank) {
          st.log.push({ e: 'lucky', seat, rank: a.rank });
          refillIfEmpty(st, seat);
          if (st.hands[seat].length) return {}; // drew the asked rank: go again
        }
      }
      refillIfEmpty(st, seat);
      nextTurn(st, n);
      return {};
    },
    botAct(seat) {
      const hand = st.hands[seat];
      if (!hand.length) return null;
      const myRanks = [...new Set(hand.map(rank))];
      // Prefer a rank someone else has publicly asked for (they likely still
      // hold it) — but only usually, so stale reads can't cause loops.
      if (Math.random() < 0.75) {
        for (const r of myRanks) {
          for (let t = 0; t < n; t++) {
            if (t !== seat && st.mem[t]?.[r] && st.hands[t].length) {
              return { t: 'ask', target: t, rank: r };
            }
          }
        }
      }
      const counts = {};
      for (const c of hand) counts[rank(c)] = (counts[rank(c)] || 0) + 1;
      const r = myRanks.sort((a, b) => counts[b] - counts[a])[0];
      const targets = seats.map((_, i) => i).filter(i => i !== seat && st.hands[i].length);
      if (!targets.length) return null;
      return { t: 'ask', target: targets[Math.floor(Math.random() * targets.length)], rank: r };
    },
    over() {
      if (st.phase !== 'over') return null;
      const best = Math.max(...st.books.map(b => b.length));
      const winners = seats.filter((_, i) => st.books[i].length === best);
      return {
        title: `${winners.map(w => w.name).join(' & ')} wins!`,
        lines: seats.map((s, i) => `${s.name}: ${st.books[i].length} book(s)`),
      };
    },
  };
}

export function create({ seats }) {
  const n = seats.length;
  const st = {
    phase: 'play', deck: freshDeck(),
    hands: seats.map(() => []), books: seats.map(() => []),
    turn: 0, log: [], mem: {},
  };
  const per = n <= 3 ? 7 : 5;
  for (let p = 0; p < n; p++) draw(st, p, per);
  return make(seats, {}, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
