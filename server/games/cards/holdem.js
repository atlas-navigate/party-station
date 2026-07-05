// Texas Hold'em — no-limit cash-style table. Blinds, side pots, showdowns.
// Play continues until one player has all the chips (or the host quits, which
// saves everyone's stacks for next time).
import { freshDeck, evaluate, cmpEval, HAND_NAMES, rank, suit, rv } from './util.js';

export const meta = {
  id: 'holdem', name: "Texas Hold'em", tagline: 'No-limit poker night', icon: '🤠', emoji: '🎰',
  category: 'cards', mode: 'server',
  minPlayers: 2, maxPlayers: 8, saveable: true,
  options: [
    { key: 'stack', label: 'Starting stack', type: 'select', def: 1000,
      choices: [{ v: 500, label: '500' }, { v: 1000, label: '1000' }, { v: 2000, label: '2000' }] },
    { key: 'bb', label: 'Big blind', type: 'select', def: 20,
      choices: [{ v: 10, label: '10' }, { v: 20, label: '20' }, { v: 50, label: '50' }] },
  ],
};

const live = st => st.stacks.map((s, i) => i).filter(i => !st.busted[i]);

function startHand(st) {
  const players = live(st);
  if (players.length < 2) { st.phase = 'over'; return; }
  st.handNum++;
  do { st.button = (st.button + 1) % st.stacks.length; } while (st.busted[st.button]);
  st.deck = freshDeck();
  st.board = [];
  st.holes = st.stacks.map(() => null);
  st.inHand = st.stacks.map((_, i) => !st.busted[i]);
  st.allin = st.stacks.map(() => false);
  st.committed = st.stacks.map(() => 0);
  st.total = st.stacks.map(() => 0);
  st.acted = st.stacks.map(() => false);
  st.results = null;
  st.street = 0;
  st.phase = 'hand';
  for (const i of players) st.holes[i] = [st.deck.pop(), st.deck.pop()];

  const headsUp = players.length === 2;
  const sbSeat = headsUp ? st.button : nextLive(st, st.button);
  const bbSeat = nextLive(st, sbSeat);
  postBlind(st, sbSeat, st.sb);
  postBlind(st, bbSeat, st.bb);
  st.currentBet = st.bb;
  st.minRaise = st.bb;
  st.turn = nextLive(st, bbSeat);
  checkStreetEnd(st);
}

function nextLive(st, from) {
  const n = st.stacks.length;
  for (let i = 1; i <= n; i++) {
    const s = (from + i) % n;
    if (st.inHand[s] && !st.allin[s]) return s;
  }
  return -1;
}

function postBlind(st, seat, amt) {
  const pay = Math.min(amt, st.stacks[seat]);
  st.stacks[seat] -= pay;
  st.committed[seat] += pay;
  st.total[seat] += pay;
  if (st.stacks[seat] === 0) st.allin[seat] = true;
}

function pot(st) { return st.total.reduce((a, b) => a + b, 0); }

function needsAction(st, s) {
  return st.inHand[s] && !st.allin[s]
    && (!st.acted[s] || st.committed[s] < st.currentBet);
}

function checkStreetEnd(st) {
  const remaining = st.inHand.map((v, i) => v && i).filter(v => v !== false);
  if (remaining.length === 1) { awardUncontested(st, remaining[0]); return; }
  const pending = remaining.filter(s => needsAction(st, s));
  if (pending.length) {
    if (st.turn < 0 || !needsAction(st, st.turn)) {
      // advance to the next player who owes action
      let s = st.turn < 0 ? st.button : st.turn;
      const n = st.stacks.length;
      for (let i = 1; i <= n; i++) {
        const cand = (s + i) % n;
        if (needsAction(st, cand)) { st.turn = cand; return; }
      }
    }
    return;
  }
  nextStreet(st);
}

function nextStreet(st) {
  st.committed = st.stacks.map(() => 0);
  st.acted = st.stacks.map(() => false);
  st.currentBet = 0;
  st.minRaise = st.bb;
  if (st.street === 0) st.board.push(st.deck.pop(), st.deck.pop(), st.deck.pop());
  else if (st.street < 3) st.board.push(st.deck.pop());
  else { showdown(st); return; }
  st.street++;
  // If betting is settled for good (everyone all-in), run out the board.
  const canAct = st.inHand.map((v, i) => v && !st.allin[i] && i).filter(v => v !== false);
  if (canAct.length <= 1) { nextStreet(st); return; }
  st.turn = nextLive(st, st.button);
}

function awardUncontested(st, winner) {
  st.stacks[winner] += pot(st);
  st.results = {
    board: st.board, pots: [{ amount: pot(st), winners: [winner] }],
    shown: {}, note: 'uncontested',
  };
  finishHand(st);
}

function showdown(st) {
  const contenders = st.inHand.map((v, i) => v && i).filter(v => v !== false);
  const evals = {};
  const shown = {};
  for (const s of contenders) {
    evals[s] = evaluate([...st.holes[s], ...st.board]);
    shown[s] = { cards: st.holes[s], name: HAND_NAMES[evals[s][0]] };
  }
  // Side pots: layer by commitment level.
  const levels = [...new Set(st.total.filter(t => t > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (let i = 0; i < st.total.length; i++) {
      amount += Math.max(0, Math.min(st.total[i], lv) - prev);
    }
    const eligible = contenders.filter(s => st.total[s] >= lv);
    if (amount > 0 && eligible.length) {
      let best = null;
      let winners = [];
      for (const s of eligible) {
        if (!best || cmpEval(evals[s], best) > 0) { best = evals[s]; winners = [s]; }
        else if (cmpEval(evals[s], best) === 0) winners.push(s);
      }
      const share = Math.floor(amount / winners.length);
      let leftover = amount - share * winners.length;
      for (const w of winners) st.stacks[w] += share + (leftover-- > 0 ? 1 : 0);
      const merged = pots.length && String(pots[pots.length - 1].winners) === String(winners)
        ? pots[pots.length - 1] : null;
      if (merged) merged.amount += amount;
      else pots.push({ amount, winners });
    }
    prev = lv;
  }
  st.results = { board: st.board, pots, shown };
  finishHand(st);
}

function finishHand(st) {
  for (let i = 0; i < st.stacks.length; i++) {
    if (!st.busted[i] && st.stacks[i] === 0) st.busted[i] = true;
  }
  st.phase = 'payout';
  st.ready = st.stacks.map(() => false);
  st.turn = -1;
}

// --- bot brains ------------------------------------------------------------

function preflopStrength(hole) {
  const [a, b] = hole.map(rv).sort((x, y) => y - x);
  let s = (a + b) / 28;
  if (a === b) s += 0.35 + a / 40;
  if (suit(hole[0]) === suit(hole[1])) s += 0.06;
  if (Math.abs(a - b) === 1) s += 0.05;
  if (a >= 13 && b >= 11) s += 0.12;
  return Math.min(1, s);
}

function postflopStrength(st, seat) {
  const my = evaluate([...st.holes[seat], ...st.board]);
  let s = my[0] / 8 + 0.12;
  if (my[0] === 1) {
    const usesHole = st.holes[seat].some(c => rv(c) === my[1]);
    s = usesHole ? 0.3 + my[1] / 50 : 0.16; // our pair vs. a paired board
  } else if (my[0] === 0) {
    s = Math.max(0.05, (my[1] - 6) / 30);
  }
  return Math.min(1, s);
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, street: st.street, turn: st.turn, handNum: st.handNum,
        button: st.button, sb: st.sb, bb: st.bb,
        stacks: st.stacks, busted: st.busted,
        board: st.board, pot: pot(st),
        committed: st.committed, currentBet: st.currentBet,
        inHand: st.inHand, allin: st.allin,
        results: st.results,
      };
    },
    priv(seat) {
      const toCall = Math.max(0, st.currentBet - (st.committed[seat] || 0));
      return {
        hole: st.holes?.[seat] || null,
        toCall: Math.min(toCall, st.stacks[seat]),
        minRaiseTo: st.currentBet + st.minRaise,
        yourTurn: st.phase === 'hand' && st.turn === seat,
      };
    },
    awaiting() {
      if (st.phase === 'hand') return st.turn >= 0 ? [st.turn] : [];
      if (st.phase === 'payout') {
        return live(st).filter(i => !st.ready[i]);
      }
      return [];
    },
    act(seat, a) {
      if (st.phase === 'payout' && a.t === 'next') {
        st.ready[seat] = true;
        if (live(st).every(i => st.ready[i])) startHand(st);
        return {};
      }
      if (st.phase !== 'hand' || seat !== st.turn) return { err: 'Not your turn' };
      const toCall = st.currentBet - st.committed[seat];
      if (a.t === 'fold') {
        st.inHand[seat] = false;
        st.acted[seat] = true;
      } else if (a.t === 'check') {
        if (toCall > 0) return { err: 'You must call, raise or fold' };
        st.acted[seat] = true;
      } else if (a.t === 'call') {
        const pay = Math.min(toCall, st.stacks[seat]);
        st.stacks[seat] -= pay;
        st.committed[seat] += pay;
        st.total[seat] += pay;
        if (st.stacks[seat] === 0) st.allin[seat] = true;
        st.acted[seat] = true;
      } else if (a.t === 'raise') {
        const to = Math.floor(Number(a.to));
        const maxTo = st.committed[seat] + st.stacks[seat];
        if (!(to > st.currentBet)) return { err: 'Raise must exceed the current bet' };
        if (to < st.currentBet + st.minRaise && to !== maxTo) {
          return { err: `Minimum raise is to ${st.currentBet + st.minRaise}` };
        }
        const target = Math.min(to, maxTo);
        const pay = target - st.committed[seat];
        st.stacks[seat] -= pay;
        st.committed[seat] = target;
        st.total[seat] += pay;
        if (st.stacks[seat] === 0) st.allin[seat] = true;
        if (target - st.currentBet >= st.minRaise) st.minRaise = target - st.currentBet;
        st.currentBet = target;
        for (let i = 0; i < n; i++) if (i !== seat) st.acted[i] = false;
        st.acted[seat] = true;
      } else return { err: 'Invalid action' };
      st.turn = -1;
      checkStreetEnd(st);
      return {};
    },
    botAct(seat) {
      if (st.phase === 'payout') return { t: 'next' };
      if (st.phase !== 'hand' || st.turn !== seat) return null;
      const toCall = st.currentBet - st.committed[seat];
      const strength = st.street === 0
        ? preflopStrength(st.holes[seat]) : postflopStrength(st, seat);
      const r = Math.random();
      const potNow = pot(st);
      const raiseTo = Math.min(
        st.committed[seat] + st.stacks[seat],
        Math.max(st.currentBet + st.minRaise,
          Math.round((st.currentBet + potNow * 0.6) / st.bb) * st.bb));
      const canRaise = raiseTo > st.currentBet; // short stacks can only call
      if (toCall <= 0) {
        if (canRaise && (strength > 0.62 || (strength > 0.4 && r < 0.25) || r < 0.06)) {
          return { t: 'raise', to: raiseTo };
        }
        return { t: 'check' };
      }
      const odds = toCall / (potNow + toCall);
      if (canRaise && strength > 0.8 && r < 0.7) return { t: 'raise', to: raiseTo };
      if (strength + 0.08 > odds * 1.4 || toCall <= st.bb) return { t: 'call' };
      if (r < 0.05) return { t: 'call' }; // sticky sometimes
      return { t: 'fold' };
    },
    over() {
      if (st.phase !== 'over') return null;
      const alive = live(st);
      const champ = alive.length
        ? seats[alive.sort((a, b) => st.stacks[b] - st.stacks[a])[0]] : null;
      return {
        title: champ ? `${champ.name} takes the table!` : 'Game over',
        lines: seats.map((s, i) => `${s.name}: ${st.stacks[i]} chips${st.busted[i] ? ' (busted)' : ''}`),
      };
    },
  };
}

export function create({ seats, options }) {
  const st = {
    stacks: seats.map(() => options.stack || 1000),
    busted: seats.map(() => false),
    button: -1, handNum: 0,
    bb: options.bb || 20, sb: Math.floor((options.bb || 20) / 2),
  };
  startHand(st);
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
