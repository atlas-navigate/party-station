// Spite & Malice — race to empty your payoff pile onto four shared build
// piles that each run Ace up to Queen. Kings and jokers are wild. You end
// your turn by discarding onto one of your own four discard piles, which you
// can play back off later, so what you throw away matters.
//
// Traditionally a two-hander; here it seats up to six by shuffling in more
// decks (see decksFor). That means duplicate card strings are everywhere, so
// every card is addressed by POSITION — never by value.
import { freshDecks, shuffle, sortHand, rank, isJoker } from './util.js';

export const meta = {
  id: 'spite', name: 'Spite & Malice', tagline: 'Burn your payoff pile first',
  icon: '🃏', emoji: '😈', category: 'cards', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [
    {
      key: 'payoff', label: 'Payoff stack', type: 'select', def: 20,
      choices: [
        { v: 20, label: '20 cards — long game' },
        { v: 15, label: '15 cards' },
        { v: 10, label: '10 cards — quick game' },
      ],
    },
  ],
};

const HAND_SIZE = 5;
const BUILD_PILES = 4;
const DISCARD_PILES = 4;
const PILE_TOP = 12;       // Ace..Queen; a finished pile is retired
// A turn ends on a discard, but a player who keeps drawing playable cards
// could in principle never reach one. Nothing in the rules bounds it, so cap
// it: past this many plays only a discard is legal. Far beyond any real turn.
const MAX_PLAYS_PER_TURN = 80;

// Enough cards that the stock isn't starved once every payoff pile and hand
// is dealt: 54 per deck (52 + 2 jokers), plus a deck's worth of slack.
const decksFor = (n, payoff) => Math.max(2, Math.ceil((n * (payoff + HAND_SIZE) + 52) / 54));

// Build-pile order is Ace low through Queen; Kings and jokers stand for
// anything. rv() can't be used here because it ranks Aces high.
const BUILD_VAL = { A: 1, T: 10, J: 11, Q: 12 };
const buildVal = c => (isJoker(c) ? 0 : BUILD_VAL[rank(c)] ?? Number(rank(c)));
const isWild = c => isJoker(c) || rank(c) === 'K';

const top = pile => (pile.length ? pile[pile.length - 1] : null);

function deal(st) {
  const n = st.n;
  st.stock = freshDecks(decksFor(n, st.payoffSize), { jokers: 2 });
  st.spent = [];
  st.build = Array.from({ length: BUILD_PILES }, () => []);
  st.payoff = [];
  st.discards = [];
  st.hands = [];
  for (let p = 0; p < n; p++) {
    st.payoff.push(st.stock.splice(-st.payoffSize));
    st.discards.push(Array.from({ length: DISCARD_PILES }, () => []));
    st.hands.push([]);
  }
  st.turn = 0;
  st.plays = 0;
  st.passStreak = 0;
  st.phase = 'play';
  st.winner = -1;
  st.log = [];
  refill(st, st.turn);
}

// The stock never truly runs out: finished build piles are set aside and
// shuffled back in. Returns null only if every card is locked in someone's
// hand, payoff or discards.
function drawOne(st) {
  if (!st.stock.length) {
    if (!st.spent.length) return null;
    st.stock = shuffle(st.spent);
    st.spent = [];
  }
  return st.stock.pop() ?? null;
}

function refill(st, seat) {
  while (st.hands[seat].length < HAND_SIZE) {
    const c = drawOne(st);
    if (!c) break;
    st.hands[seat].push(c);
  }
  sortHand(st.hands[seat]);
}

function note(st, text) {
  st.log.push(text);
  if (st.log.length > 6) st.log.shift();
}

function canPlaceOn(st, card, pileIdx) {
  const pile = st.build[pileIdx];
  if (!pile || pile.length >= PILE_TOP) return false;
  return isWild(card) || buildVal(card) === pile.length + 1;
}

function targetsFor(st, card) {
  const out = [];
  for (let i = 0; i < BUILD_PILES; i++) if (canPlaceOn(st, card, i)) out.push(i);
  return out;
}

// Drop a card on a build pile, retiring the pile once it reaches a Queen.
function place(st, card, pileIdx) {
  st.build[pileIdx].push(card);
  if (st.build[pileIdx].length >= PILE_TOP) {
    st.spent.push(...st.build[pileIdx]);
    st.build[pileIdx] = [];
    return true;
  }
  return false;
}

function endTurn(st) {
  st.turn = (st.turn + 1) % st.n;
  st.plays = 0;
  refill(st, st.turn);
}

// Everything the seat to move could legally do right now, addressed the same
// way the client sends it back: indices into hand / discard piles.
function legalFor(st, seat) {
  const out = { hand: {}, payoff: [], discard: {}, canPass: false };
  if (st.phase !== 'play' || st.turn !== seat) return out;
  const capped = st.plays >= MAX_PLAYS_PER_TURN;
  if (!capped) {
    const pt = top(st.payoff[seat]);
    if (pt) out.payoff = targetsFor(st, pt);
    st.hands[seat].forEach((c, i) => {
      const t = targetsFor(st, c);
      if (t.length) out.hand[i] = t;
    });
    st.discards[seat].forEach((d, i) => {
      const c = top(d);
      if (!c) return;
      const t = targetsFor(st, c);
      if (t.length) out.discard[i] = t;
    });
  }
  // Passing exists only to stop a player with nothing in hand from being
  // stuck — a discard is otherwise always available and always ends the turn.
  out.canPass = st.hands[seat].length === 0
    && !out.payoff.length
    && !Object.keys(out.hand).length
    && !Object.keys(out.discard).length;
  return out;
}

function make(seats, options, st) {
  const n = seats.length;
  // Saves outlive code changes: backfill anything a older state may lack.
  st.n = st.n || n;
  st.payoffSize = st.payoffSize || options.payoff || 20;
  st.log = st.log || [];
  st.plays = st.plays || 0;
  st.passStreak = st.passStreak || 0;
  st.spent = st.spent || [];

  const winCheck = seat => {
    if (st.payoff[seat].length === 0) {
      st.phase = 'over';
      st.winner = seat;
      note(st, `${seats[seat]?.name || 'Player'} burned their payoff pile!`);
      return true;
    }
    return false;
  };

  return {
    state: st,

    pub() {
      return {
        phase: st.phase,
        turn: st.turn,
        payoffSize: st.payoffSize,
        winner: st.winner,
        build: st.build.map(p => ({ top: top(p), count: p.length, need: p.length + 1 })),
        stock: st.stock.length + st.spent.length,
        payoff: st.payoff.map(p => ({ top: top(p), count: p.length })),
        discards: st.discards.map(ds => ds.map(d => ({ top: top(d), count: d.length }))),
        handCounts: st.hands.map(h => h.length),
        log: st.log.slice(-3),
      };
    },

    priv(seat) {
      return { hand: st.hands[seat], legal: legalFor(st, seat) };
    },

    awaiting() { return st.phase === 'play' ? [st.turn] : []; },

    act(seat, a) {
      if (st.phase !== 'play') return { err: 'The game is over' };
      if (seat !== st.turn) return { err: 'Not your turn' };
      const legal = legalFor(st, seat);

      if (a.t === 'play') {
        const to = Number(a.to);
        if (!(to >= 0 && to < BUILD_PILES)) return { err: 'Pick a build pile' };

        if (a.from === 'payoff') {
          if (!legal.payoff.includes(to)) return { err: 'That won’t go on that pile' };
          const card = st.payoff[seat].pop();
          const done = place(st, card, to);
          note(st, `${seats[seat]?.name || 'Player'} played their payoff card`);
          st.passStreak = 0;
          st.plays++;
          if (done) note(st, 'A build pile filled up and was cleared');
          if (winCheck(seat)) return {};
          return {};
        }

        if (a.from === 'hand') {
          const i = Number(a.i);
          if (!legal.hand[i]?.includes(to)) return { err: 'That won’t go on that pile' };
          const [card] = st.hands[seat].splice(i, 1);
          const done = place(st, card, to);
          st.passStreak = 0;
          st.plays++;
          if (done) note(st, 'A build pile filled up and was cleared');
          // Emptying your hand mid-turn earns a fresh five and you carry on.
          if (!st.hands[seat].length) refill(st, seat);
          return {};
        }

        if (a.from === 'discard') {
          const i = Number(a.i);
          if (!legal.discard[i]?.includes(to)) return { err: 'That won’t go on that pile' };
          const card = st.discards[seat][i].pop();
          const done = place(st, card, to);
          st.passStreak = 0;
          st.plays++;
          if (done) note(st, 'A build pile filled up and was cleared');
          return {};
        }
        return { err: 'Play from your hand, payoff pile or a discard pile' };
      }

      if (a.t === 'discard') {
        const i = Number(a.i);
        const to = Number(a.to);
        if (!st.hands[seat][i]) return { err: 'Pick a card from your hand' };
        if (!(to >= 0 && to < DISCARD_PILES)) return { err: 'Pick a discard pile' };
        const [card] = st.hands[seat].splice(i, 1);
        st.discards[seat][to].push(card);
        st.passStreak = 0;
        endTurn(st);
        return {};
      }

      if (a.t === 'pass') {
        if (!legal.canPass) return { err: 'You still have a move — play or discard' };
        // Everyone stuck in a row means the cards can't move any more; the
        // shortest payoff pile takes it rather than looping forever.
        if (++st.passStreak >= n) {
          const fewest = Math.min(...st.payoff.map(p => p.length));
          st.winner = st.payoff.findIndex(p => p.length === fewest);
          st.phase = 'over';
          note(st, 'Nobody could move — shortest payoff pile wins');
          return {};
        }
        endTurn(st);
        return {};
      }

      return { err: 'Invalid action' };
    },

    botAct(seat) {
      const legal = legalFor(st, seat);
      if (legal.canPass) return { t: 'pass' };

      // 1. The whole game is the payoff pile — play off it whenever you can.
      if (legal.payoff.length) {
        return { t: 'play', from: 'payoff', to: pickPile(st, legal.payoff) };
      }

      const payoffCard = top(st.payoff[seat]);
      const wantVal = payoffCard && !isWild(payoffCard) ? buildVal(payoffCard) : null;
      // A pile is "useful" when playing on it walks toward the value we need
      // to unload our payoff card next.
      const useful = to => wantVal == null || st.build[to].length + 1 <= wantVal;

      // 2. Playing off a discard pile costs nothing from hand and frees a
      //    slot to throw into later, so prefer it — but not with a wild.
      for (const [i, tos] of Object.entries(legal.discard)) {
        const card = top(st.discards[seat][Number(i)]);
        if (isWild(card)) continue;
        const to = tos.find(useful);
        if (to != null) return { t: 'play', from: 'discard', i: Number(i), to };
      }

      // 3. Then hand cards, cheapest first, still avoiding wilds.
      const handMoves = Object.entries(legal.hand)
        .map(([i, tos]) => ({ i: Number(i), tos, card: st.hands[seat][Number(i)] }))
        .filter(m => !isWild(m.card))
        .sort((a, b) => buildVal(a.card) - buildVal(b.card));
      for (const m of handMoves) {
        const to = m.tos.find(useful);
        if (to != null) return { t: 'play', from: 'hand', i: m.i, to };
      }

      // 4. Spend a wild only when it actually unsticks the payoff card.
      if (wantVal != null) {
        for (const [i, tos] of Object.entries(legal.hand)) {
          const card = st.hands[seat][Number(i)];
          if (!isWild(card)) continue;
          const to = tos.find(t2 => st.build[t2].length + 2 === wantVal);
          if (to != null) return { t: 'play', from: 'hand', i: Number(i), to };
        }
      }

      // 5. Nothing walks toward our own payoff card, but playing anyway is
      //    still usually right: it empties the hand (which earns a fresh
      //    five) and pushes piles toward the Queen that retires them and
      //    recycles them into the stock. Hoarding instead is what dries the
      //    stock up and jams the table.
      for (const [i, tos] of Object.entries(legal.discard)) {
        if (isWild(top(st.discards[seat][Number(i)]))) continue;
        return { t: 'play', from: 'discard', i: Number(i), to: pickPile(st, tos) };
      }
      for (const m of handMoves) {
        return { t: 'play', from: 'hand', i: m.i, to: pickPile(st, m.tos) };
      }

      // 6. With an empty hand there is nothing to discard, so ending the turn
      //    isn't an option — take any legal move at all, wilds included.
      if (!st.hands[seat].length) {
        const d = Object.entries(legal.discard)[0];
        if (d) return { t: 'play', from: 'discard', i: Number(d[0]), to: d[1][0] };
        if (legal.payoff.length) return { t: 'play', from: 'payoff', to: legal.payoff[0] };
        return { t: 'pass' };
      }

      // 7. Nothing playable at all — end the turn. Stack a duplicate rank
      //    where possible so the pile stays replayable, else start an empty
      //    pile, else the shortest one.
      return discardMove(st, seat);
    },

    over() {
      if (st.phase !== 'over') return null;
      const w = seats[st.winner];
      return {
        title: `${w?.name || 'Nobody'} wins!`,
        lines: seats.map((s, i) => `${s.name}: ${st.payoff[i].length} left in the payoff pile`),
      };
    },
  };
}

// Least-committed build pile first, so wilds and low cards don't all pile up
// in one place.
function pickPile(st, tos) {
  return tos.slice().sort((a, b) => st.build[a].length - st.build[b].length)[0];
}

function discardMove(st, seat) {
  const hand = st.hands[seat];
  // Never bury a wild if there's anything else to throw.
  const idxs = hand.map((c, i) => i);
  const nonWild = idxs.filter(i => !isWild(hand[i]));
  const pool = nonWild.length ? nonWild : idxs;
  // Highest card is the least useful to hold onto.
  const i = pool.sort((a, b) => buildVal(hand[b]) - buildVal(hand[a]))[0];
  const card = hand[i];

  const piles = st.discards[seat];
  let to = piles.findIndex(p => top(p) && rank(top(p)) === rank(card));
  if (to < 0) to = piles.findIndex(p => !p.length);
  if (to < 0) {
    to = piles
      .map((p, j) => j)
      .sort((a, b) => piles[a].length - piles[b].length)[0];
  }
  return { t: 'discard', i, to };
}

export function create({ seats, options }) {
  const st = { n: seats.length, payoffSize: options.payoff || 20 };
  deal(st);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
