// Blackjack — everyone vs. the house dealer. Hit, stand, double.
// Blackjack pays 3:2, dealer stands on all 17s. Bankrolls persist via autosave.
// Cards land one at a time on a timer (phases 'deal' and 'dealer', driven by
// pending()/tick() like hearts' trick sweep) so the round reads like a real
// dealer working the shoe instead of everything appearing at once.
import { freshDeck, rank, rv } from './util.js';

const DEAL_MS = 400;    // one card off the shoe
const DEALER_MS = 900;  // hole-card reveal beat + each dealer draw

export const meta = {
  id: 'blackjack', name: 'Blackjack', tagline: 'Beat the dealer to 21', icon: '🂡', emoji: '♠️',
  category: 'cards', mode: 'server',
  minPlayers: 1, maxPlayers: 6, saveable: true,
  options: [
    { key: 'bank', label: 'Starting chips', type: 'select', def: 500,
      choices: [{ v: 200, label: '200' }, { v: 500, label: '500' }, { v: 1000, label: '1000' }] },
  ],
};

const MIN_BET = 10;

export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const r = rank(c);
    if (r === 'A') { aces++; total += 11; }
    else if ('TJQK'.includes(r)) total += 10;
    else total += rv(c);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const isBJ = cards => cards.length === 2 && handValue(cards) === 21;

function drawCard(st) {
  if (!st.shoe.length) st.shoe = freshDeck().concat(freshDeck());
  return st.shoe.pop();
}

function activeSeats(st, n) {
  return Array.from({ length: n }, (_, i) => i).filter(i => st.bank[i] >= MIN_BET);
}

function startRound(st, n) {
  st.phase = 'bet';
  st.bets = st.bank.map(() => 0);
  st.hands = st.bank.map(() => []);
  st.dealer = [];
  st.done = st.bank.map((b) => b < MIN_BET); // broke players sit out
  st.results = null;
  st.turn = -1;
  if (st.shoe.length < 52) st.shoe = freshDeck().concat(freshDeck());
  if (!activeSeats(st, n).length) st.phase = 'over';
}

function dealRound(st, n) {
  // Two passes around the table, dealer last each pass; tick() lays down
  // one card per entry (-1 = dealer) so everyone can watch the deal.
  const live = activeSeats(st, n).filter(i => st.bets[i] > 0);
  st.phase = 'deal';
  st.dealQueue = [...live, -1, ...live, -1];
}

function dealDone(st, n) {
  const live = activeSeats(st, n).filter(i => st.bets[i] > 0);
  st.phase = 'play';
  for (const i of live) if (isBJ(st.hands[i])) st.done[i] = true;
  // Dealer blackjack still passes through the 'dealer' phase: the hole card
  // flips and lingers a beat before the payouts land.
  if (isBJ(st.dealer)) { st.phase = 'dealer'; st.turn = -1; return; }
  nextPlayTurn(st, n);
}

function nextPlayTurn(st, n) {
  const live = activeSeats(st, n).filter(i => st.bets[i] > 0);
  st.turn = live.find(i => !st.done[i] && handValue(st.hands[i]) < 21) ?? -1;
  // Everyone is set — reveal the hole card; tick() plays the dealer out
  // one draw at a time, then settles.
  if (st.turn === -1) st.phase = 'dealer';
}

function dealerStep(st, n) {
  const live = activeSeats(st, n).filter(i => st.bets[i] > 0);
  // Dealer only plays out against hands still standing (nobody left = no
  // draws, straight to the payouts after the reveal beat).
  if (live.some(i => handValue(st.hands[i]) <= 21) && handValue(st.dealer) < 17) {
    st.dealer.push(drawCard(st));
    return;
  }
  settle(st, n);
}

function settle(st, n) {
  const dv = handValue(st.dealer);
  const dealerBJ = isBJ(st.dealer);
  st.results = st.bank.map(() => null);
  for (const i of activeSeats(st, n).concat()) {
    if (!(st.bets[i] > 0)) continue;
    const pv = handValue(st.hands[i]);
    const bet = st.bets[i];
    let delta, label;
    if (pv > 21) { delta = -bet; label = 'Bust'; }
    else if (isBJ(st.hands[i]) && !dealerBJ) { delta = Math.floor(bet * 1.5); label = 'Blackjack!'; }
    else if (dealerBJ && !isBJ(st.hands[i])) { delta = -bet; label = 'Dealer blackjack'; }
    else if (dv > 21) { delta = bet; label = 'Dealer busts'; }
    else if (pv > dv) { delta = bet; label = 'Win'; }
    else if (pv < dv) { delta = -bet; label = 'Lose'; }
    else { delta = 0; label = 'Push'; }
    st.bank[i] += delta;
    st.results[i] = { delta, label };
  }
  st.phase = 'payout';
  st.ready = st.bank.map(() => false);
  st.round++;
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      // The hole card (dealer's second) stays face-down through the deal and
      // everyone's turns; entering the 'dealer' phase is what flips it.
      const hideHole = st.phase === 'deal' || st.phase === 'play';
      return {
        phase: st.phase, turn: st.turn, round: st.round,
        bank: st.bank, bets: st.bets,
        hands: st.hands, values: st.hands.map(h => h.length ? handValue(h) : null),
        dealer: hideHole ? st.dealer.map((c, i) => (i === 0 ? c : 'back')) : st.dealer,
        dealerValue: hideHole ? null : (st.dealer.length ? handValue(st.dealer) : null),
        results: st.results, minBet: MIN_BET,
        sittingOut: st.bank.map(b => b < MIN_BET),
      };
    },
    priv(seat) {
      const canAct = st.phase === 'play' && st.turn === seat;
      return {
        canHit: canAct,
        canDouble: canAct && st.hands[seat].length === 2 && st.bank[seat] >= st.bets[seat],
        betting: st.phase === 'bet' && !st.done[seat] && st.bets[seat] === 0,
      };
    },
    awaiting() {
      if (st.phase === 'bet') {
        return activeSeats(st, n).filter(i => st.bets[i] === 0 && !st.done[i]);
      }
      if (st.phase === 'play') return st.turn >= 0 ? [st.turn] : [];
      if (st.phase === 'payout') {
        // Everyone who played the round acknowledges — including players the
        // round just bankrupted (their bank may now be below the minimum).
        return st.results.map((r, i) => r && !st.ready[i] ? i : null).filter(v => v != null);
      }
      return [];
    },
    // Timed table states (the lobby calls tick() after pending() ms while
    // nobody is awaited): dealing and the dealer's playout, card by card.
    pending() {
      if (st.phase === 'deal') return DEAL_MS;
      if (st.phase === 'dealer') return DEALER_MS;
      return null;
    },
    tick() {
      if (st.phase === 'deal') {
        const who = st.dealQueue.shift();
        if (who === -1) st.dealer.push(drawCard(st));
        else st.hands[who].push(drawCard(st));
        if (!st.dealQueue.length) { delete st.dealQueue; dealDone(st, n); }
      } else if (st.phase === 'dealer') {
        dealerStep(st, n);
      }
    },
    act(seat, a) {
      if (st.phase === 'bet' && a.t === 'bet') {
        if (st.bets[seat] > 0 || st.done[seat]) return { err: 'Bet already placed' };
        const amt = Math.floor(Number(a.amount));
        if (!(amt >= MIN_BET) || amt > st.bank[seat]) return { err: 'Bad bet amount' };
        st.bets[seat] = amt;
        const waiting = activeSeats(st, n).filter(i => st.bets[i] === 0 && !st.done[i]);
        if (!waiting.length) dealRound(st, n);
        return {};
      }
      if (st.phase === 'play' && seat === st.turn) {
        if (a.t === 'hit') {
          st.hands[seat].push(drawCard(st));
          if (handValue(st.hands[seat]) >= 21) st.done[seat] = true;
          nextPlayTurn(st, n);
          return {};
        }
        if (a.t === 'stand') {
          st.done[seat] = true;
          nextPlayTurn(st, n);
          return {};
        }
        if (a.t === 'double') {
          if (st.hands[seat].length !== 2 || st.bank[seat] < st.bets[seat]) {
            return { err: 'Can’t double now' };
          }
          st.bets[seat] *= 2;
          st.hands[seat].push(drawCard(st));
          st.done[seat] = true;
          nextPlayTurn(st, n);
          return {};
        }
      }
      if (st.phase === 'payout' && a.t === 'next') {
        st.ready[seat] = true;
        if (st.results.every((r, i) => !r || st.ready[i])) startRound(st, n);
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.phase === 'bet') {
        const b = st.bank[seat];
        const amt = Math.max(MIN_BET, Math.min(b, Math.round(b * 0.06 / 10) * 10 || MIN_BET));
        return { t: 'bet', amount: amt };
      }
      if (st.phase === 'play' && st.turn === seat) {
        const v = handValue(st.hands[seat]);
        const up = rv(st.dealer[0]) >= 10 || rank(st.dealer[0]) === 'A' ? 10 : rv(st.dealer[0]);
        const canDouble = st.hands[seat].length === 2 && st.bank[seat] >= st.bets[seat];
        if (canDouble && (v === 10 || v === 11) && up <= 9) return { t: 'double' };
        if (v <= 11) return { t: 'hit' };
        if (v >= 17) return { t: 'stand' };
        return up >= 7 ? { t: 'hit' } : { t: 'stand' };
      }
      if (st.phase === 'payout' && st.results[seat] && !st.ready[seat]) return { t: 'next' };
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const best = Math.max(...st.bank);
      const winners = seats.filter((_, i) => st.bank[i] === best);
      return {
        title: best >= MIN_BET ? `${winners.map(w => w.name).join(' & ')} wins!` : 'The house always wins…',
        lines: seats.map((s, i) => `${s.name}: ${st.bank[i]} chips`),
      };
    },
  };
}

export function create({ seats, options }) {
  const st = {
    bank: seats.map(() => options.bank || 500),
    shoe: [], round: 0,
  };
  startRound(st, seats.length);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
