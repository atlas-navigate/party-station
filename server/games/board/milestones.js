// Milestones — an original life-path board game. Spin the wheel, pick a career,
// collect paydays, hit life's big moments, retire rich in money AND memories.
export const meta = {
  id: 'milestones', name: 'Milestones', tagline: 'Spin through the story of a life', icon: '🛞', emoji: '👶',
  category: 'board', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [],
};

const CAREERS = [
  { name: 'Chef', salary: 35 }, { name: 'Mechanic', salary: 40 },
  { name: 'Musician', salary: 25 }, { name: 'Sales Rep', salary: 30 },
  { name: 'Park Ranger', salary: 30 }, { name: 'Electrician', salary: 45 },
];
const DEGREES = [
  { name: 'Doctor', salary: 90 }, { name: 'Engineer', salary: 80 },
  { name: 'Lawyer', salary: 85 }, { name: 'Scientist', salary: 70 },
  { name: 'Architect', salary: 65 }, { name: 'Professor', salary: 60 },
];
const HOUSES = [
  { name: 'Cozy Cottage', cost: 80, sale: 95 }, { name: 'City Loft', cost: 100, sale: 115 },
  { name: 'Farmhouse', cost: 120, sale: 150 }, { name: 'Beach Bungalow', cost: 160, sale: 200 },
  { name: 'Mountain Cabin', cost: 90, sale: 110 }, { name: 'Modern Villa', cost: 200, sale: 260 },
];
const COLLEGE_DEBT = 50, DEBT_REPAY = 60, TOKEN_VALUE = 20;

const T = (type, text, d = {}) => ({ type, text, ...d });
export const TRACK = [
  T('start', 'The journey begins'),
  T('event', 'Part-time gig pays off', { money: 10 }),
  T('life', 'Adopt a scruffy dog 🐕'),
  T('payday', 'PAYDAY'),
  T('event', 'Phone screen cracks', { money: -5 }),
  T('life', 'Road trip with friends 🚗'),
  T('event', 'Win a chili cook-off', { money: 15 }),
  T('payday', 'PAYDAY'),
  T('event', 'Car needs new brakes', { money: -20 }),
  T('life', 'Run your first marathon 🏃'),
  T('event', 'Tax refund', { money: 25 }),
  T('marriage', '💒 Wedding day! (stop)'),
  T('payday', 'PAYDAY'),
  T('event', 'Honeymoon splurge', { money: -30 }),
  T('life', 'Plant a garden 🌻'),
  T('kids', 'A baby arrives 👶'),
  T('payday', 'PAYDAY'),
  T('event', 'Kitchen floods', { money: -25 }),
  T('life', 'Family camping trip ⛺'),
  T('house', '🏠 Time to buy a home (stop)'),
  T('event', 'Side hustle takes off', { money: 30 }),
  T('payday', 'PAYDAY'),
  T('kids', 'Twins!? 👶👶'),
  T('event', 'Roof repairs', { money: -35 }),
  T('life', 'Coach the little league 🥎'),
  T('payday', 'PAYDAY'),
  T('event', 'Inheritance from great-aunt', { money: 40 }),
  T('life', 'Learn to paint 🎨'),
  T('event', 'Stock tip goes bad', { money: -30 }),
  T('payday', 'PAYDAY'),
  T('life', 'Grandkids visit 👵'),
  T('event', 'Win the county fair bake-off', { money: 10 }),
  T('event', 'Medical bills', { money: -20 }),
  T('payday', 'PAYDAY'),
  T('life', 'Write your memoirs 📖'),
  T('event', 'Antique turns out valuable', { money: 35 }),
  T('payday', 'PAYDAY'),
  T('life', 'World cruise 🚢'),
  T('event', 'Spoil the grandkids', { money: -15 }),
  T('retire', '🌅 Retirement!'),
];

const draw2 = deck => {
  const a = Math.floor(Math.random() * deck.length);
  let b = Math.floor(Math.random() * (deck.length - 1));
  if (b >= a) b++;
  return [deck[a], deck[b]];
};

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 8) st.log.shift();
}

function activeSeats(st) {
  return st.pos.map((_, i) => i).filter(i => !st.retired[i]);
}

function retire(st, seats, seat) {
  st.retired[seat] = true;
  let total = st.cash[seat];
  if (st.house[seat]) total += st.house[seat].sale;
  total += st.tokens[seat] * TOKEN_VALUE;
  total += st.kids[seat] * 10;
  if (st.college[seat]) total -= DEBT_REPAY;
  st.final[seat] = total;
  log(st, `${seats[seat].name} retires with ${total}k!`);
  if (activeSeats(st).length === 0) st.phase = 'over';
}

function nextTurn(st) {
  const act = activeSeats(st);
  if (!act.length) { st.phase = 'over'; return; }
  let i = st.turn;
  do { i = (i + 1) % st.pos.length; } while (st.retired[i]);
  st.turn = i;
  st.step = st.career[i] ? 'spin' : 'path';
}

function resolveTile(st, seats, seat) {
  const tile = TRACK[st.pos[seat]];
  switch (tile.type) {
    case 'event': {
      st.cash[seat] += tile.money;
      log(st, `${seats[seat].name}: ${tile.text} (${tile.money > 0 ? '+' : ''}${tile.money}k)`);
      break;
    }
    case 'life':
      st.tokens[seat]++;
      log(st, `${seats[seat].name}: ${tile.text} (+1 memory)`);
      break;
    case 'payday':
      st.cash[seat] += st.career[seat].salary;
      log(st, `${seats[seat].name} payday: +${st.career[seat].salary}k`);
      break;
    case 'marriage':
      if (!st.married[seat]) {
        st.married[seat] = true;
        st.tokens[seat]++;
        st.cash[seat] += 10;
        log(st, `${seats[seat].name} gets married! 💍 (+10k in gifts)`);
      }
      break;
    case 'kids':
      st.kids[seat] += tile.text.includes('Twins') ? 2 : 1;
      st.tokens[seat]++;
      log(st, `${seats[seat].name}: ${tile.text}`);
      break;
    case 'house':
      if (!st.house[seat]) {
        st.pendingHouses = draw2(HOUSES);
        st.step = 'house';
        return; // wait for the pick
      }
      break;
    case 'retire':
      retire(st, seats, seat);
      break;
  }
  if (st.phase === 'play') nextTurn(st);
}

function make(seats, options, st) {
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, turn: st.turn, step: st.step,
        track: TRACK.map(t => ({ type: t.type, text: t.text })),
        pos: st.pos, cash: st.cash, tokens: st.tokens, kids: st.kids,
        married: st.married, retired: st.retired, college: st.college,
        career: st.career, house: st.house, final: st.final,
        lastSpin: st.lastSpin, log: st.log,
        pendingCareers: st.step === 'career' ? st.pendingCareers : null,
        pendingHouses: st.step === 'house' ? st.pendingHouses : null,
      };
    },
    priv() { return {}; },
    awaiting() { return st.phase === 'play' ? [st.turn] : []; },
    act(seat, a) {
      if (st.phase !== 'play' || seat !== st.turn) return { err: 'Not your turn' };
      if (st.step === 'path' && a.t === 'path') {
        st.college[seat] = a.college === true;
        if (st.college[seat]) {
          st.cash[seat] -= 0; // tuition is a loan, repaid at retirement
          st.pendingCareers = draw2(DEGREES);
          log(st, `${seats[seat].name} heads to college 🎓 (student loan: ${COLLEGE_DEBT}k)`);
        } else {
          st.pendingCareers = draw2(CAREERS);
          log(st, `${seats[seat].name} jumps straight into work 💼`);
        }
        st.step = 'career';
        return {};
      }
      if (st.step === 'career' && a.t === 'career') {
        const pick = st.pendingCareers[a.i];
        if (!pick) return { err: 'Pick one of the two cards' };
        st.career[seat] = pick;
        st.pendingCareers = null;
        log(st, `${seats[seat].name} becomes a ${pick.name} (${pick.salary}k salary)`);
        st.step = 'spin';
        return {};
      }
      if (st.step === 'house' && a.t === 'house') {
        if (a.i === -1) {
          log(st, `${seats[seat].name} keeps renting`);
        } else {
          const pick = st.pendingHouses[a.i];
          if (!pick) return { err: 'Pick a house or skip' };
          st.house[seat] = pick;
          st.cash[seat] -= pick.cost;
          log(st, `${seats[seat].name} buys the ${pick.name} (-${pick.cost}k)`);
        }
        st.pendingHouses = null;
        nextTurn(st);
        return {};
      }
      if (st.step === 'spin' && a.t === 'spin') {
        const spin = 1 + Math.floor(Math.random() * 10);
        st.lastSpin = { seat, value: spin };
        let landed = st.pos[seat];
        // Move tile by tile so paydays are collected and stop-tiles halt you.
        for (let i = 0; i < spin; i++) {
          if (landed >= TRACK.length - 1) break;
          landed++;
          const t = TRACK[landed];
          if (t.type === 'payday' && i < spin - 1 && st.career[seat]) {
            st.cash[seat] += st.career[seat].salary;
            log(st, `${seats[seat].name} passes PAYDAY: +${st.career[seat].salary}k`);
          }
          if ((t.type === 'marriage' && !st.married[seat])
            || (t.type === 'house' && !st.house[seat])) break; // stop tiles
        }
        st.pos[seat] = landed;
        resolveTile(st, seats, seat);
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.step === 'path') return { t: 'path', college: Math.random() < 0.55 };
      if (st.step === 'career') {
        const [a, b] = st.pendingCareers;
        return { t: 'career', i: b.salary > a.salary ? 1 : 0 };
      }
      if (st.step === 'house') {
        const afford = st.pendingHouses
          .map((h, i) => ({ h, i }))
          .filter(x => x.h.cost <= st.cash[seat] + 40);
        if (!afford.length) return { t: 'house', i: -1 };
        afford.sort((x, y) => (y.h.sale - y.h.cost) - (x.h.sale - x.h.cost));
        return { t: 'house', i: afford[0].i };
      }
      if (st.step === 'spin') return { t: 'spin' };
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const best = Math.max(...st.final);
      const winners = seats.filter((_, i) => st.final[i] === best);
      return {
        title: `${winners.map(w => w.name).join(' & ')} lived their best life!`,
        lines: seats.map((s, i) => `${s.name}: ${st.final[i]}k (${st.tokens[i]} memories, ${st.kids[i]} kids)`),
      };
    },
  };
}

export function create({ seats }) {
  const n = seats.length;
  const st = {
    phase: 'play', turn: 0, step: 'path',
    pos: seats.map(() => 0), cash: seats.map(() => 20),
    tokens: seats.map(() => 0), kids: seats.map(() => 0),
    married: seats.map(() => false), retired: seats.map(() => false),
    college: seats.map(() => false), career: seats.map(() => null),
    house: seats.map(() => null), final: seats.map(() => 0),
    pendingCareers: null, pendingHouses: null,
    lastSpin: null, log: [],
  };
  return make(seats, {}, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
