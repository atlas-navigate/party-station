// Candy Dash — an original color-race board game for all ages. Draw a card,
// dash to that color. Watch out for sticky taffy, ride the shortcut bridges,
// and be first to the Sugar Castle!
export const meta = {
  id: 'candydash', name: 'Candy Dash', tagline: 'First one to the Sugar Castle', icon: '🍭', emoji: '🍬',
  category: 'board', mode: 'server',
  minPlayers: 2, maxPlayers: 6, saveable: true,
  options: [],
};

const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
export const SPACES = [];
for (let i = 0; i < 54; i++) SPACES.push({ color: COLORS[i % 6] });
SPACES[13].sticky = true; SPACES[26].sticky = true; SPACES[39].sticky = true;
SPACES[7].bridgeTo = 16; SPACES[29].bridgeTo = 38;
const TREATS = [
  { at: 9, name: 'Gumdrop Grove', icon: '🍬' },
  { at: 22, name: 'Lollipop Lake', icon: '🍭' },
  { at: 35, name: 'Fudge Falls', icon: '🍫' },
  { at: 47, name: 'Sprinkle Summit', icon: '🧁' },
];
for (const t of TREATS) SPACES[t.at].treat = t.name;
const GOAL = SPACES.length; // reaching (or passing) this wins

function freshDeck() {
  const deck = [];
  for (const color of COLORS) {
    for (let i = 0; i < 5; i++) deck.push({ color });
    deck.push({ color, double: true }, { color, double: true });
  }
  for (const t of TREATS) deck.push({ treat: t.at, name: t.name, icon: t.icon });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 6) st.log.shift();
}

function nextColorSpace(from, color, times) {
  let p = from;
  for (let t = 0; t < times; t++) {
    p++;
    while (p < GOAL && SPACES[p].color !== color) p++;
    if (p >= GOAL) return GOAL;
  }
  return p;
}

function make(seats, options, st) {
  const n = seats.length;
  return {
    state: st,
    pub() {
      return {
        phase: st.phase, turn: st.turn,
        spaces: SPACES, treats: TREATS,
        pos: st.pos, stuck: st.stuck,
        lastCard: st.lastCard, deckCount: st.deck.length,
        log: st.log, winner: st.winner,
      };
    },
    priv() { return {}; },
    awaiting() { return st.phase === 'play' ? [st.turn] : []; },
    act(seat, a) {
      if (st.phase !== 'play' || seat !== st.turn) return { err: 'Not your turn' };
      if (a.t !== 'draw') return { err: 'Invalid action' };
      if (st.stuck[seat]) {
        st.stuck[seat] = false;
        st.lastCard = { stuckSkip: true };
        log(st, `${seats[seat].name} is stuck in taffy — turn skipped! 🍯`);
        st.turn = (st.turn + 1) % n;
        return {};
      }
      if (!st.deck.length) st.deck = freshDeck();
      const card = st.deck.pop();
      st.lastCard = card;
      let to;
      if (card.treat != null) {
        to = card.treat;
        log(st, `${seats[seat].name} drew ${card.name}! ${card.icon}`);
      } else {
        to = nextColorSpace(st.pos[seat], card.color, card.double ? 2 : 1);
        log(st, `${seats[seat].name} dashes to ${card.color}${card.double ? ' (double!)' : ''}`);
      }
      if (to >= GOAL) {
        st.pos[seat] = GOAL;
        st.winner = seat;
        st.phase = 'over';
        log(st, `${seats[seat].name} reaches the Sugar Castle! 🏰`);
        return {};
      }
      if (SPACES[to].bridgeTo) {
        log(st, `${seats[seat].name} takes the shortcut bridge! 🌉`);
        to = SPACES[to].bridgeTo;
      }
      if (SPACES[to].sticky) {
        st.stuck[seat] = true;
        log(st, `${seats[seat].name} landed in sticky taffy! 🍯`);
      }
      st.pos[seat] = to;
      st.turn = (st.turn + 1) % n;
      return {};
    },
    botAct() { return { t: 'draw' }; },
    over() {
      if (st.phase !== 'over') return null;
      return {
        title: `${seats[st.winner].name} reached the Sugar Castle! 🏰`,
        lines: [],
      };
    },
  };
}

export function create({ seats }) {
  const st = {
    phase: 'play', turn: 0,
    pos: seats.map(() => -1), // -1 = start, before the first space
    stuck: seats.map(() => false),
    deck: freshDeck(), lastCard: null, log: [], winner: -1,
  };
  return make(seats, {}, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
