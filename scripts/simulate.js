// Bot-vs-bot simulation harness: runs every turn-based game to completion many
// times, exercising save/restore mid-game. Fails loudly on stalls, illegal bot
// moves, or crashes. Usage: node scripts/simulate.js [gameId] [runs]
import { MODULES, byId } from '../server/registry.js';

const onlyGame = process.argv[2];
const RUNS = Number(process.argv[3] || 25);
let failures = 0;

// Session games with no built-in end (players quit when done; state autosaves).
// For these we assert thousands of clean actions rather than completion.
const OPEN_ENDED = new Set(['blackjack']);

function runOnce(mod, nSeats, runIdx) {
  const seats = Array.from({ length: nSeats }, (_, i) => ({ name: 'Bot' + i, bot: true }));
  const options = {};
  for (const o of mod.meta.options || []) {
    // rotate through option choices across runs for coverage; skip the
    // deliberately endless "play until last standing" variants
    const finite = o.choices.filter(c => !(o.key === 'rounds' && c.v === 0));
    options[o.key] = finite[runIdx % finite.length].v;
  }
  let game = mod.create({ seats, options });
  const cap = 20000;
  let steps = 0;
  let restored = false;
  while (!game.over()) {
    if (OPEN_ENDED.has(mod.meta.id) && steps >= 5000) return steps;
    if (++steps > cap) throw new Error(`stall: exceeded ${cap} steps (endless loop?)`);
    const waiting = game.awaiting();
    if (!waiting.length) throw new Error(`stall: over()==null but awaiting()==[] at step ${steps}`);
    const seat = waiting[0];
    const action = game.botAct(seat);
    if (!action) throw new Error(`bot has no move for seat ${seat} (awaiting=${waiting})`);
    const res = game.act(seat, action);
    if (res?.err) throw new Error(`bot illegal move seat ${seat}: ${res.err} ${JSON.stringify(action)}`);
    // Halfway through, snapshot -> JSON -> restore, like the autosave would.
    if (!restored && steps === 50) {
      const snap = JSON.parse(JSON.stringify(game.state));
      game = mod.restore({ seats, options }, snap);
      restored = true;
    }
  }
  const summary = game.over();
  if (!summary?.title) throw new Error('over() returned no title');
  return steps;
}

for (const mod of MODULES) {
  if (mod.meta.mode !== 'server') continue;
  if (onlyGame && mod.meta.id !== onlyGame) continue;
  const { minPlayers, maxPlayers } = mod.meta;
  let totalSteps = 0, runs = 0;
  let failed = false;
  for (let run = 0; run < RUNS && !failed; run++) {
    const n = minPlayers + (run % (maxPlayers - minPlayers + 1));
    try {
      totalSteps += runOnce(mod, n, run);
      runs++;
    } catch (e) {
      failures++;
      failed = true;
      console.error(`✗ ${mod.meta.id} (${n} players, run ${run}): ${e.message}`);
      if (process.env.TRACE) console.error(e.stack);
    }
  }
  if (!failed) {
    console.log(`✓ ${mod.meta.id}: ${runs} games completed (avg ${Math.round(totalSteps / runs)} actions)`);
  }
}

if (failures) {
  console.error(`\n${failures} game(s) failed`);
  process.exit(1);
}
console.log('\nAll simulations passed.');
