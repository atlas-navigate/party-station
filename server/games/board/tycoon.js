// Tycoon Trail — an original property-trading board game. Roll, buy streets,
// complete districts, build up to skyscrapers, and bankrupt your friends.
export const meta = {
  id: 'tycoon', name: 'Tycoon Trail', tagline: 'Buy the whole town', icon: '🏙️', emoji: '🎩',
  category: 'board', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [
    { key: 'cash', label: 'Starting cash', type: 'select', def: 1500,
      choices: [{ v: 1000, label: '1000' }, { v: 1500, label: '1500' }, { v: 2500, label: '2500' }] },
    { key: 'rounds', label: 'Game length', type: 'select', def: 0,
      choices: [{ v: 0, label: 'Last tycoon standing' }, { v: 20, label: '20 rounds (richest wins)' }, { v: 40, label: '40 rounds' }] },
  ],
};

const G = (name, group, price, tier) => ({ type: 'street', name, group, price, tier });
export const BOARD = [
  { type: 'start', name: 'START' },
  G('Mudflat Lane', 'brown', 60, 0), { type: 'fund', name: 'City Fund' },
  G('Gravel Row', 'brown', 60, 0), { type: 'tax', name: 'Income Tax', amount: 150 },
  { type: 'transit', name: 'North Station', price: 200 },
  G('Breeze Street', 'sky', 100, 0), { type: 'fortune', name: 'Fortune' },
  G('Seagull Avenue', 'sky', 100, 0), G('Pier Road', 'sky', 120, 0),
  { type: 'lockup', name: 'Lockup' },
  G('Tulip Terrace', 'pink', 140, 1), { type: 'utility', name: 'Power Plant', price: 150 },
  G('Rosebud Blvd', 'pink', 140, 1), G('Orchid Way', 'pink', 160, 1),
  { type: 'transit', name: 'East Station', price: 200 },
  G('Foundry Street', 'orange', 180, 1), { type: 'fund', name: 'City Fund' },
  G('Market Row', 'orange', 180, 1), G('Depot Drive', 'orange', 200, 1),
  { type: 'plaza', name: 'The Plaza' },
  G('Neon Alley', 'red', 220, 2), { type: 'fortune', name: 'Fortune' },
  G('Cinema Strip', 'red', 220, 2), G('Arcade Avenue', 'red', 240, 2),
  { type: 'transit', name: 'South Station', price: 200 },
  G('Sunbeam Blvd', 'yellow', 260, 2), G('Gold Coast Road', 'yellow', 260, 2),
  { type: 'utility', name: 'Water Plant', price: 150 }, G('Amber Court', 'yellow', 280, 2),
  { type: 'busted', name: 'Busted!' },
  G('Cedar Heights', 'green', 300, 3), G('Maple Crest', 'green', 300, 3),
  { type: 'fund', name: 'City Fund' }, G('Oakwood Hill', 'green', 320, 3),
  { type: 'transit', name: 'West Station', price: 200 }, { type: 'fortune', name: 'Fortune' },
  G('Skyview Terrace', 'navy', 350, 3), { type: 'tax', name: 'Luxury Tax', amount: 100 },
  G('Grand Summit', 'navy', 400, 3),
];
const UPGRADE_COST = [50, 100, 150, 200]; // by tier
const SALARY = 200, LOCK_FINE = 50, MAX_LEVEL = 4;

const CARDS = [
  { text: 'Tax refund! Collect 100.', money: 100 },
  { text: 'You win a talent show. Collect 50.', money: 50 },
  { text: 'Parking fines. Pay 40.', money: -40 },
  { text: 'Street repairs: pay 25 per building you own.', repairs: 25 },
  { text: 'Ride the rails: advance to North Station.', goto: 5 },
  { text: 'Head downtown: advance to START and collect salary.', goto: 0 },
  { text: 'Caught jaywalking. Go to Lockup!', lockup: true },
  { text: 'Your startup IPOs! Collect 150.', money: 150 },
  { text: 'Charity gala: pay every player 15.', payEach: 15 },
  { text: 'It’s your birthday: collect 20 from every player.', collectEach: 20 },
  { text: 'Take a wrong turn: go back 3 spaces.', back: 3 },
  { text: 'Utility bill spike. Pay 75.', money: -75 },
];

function rent(st, idx, roll) {
  const sp = BOARD[idx];
  const owner = st.owner[idx];
  if (sp.type === 'street') {
    const base = Math.round(sp.price * 0.08);
    const lvl = st.level[idx] || 0;
    if (lvl === 0) {
      return ownsGroup(st, owner, sp.group) ? base * 2 : base;
    }
    return base * [1, 5, 14, 28, 40][lvl];
  }
  if (sp.type === 'transit') {
    const count = BOARD.filter((b, i) => b.type === 'transit' && st.owner[i] === owner).length;
    return 25 * Math.pow(2, count - 1);
  }
  if (sp.type === 'utility') {
    const count = BOARD.filter((b, i) => b.type === 'utility' && st.owner[i] === owner).length;
    return roll * (count === 2 ? 10 : 4);
  }
  return 0;
}

function ownsGroup(st, seat, group) {
  return BOARD.every((b, i) => b.group !== group || st.owner[i] === seat);
}

function netWorth(st, seat) {
  let w = st.cash[seat];
  for (const i in st.owner) {
    if (st.owner[i] === seat) {
      w += BOARD[i].price + (st.level[i] || 0) * UPGRADE_COST[BOARD[i].tier ?? 0];
    }
  }
  return w;
}

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 8) st.log.shift();
}

function alive(st) { return st.out.map((o, i) => !o && i).filter(v => v !== false); }

// Pay `amt` from seat to another seat (or the bank if to==null), selling
// buildings automatically and going bankrupt if it still can't be covered.
function pay(st, seats, from, to, amt) {
  while (st.cash[from] < amt) {
    const owned = Object.keys(st.owner).map(Number)
      .filter(i => st.owner[i] === from && (st.level[i] || 0) > 0);
    if (!owned.length) break;
    const i = owned[0];
    st.level[i]--;
    st.cash[from] += Math.floor(UPGRADE_COST[BOARD[i].tier] / 2);
    log(st, `${seats[from].name} sells a building on ${BOARD[i].name}`);
  }
  if (st.cash[from] >= amt) {
    st.cash[from] -= amt;
    if (to != null) st.cash[to] += amt;
    return true;
  }
  // Bankrupt: everything goes to the creditor (or back to the bank).
  const remaining = st.cash[from];
  st.cash[from] = 0;
  if (to != null) st.cash[to] += remaining;
  for (const i of Object.keys(st.owner).map(Number)) {
    if (st.owner[i] === from) {
      if (to != null) st.owner[i] = to;
      else { delete st.owner[i]; st.level[i] = 0; }
    }
  }
  st.out[from] = true;
  log(st, `${seats[from].name} is bankrupt!`);
  if (alive(st).length <= 1) st.phase = 'over';
  else if (from === st.turn) nextTurn(st); // never leave the game waiting on a bankrupt player
  return false;
}

function drawCard(st, seats, seat, kind) {
  const idx = Math.floor(Math.random() * CARDS.length);
  const card = CARDS[idx];
  st.lastCard = { kind, text: card.text, seat };
  log(st, `${seats[seat].name}: ${card.text}`);
  if (card.money != null) {
    if (card.money >= 0) st.cash[seat] += card.money;
    else pay(st, seats, seat, null, -card.money);
  }
  if (card.repairs) {
    const buildings = Object.keys(st.level).map(Number)
      .filter(i => st.owner[i] === seat).reduce((a, i) => a + (st.level[i] || 0), 0);
    if (buildings) pay(st, seats, seat, null, buildings * card.repairs);
  }
  if (card.payEach) {
    for (const o of alive(st)) if (o !== seat) pay(st, seats, seat, o, card.payEach);
  }
  if (card.collectEach) {
    for (const o of alive(st)) if (o !== seat) pay(st, seats, o, seat, card.collectEach);
  }
  if (card.lockup) sendToLockup(st, seat);
  if (card.back) { st.pos[seat] = (st.pos[seat] - card.back + 40) % 40; landOn(st, seats, seat, 0); }
  if (card.goto != null) {
    if (card.goto <= st.pos[seat]) st.cash[seat] += SALARY;
    st.pos[seat] = card.goto;
    landOn(st, seats, seat, 0);
  }
}

function sendToLockup(st, seat) {
  st.pos[seat] = 10;
  st.inLock[seat] = true;
  st.lockTries[seat] = 0;
  st.doubles = 0;
  st.step = 'end';
}

function landOn(st, seats, seat, roll) {
  const idx = st.pos[seat];
  const sp = BOARD[idx];
  if (sp.type === 'street' || sp.type === 'transit' || sp.type === 'utility') {
    const owner = st.owner[idx];
    if (owner == null) { st.step = 'buy'; st.pendingBuy = idx; return; }
    if (owner !== seat && !st.out[owner]) {
      const due = rent(st, idx, roll);
      log(st, `${seats[seat].name} pays ${due} rent to ${seats[owner].name} (${sp.name})`);
      pay(st, seats, seat, owner, due);
    }
  } else if (sp.type === 'tax') {
    log(st, `${seats[seat].name} pays ${sp.amount} ${sp.name}`);
    pay(st, seats, seat, null, sp.amount);
  } else if (sp.type === 'fortune' || sp.type === 'fund') {
    drawCard(st, seats, seat, sp.type);
  } else if (sp.type === 'busted') {
    log(st, `${seats[seat].name} got busted!`);
    sendToLockup(st, seat);
  }
}

function doRoll(st, seats, seat) {
  const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
  st.lastRoll = [d1, d2];
  st.lastCard = null;
  const dbl = d1 === d2;
  if (dbl) st.doubles++; else st.doubles = 0;
  if (st.doubles >= 3) {
    log(st, `${seats[seat].name} rolled three doubles — busted!`);
    sendToLockup(st, seat);
    return;
  }
  const from = st.pos[seat];
  st.pos[seat] = (from + d1 + d2) % 40;
  if (st.pos[seat] < from) {
    st.cash[seat] += SALARY;
    log(st, `${seats[seat].name} passes START (+${SALARY})`);
  }
  st.step = 'end';
  landOn(st, seats, seat, d1 + d2);
  if (st.step === 'end' && dbl && !st.inLock[seat] && !st.out[seat]) st.step = 'rollAgain';
}

function nextTurn(st) {
  st.doubles = 0;
  st.turnCount++;
  const players = alive(st);
  if (st.roundCap && Math.floor(st.turnCount / players.length) >= st.roundCap) {
    st.phase = 'over';
    return;
  }
  let i = st.turn;
  do { i = (i + 1) % st.pos.length; } while (st.out[i]);
  st.turn = i;
  st.step = st.inLock[i] ? 'lockup' : 'roll';
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, turn: st.turn, step: st.step,
        board: BOARD, pos: st.pos, cash: st.cash, out: st.out,
        inLock: st.inLock, owner: st.owner, level: st.level,
        lastRoll: st.lastRoll, lastCard: st.lastCard, pendingBuy: st.pendingBuy,
        log: st.log, upgradeCost: UPGRADE_COST,
        round: Math.floor(st.turnCount / Math.max(1, alive(st).length)) + 1,
        roundCap: st.roundCap || null,
        netWorth: seats.map((_, i) => netWorth(st, i)),
      };
    },
    priv(seat) {
      const buildable = st.turn === seat && (st.step === 'end' || st.step === 'rollAgain')
        ? Object.keys(st.owner).map(Number).filter(i =>
            st.owner[i] === seat && BOARD[i].type === 'street'
            && ownsGroup(st, seat, BOARD[i].group) && (st.level[i] || 0) < MAX_LEVEL
            && st.cash[seat] >= UPGRADE_COST[BOARD[i].tier])
        : [];
      return { buildable };
    },
    awaiting() {
      return st.phase === 'play' && !st.out[st.turn] ? [st.turn] : [];
    },
    act(seat, a) {
      if (st.phase !== 'play' || seat !== st.turn) return { err: 'Not your turn' };
      if (a.t === 'roll' && (st.step === 'roll' || st.step === 'rollAgain')) {
        doRoll(st, seats, seat);
        return {};
      }
      if (st.step === 'lockup') {
        if (a.t === 'payOut') {
          pay(st, seats, seat, null, LOCK_FINE);
          if (!st.out[seat]) { st.inLock[seat] = false; st.step = 'roll'; }
          return {};
        }
        if (a.t === 'rollOut') {
          const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
          st.lastRoll = [d1, d2];
          if (d1 === d2) {
            st.inLock[seat] = false;
            log(st, `${seats[seat].name} rolls doubles and walks free!`);
            st.pos[seat] = (st.pos[seat] + d1 + d2) % 40;
            st.step = 'end';
            landOn(st, seats, seat, d1 + d2);
          } else if (++st.lockTries[seat] >= 3) {
            log(st, `${seats[seat].name} pays the ${LOCK_FINE} fine after 3 tries`);
            pay(st, seats, seat, null, LOCK_FINE);
            if (!st.out[seat]) { st.inLock[seat] = false; st.step = 'roll'; }
          }
          return {};
        }
      }
      if (a.t === 'buy' && st.step === 'buy') {
        const i = st.pendingBuy;
        if (st.cash[seat] >= BOARD[i].price) {
          st.cash[seat] -= BOARD[i].price;
          st.owner[i] = seat;
          log(st, `${seats[seat].name} buys ${BOARD[i].name} for ${BOARD[i].price}`);
        }
        st.pendingBuy = null;
        st.step = st.doubles > 0 ? 'rollAgain' : 'end';
        return {};
      }
      if (a.t === 'pass' && st.step === 'buy') {
        st.pendingBuy = null;
        st.step = st.doubles > 0 ? 'rollAgain' : 'end';
        return {};
      }
      if (a.t === 'build' && (st.step === 'end' || st.step === 'rollAgain')) {
        const i = a.space;
        if (st.owner[i] !== seat || BOARD[i].type !== 'street') return { err: 'Not yours' };
        if (!ownsGroup(st, seat, BOARD[i].group)) return { err: 'You need the whole district' };
        if ((st.level[i] || 0) >= MAX_LEVEL) return { err: 'Maxed out' };
        const cost = UPGRADE_COST[BOARD[i].tier];
        if (st.cash[seat] < cost) return { err: 'Not enough cash' };
        st.cash[seat] -= cost;
        st.level[i] = (st.level[i] || 0) + 1;
        log(st, `${seats[seat].name} builds on ${BOARD[i].name}`);
        return {};
      }
      if (a.t === 'endTurn' && (st.step === 'end' || st.step === 'rollAgain')) {
        if (st.step === 'rollAgain') { st.step = 'roll'; return {}; }
        nextTurn(st);
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.step === 'roll' || st.step === 'rollAgain') return { t: 'roll' };
      if (st.step === 'lockup') {
        return st.cash[seat] > 200 ? { t: 'payOut' } : { t: 'rollOut' };
      }
      if (st.step === 'buy') {
        const price = BOARD[st.pendingBuy].price;
        const buy = st.cash[seat] - price >= 120 || price <= 100;
        return { t: buy && st.cash[seat] >= price ? 'buy' : 'pass' };
      }
      if (st.step === 'end') {
        const b = Object.keys(st.owner).map(Number).filter(i =>
          st.owner[i] === seat && BOARD[i].type === 'street'
          && ownsGroup(st, seat, BOARD[i].group) && (st.level[i] || 0) < MAX_LEVEL
          && st.cash[seat] - UPGRADE_COST[BOARD[i].tier] >= 250);
        if (b.length) return { t: 'build', space: b[0] };
        return { t: 'endTurn' };
      }
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const players = alive(st);
      const winner = players.sort((a, b) => netWorth(st, b) - netWorth(st, a))[0];
      return {
        title: winner != null ? `${seats[winner].name} owns this town!` : 'Game over',
        lines: seats.map((s, i) =>
          `${s.name}: ${st.out[i] ? 'bankrupt' : netWorth(st, i) + ' net worth'}`),
      };
    },
  };
}

export function create({ seats, options }) {
  const n = seats.length;
  const st = {
    phase: 'play', turn: 0, step: 'roll',
    pos: seats.map(() => 0), cash: seats.map(() => options.cash || 1500),
    out: seats.map(() => false), inLock: seats.map(() => false),
    lockTries: seats.map(() => 0),
    owner: {}, level: {}, doubles: 0, lastRoll: null, lastCard: null,
    pendingBuy: null, log: [], turnCount: 0, roundCap: options.rounds || 0,
  };
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
