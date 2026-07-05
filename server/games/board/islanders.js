// Islanders — an original island-settlement strategy game. Settle a hex island,
// harvest resources on dice rolls, build roads and towns, dodge the bandit,
// and race to 10 victory points.
export const meta = {
  id: 'islanders', name: 'Islanders', tagline: 'Settle, trade, build to 10 points', icon: '🏝️', emoji: '⛵',
  category: 'board', mode: 'server',
  minPlayers: 3, maxPlayers: 4, saveable: true,
  options: [],
};

export const RES = ['wood', 'brick', 'wool', 'grain', 'ore'];
const COST = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
};
const DOTS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const WIN_VP = 10;

// ---------------------------------------------------------------- board gen

function buildBoard() {
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const resources = shuffle([
    'wood', 'wood', 'wood', 'wood', 'wool', 'wool', 'wool', 'wool',
    'grain', 'grain', 'grain', 'grain', 'brick', 'brick', 'brick',
    'ore', 'ore', 'ore', 'desert']);
  const numbers = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);

  const hexes = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2) continue;
      hexes.push({ q, r, res: resources[hexes.length], num: 0, x: q + r / 2, y: r * 0.866 });
    }
  }
  let ni = 0;
  for (const h of hexes) h.num = h.res === 'desert' ? 0 : numbers[ni++];

  // Vertices: hex corners merged by rounded position.
  const verts = [];
  const vIndex = new Map();
  const vertAt = (x, y) => {
    const key = `${Math.round(x * 1000)}_${Math.round(y * 1000)}`;
    if (!vIndex.has(key)) {
      vIndex.set(key, verts.length);
      verts.push({ x: +x.toFixed(3), y: +y.toFixed(3), hexes: [], adjV: [], adjE: [] });
    }
    return vIndex.get(key);
  };
  const edges = [];
  const eIndex = new Map();
  const edgeBetween = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (!eIndex.has(key)) {
      eIndex.set(key, edges.length);
      edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
      verts[a].adjV.push(b); verts[b].adjV.push(a);
      verts[a].adjE.push(eIndex.get(key)); verts[b].adjE.push(eIndex.get(key));
    }
    return eIndex.get(key);
  };
  const R = 0.577; // hex corner radius so neighbours share corners (1/sqrt(3))
  hexes.forEach((h, hi) => {
    h.verts = [];
    for (let k = 0; k < 6; k++) {
      const ang = Math.PI / 180 * (60 * k - 30);
      const v = vertAt(h.x + R * Math.cos(ang), h.y + R * Math.sin(ang));
      h.verts.push(v);
      if (!verts[v].hexes.includes(hi)) verts[v].hexes.push(hi);
    }
    for (let k = 0; k < 6; k++) edgeBetween(h.verts[k], h.verts[(k + 1) % 6]);
  });
  const bandit = hexes.findIndex(h => h.res === 'desert');
  return { hexes, verts, edges, bandit };
}

// ---------------------------------------------------------------- helpers

const total = res => RES.reduce((a, k) => a + (res[k] || 0), 0);

function canAfford(res, cost) {
  return Object.entries(cost).every(([k, v]) => (res[k] || 0) >= v);
}

function payCost(res, cost) {
  for (const [k, v] of Object.entries(cost)) res[k] -= v;
}

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 8) st.log.shift();
}

function legalSettlementVerts(st, seat, needRoad) {
  const B = st.board;
  return B.verts.map((v, vi) => vi).filter(vi => {
    if (st.builds[vi]) return false;
    if (B.verts[vi].adjV.some(w => st.builds[w])) return false; // distance rule
    if (needRoad) {
      return B.verts[vi].adjE.some(e => st.roads[e] === seat);
    }
    return true;
  });
}

function legalRoadEdges(st, seat, anchorVert = null) {
  const B = st.board;
  return B.edges.map((e, ei) => ei).filter(ei => {
    if (st.roads[ei] !== undefined) return false;
    const { a, b } = B.edges[ei];
    if (anchorVert != null) return a === anchorVert || b === anchorVert;
    const touchesOwn = v =>
      (st.builds[v] && st.builds[v].seat === seat)
      || (!st.builds[v] && B.verts[v].adjE.some(e2 => st.roads[e2] === seat));
    return touchesOwn(a) || touchesOwn(b);
  });
}

function longestRoadFor(st, seat) {
  const B = st.board;
  const mine = Object.keys(st.roads).map(Number).filter(e => st.roads[e] === seat);
  const adj = {};
  for (const ei of mine) {
    const { a, b } = B.edges[ei];
    (adj[a] ||= []).push([b, ei]);
    (adj[b] ||= []).push([a, ei]);
  }
  const blocked = v => st.builds[v] && st.builds[v].seat !== seat;
  let best = 0;
  const dfs = (v, used) => {
    let max = 0;
    for (const [w, ei] of adj[v] || []) {
      if (used.has(ei)) continue;
      used.add(ei);
      const len = 1 + (blocked(w) ? 0 : dfs(w, used));
      if (len > max) max = len;
      used.delete(ei);
    }
    return max;
  };
  for (const ei of mine) {
    const { a, b } = B.edges[ei];
    best = Math.max(best, dfs(a, new Set()), dfs(b, new Set()));
  }
  return best;
}

function updateLongestRoad(st, seats) {
  const n = st.res.length;
  const lens = Array.from({ length: n }, (_, i) => longestRoadFor(st, i));
  st.roadLens = lens;
  const holder = st.lrHolder;
  let bestSeat = holder != null && lens[holder] >= 5 ? holder : null;
  let bestLen = bestSeat != null ? lens[bestSeat] : 4;
  for (let i = 0; i < n; i++) {
    if (lens[i] > bestLen && lens[i] >= 5) { bestSeat = i; bestLen = lens[i]; }
  }
  if (bestSeat !== st.lrHolder) {
    st.lrHolder = bestSeat;
    if (bestSeat != null) log(st, `${seats[bestSeat].name} has the Longest Road (+2 VP)!`);
  }
}

function score(st, seat) {
  let vp = 0;
  for (const v in st.builds) {
    if (st.builds[v].seat === seat) vp += st.builds[v].city ? 2 : 1;
  }
  if (st.lrHolder === seat) vp += 2;
  return vp;
}

function checkWin(st, seats) {
  for (let i = 0; i < st.res.length; i++) {
    if (score(st, i) >= WIN_VP) { st.phase = 'over'; st.winner = i; return; }
  }
}

function produce(st, seats, roll) {
  const B = st.board;
  const gains = st.res.map(() => ({}));
  B.hexes.forEach((h, hi) => {
    if (h.num !== roll || hi === st.bandit || h.res === 'desert') return;
    for (const vi of h.verts) {
      const b = st.builds[vi];
      if (!b) continue;
      const amt = b.city ? 2 : 1;
      st.res[b.seat][h.res] = (st.res[b.seat][h.res] || 0) + amt;
      gains[b.seat][h.res] = (gains[b.seat][h.res] || 0) + amt;
    }
  });
  const notes = gains.map((g, i) => total(g) ? `${seats[i].name} +${total(g)}` : null).filter(Boolean);
  log(st, `Rolled ${roll}. ${notes.length ? notes.join(', ') : 'No production.'}`);
}

function stealFrom(st, seats, thief, hexIdx) {
  const B = st.board;
  const victims = [...new Set(B.hexes[hexIdx].verts
    .map(v => st.builds[v]?.seat)
    .filter(s => s != null && s !== thief && total(st.res[s]) > 0))];
  if (!victims.length) return;
  const victim = victims[Math.floor(Math.random() * victims.length)];
  const pool = [];
  for (const k of RES) for (let i = 0; i < (st.res[victim][k] || 0); i++) pool.push(k);
  const card = pool[Math.floor(Math.random() * pool.length)];
  st.res[victim][card]--;
  st.res[thief][card] = (st.res[thief][card] || 0) + 1;
  log(st, `${seats[thief].name} robs a card from ${seats[victim].name}!`);
}

function vertValue(st, vi) {
  return st.board.verts[vi].hexes.reduce((a, hi) => {
    const h = st.board.hexes[hi];
    return a + (h.res === 'desert' ? 0 : DOTS[h.num] || 0);
  }, 0);
}

// ---------------------------------------------------------------- engine

function make(seats, options, st) {
  const n = seats.length;

  function grantSecondSettlement(seat, vi) {
    for (const hi of st.board.verts[vi].hexes) {
      const h = st.board.hexes[hi];
      if (h.res !== 'desert') st.res[seat][h.res] = (st.res[seat][h.res] || 0) + 1;
    }
  }

  function advanceSetup() {
    st.setupIdx++;
    if (st.setupIdx >= st.setupQueue.length) {
      st.phase = 'play';
      st.step = 'roll';
      st.turn = 0;
      log(st, 'The island is settled — game on!');
      return;
    }
    st.turn = st.setupQueue[st.setupIdx];
    st.setupStage = 'settlement';
  }

  return {
    state: st,
    pub() {
      return {
        phase: st.phase, step: st.step, turn: st.turn,
        setupStage: st.phase === 'setup' ? st.setupStage : null,
        board: st.board, bandit: st.bandit,
        builds: st.builds, roads: st.roads,
        resCounts: st.res.map(total),
        scores: seats.map((_, i) => score(st, i)),
        roadLens: st.roadLens || null, lrHolder: st.lrHolder,
        dice: st.dice, log: st.log, winner: st.winner,
        discardNeeded: st.step === 'discard' ? st.discardNeeded : null,
        winVp: WIN_VP, costs: COST,
      };
    },
    priv(seat) {
      const p = { res: st.res[seat] };
      if (st.phase === 'setup' && st.turn === seat) {
        p.legalVerts = st.setupStage === 'settlement' ? legalSettlementVerts(st, seat, false) : [];
        p.legalEdges = st.setupStage === 'road' ? legalRoadEdges(st, seat, st.lastSetupVert) : [];
      } else if (st.step === 'main' && st.turn === seat) {
        p.legalVerts = canAfford(st.res[seat], COST.settlement) ? legalSettlementVerts(st, seat, true) : [];
        p.legalEdges = canAfford(st.res[seat], COST.road) ? legalRoadEdges(st, seat) : [];
        p.upgradable = canAfford(st.res[seat], COST.city)
          ? Object.keys(st.builds).map(Number).filter(v => st.builds[v].seat === seat && !st.builds[v].city)
          : [];
      }
      if (st.step === 'discard') p.mustDiscard = st.discardNeeded[seat] || 0;
      return p;
    },
    awaiting() {
      if (st.phase === 'over') return [];
      if (st.step === 'discard') {
        return Object.keys(st.discardNeeded).map(Number).filter(s => st.discardNeeded[s] > 0);
      }
      return [st.turn];
    },
    act(seat, a) {
      if (st.phase === 'over') return { err: 'Game over' };
      if (st.step === 'discard') {
        if (a.t !== 'discard') return { err: 'You must discard first' };
        const need = st.discardNeeded[seat] || 0;
        if (!need) return { err: 'Nothing to discard' };
        const give = a.give || {};
        const count = RES.reduce((x, k) => x + (give[k] || 0), 0);
        if (count !== need) return { err: `Discard exactly ${need} cards` };
        if (!RES.every(k => (give[k] || 0) <= (st.res[seat][k] || 0))) return { err: 'You don’t have those' };
        for (const k of RES) st.res[seat][k] -= (give[k] || 0);
        st.discardNeeded[seat] = 0;
        if (Object.values(st.discardNeeded).every(v => !v)) st.step = 'bandit';
        return {};
      }
      if (seat !== st.turn) return { err: 'Not your turn' };

      if (st.phase === 'setup') {
        if (st.setupStage === 'settlement' && a.t === 'placeSet') {
          if (!legalSettlementVerts(st, seat, false).includes(a.v)) return { err: 'Can’t settle there' };
          st.builds[a.v] = { seat, city: false };
          st.lastSetupVert = a.v;
          if (st.setupIdx >= n) grantSecondSettlement(seat, a.v);
          st.setupStage = 'road';
          return {};
        }
        if (st.setupStage === 'road' && a.t === 'placeRoad') {
          if (!legalRoadEdges(st, seat, st.lastSetupVert).includes(a.e)) return { err: 'Road must touch that settlement' };
          st.roads[a.e] = seat;
          advanceSetup();
          return {};
        }
        return { err: 'Place your ' + st.setupStage };
      }

      if (st.step === 'roll' && a.t === 'roll') {
        const d1 = 1 + Math.floor(Math.random() * 6), d2 = 1 + Math.floor(Math.random() * 6);
        st.dice = [d1, d2];
        const roll = d1 + d2;
        if (roll === 7) {
          log(st, `Rolled 7 — the bandit stirs!`);
          st.discardNeeded = {};
          for (let i = 0; i < n; i++) {
            if (total(st.res[i]) > 7) st.discardNeeded[i] = Math.floor(total(st.res[i]) / 2);
          }
          st.step = Object.keys(st.discardNeeded).length ? 'discard' : 'bandit';
        } else {
          produce(st, seats, roll);
          st.step = 'main';
        }
        return {};
      }
      if (st.step === 'bandit' && a.t === 'bandit') {
        if (a.hex === st.bandit || !st.board.hexes[a.hex]) return { err: 'Pick a different hex' };
        st.bandit = a.hex;
        stealFrom(st, seats, seat, a.hex);
        st.step = 'main';
        return {};
      }
      if (st.step === 'main') {
        if (a.t === 'build') {
          if (a.kind === 'road') {
            if (!canAfford(st.res[seat], COST.road)) return { err: 'Need 🌲+🧱' };
            if (!legalRoadEdges(st, seat).includes(a.e)) return { err: 'Road must connect to your network' };
            payCost(st.res[seat], COST.road);
            st.roads[a.e] = seat;
            updateLongestRoad(st, seats);
            checkWin(st, seats);
            return {};
          }
          if (a.kind === 'settlement') {
            if (!canAfford(st.res[seat], COST.settlement)) return { err: 'Need 🌲🧱🐑🌾' };
            if (!legalSettlementVerts(st, seat, true).includes(a.v)) return { err: 'Needs an empty, connected spot' };
            payCost(st.res[seat], COST.settlement);
            st.builds[a.v] = { seat, city: false };
            log(st, `${seats[seat].name} founds a settlement`);
            updateLongestRoad(st, seats); // roads can be cut by new settlements
            checkWin(st, seats);
            return {};
          }
          if (a.kind === 'city') {
            if (!canAfford(st.res[seat], COST.city)) return { err: 'Need 🪨🪨🪨+🌾🌾' };
            const b = st.builds[a.v];
            if (!b || b.seat !== seat || b.city) return { err: 'Upgrade one of your settlements' };
            payCost(st.res[seat], COST.city);
            b.city = true;
            log(st, `${seats[seat].name} raises a city!`);
            checkWin(st, seats);
            return {};
          }
        }
        if (a.t === 'trade') {
          const give = a.give, get = a.get;
          if (!RES.includes(give) || !RES.includes(get) || give === get) return { err: 'Bad trade' };
          if ((st.res[seat][give] || 0) < 4) return { err: 'Bank trades are 4 → 1' };
          st.res[seat][give] -= 4;
          st.res[seat][get] = (st.res[seat][get] || 0) + 1;
          log(st, `${seats[seat].name} trades 4 ${give} → 1 ${get}`);
          return {};
        }
        if (a.t === 'end') {
          st.turn = (st.turn + 1) % n;
          st.step = 'roll';
          st.dice = null;
          return {};
        }
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.step === 'discard' && st.discardNeeded[seat] > 0) {
        const give = {};
        let need = st.discardNeeded[seat];
        const pile = RES.map(k => [k, st.res[seat][k] || 0]).sort((x, y) => y[1] - x[1]);
        for (const [k, have] of pile) {
          const d = Math.min(have - (give[k] || 0), need);
          if (d > 0) { give[k] = (give[k] || 0) + d; need -= d; }
          if (!need) break;
        }
        return { t: 'discard', give };
      }
      if (st.phase === 'setup') {
        if (st.setupStage === 'settlement') {
          const legal = legalSettlementVerts(st, seat, false);
          legal.sort((a, b) => vertValue(st, b) - vertValue(st, a));
          return { t: 'placeSet', v: legal[0] };
        }
        const roads = legalRoadEdges(st, seat, st.lastSetupVert);
        return { t: 'placeRoad', e: roads[Math.floor(Math.random() * roads.length)] };
      }
      if (st.step === 'roll') return { t: 'roll' };
      if (st.step === 'bandit') {
        const options = st.board.hexes.map((h, hi) => hi).filter(hi => hi !== st.bandit);
        options.sort((x, y) => {
          const val = hi => st.board.hexes[hi].verts.reduce((a, v) => {
            const b = st.builds[v];
            if (!b) return a;
            return a + (b.seat === seat ? -6 : (b.city ? 2 : 1)) * (DOTS[st.board.hexes[hi].num] || 0);
          }, 0);
          return val(y) - val(x);
        });
        return { t: 'bandit', hex: options[0] };
      }
      if (st.step === 'main') {
        const res = st.res[seat];
        if (canAfford(res, COST.city)) {
          const up = Object.keys(st.builds).map(Number)
            .filter(v => st.builds[v].seat === seat && !st.builds[v].city);
          if (up.length) return { t: 'build', kind: 'city', v: up.sort((a, b) => vertValue(st, b) - vertValue(st, a))[0] };
        }
        if (canAfford(res, COST.settlement)) {
          const spots = legalSettlementVerts(st, seat, true);
          if (spots.length) return { t: 'build', kind: 'settlement', v: spots.sort((a, b) => vertValue(st, b) - vertValue(st, a))[0] };
        }
        if (canAfford(res, COST.road) && Math.random() < 0.8) {
          const edges = legalRoadEdges(st, seat);
          if (edges.length && Object.values(st.roads).filter(s => s === seat).length < 12) {
            return { t: 'build', kind: 'road', e: edges[Math.floor(Math.random() * edges.length)] };
          }
        }
        // Trade surplus toward what we lack most.
        for (const k of RES) {
          if ((res[k] || 0) >= 4) {
            const want = RES.filter(w => w !== k).sort((a, b) => (res[a] || 0) - (res[b] || 0))[0];
            return { t: 'trade', give: k, get: want };
          }
        }
        return { t: 'end' };
      }
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      return {
        title: `${seats[st.winner].name} rules the island! 🏝️`,
        lines: seats.map((s, i) => `${s.name}: ${score(st, i)} VP`),
      };
    },
  };
}

export function create({ seats }) {
  const n = seats.length;
  const board = buildBoard();
  const order = Array.from({ length: n }, (_, i) => i);
  const st = {
    phase: 'setup', step: 'setup', turn: order[0],
    board, bandit: board.bandit,
    builds: {}, roads: {},
    res: seats.map(() => ({ wood: 0, brick: 0, wool: 0, grain: 0, ore: 0 })),
    setupQueue: [...order, ...[...order].reverse()], setupIdx: 0, setupStage: 'settlement',
    lastSetupVert: null, lrHolder: null, roadLens: null,
    dice: null, log: ['Place your first settlements!'], winner: -1,
    discardNeeded: {},
  };
  return make(seats, {}, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
