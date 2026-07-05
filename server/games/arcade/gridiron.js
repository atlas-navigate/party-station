// Gridiron Rush — arcade play-calling football. Offense picks a play, defense
// picks a counter, the TV shows the carnage. Big plays, big hits, no mercy.
export const meta = {
  id: 'gridiron', name: 'Gridiron Rush', tagline: 'Call the play, take the hit', icon: '🏈', emoji: '🏈',
  category: 'arcade', mode: 'server',
  minPlayers: 2, maxPlayers: 4, saveable: true,
  options: [
    { key: 'quarters', label: 'Plays per quarter', type: 'select', def: 10,
      choices: [{ v: 6, label: 'Quick (6)' }, { v: 10, label: 'Standard (10)' }, { v: 14, label: 'Long (14)' }] },
  ],
};

export const OFF_PLAYS = [
  { id: 'inside', name: 'Inside Run', icon: '🏃', mean: 4, std: 3 },
  { id: 'outside', name: 'Outside Run', icon: '💨', mean: 5, std: 5 },
  { id: 'short', name: 'Short Pass', icon: '🎯', mean: 7, std: 5, pass: true },
  { id: 'bomb', name: 'Long Bomb', icon: '🚀', mean: 18, std: 16, pass: true, risky: true },
  { id: 'screen', name: 'Screen Pass', icon: '🛡️', mean: 6, std: 7, pass: true },
  { id: 'trick', name: 'Trick Play', icon: '🎪', mean: 9, std: 14, risky: true },
];
export const DEF_PLAYS = [
  { id: 'runblitz', name: 'Run Blitz', icon: '⚡', stops: ['inside', 'outside'] },
  { id: 'contain', name: 'Contain', icon: '🧱', stops: ['outside', 'trick'] },
  { id: 'zone', name: 'Zone', icon: '🕸️', stops: ['short', 'screen'] },
  { id: 'man', name: 'Man Coverage', icon: '👥', stops: ['short', 'bomb'] },
  { id: 'allout', name: 'All-Out Blitz', icon: '🔥', stops: ['inside', 'screen'], gamble: true },
  { id: 'prevent', name: 'Prevent', icon: '☂️', stops: ['bomb'], soft: true },
];

const KICKOFF = 25;

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 6) st.log.shift();
}

function teamOf(seat) { return seat % 2; }
function callers(seats, team) {
  return seats.map((_, i) => i).filter(i => teamOf(i) === team);
}

function turnover(st, seats, why) {
  st.offense = 1 - st.offense;
  st.ball = 100 - st.ball;
  st.down = 1; st.toGo = 10;
  log(st, why);
}

function gauss() {
  return (Math.random() + Math.random() + Math.random()) * 2 - 3; // ~N(0,1)-ish
}

function clockTick(st, seats) {
  st.playsLeft--;
  if (st.playsLeft <= 0) {
    st.quarter++;
    if (st.quarter > 4) {
      st.phase = 'over';
      return;
    }
    st.playsLeft = st.playsPerQuarter;
    log(st, `— Quarter ${st.quarter} —`);
    if (st.quarter === 3) { // second-half kickoff
      st.offense = 1 - st.openingOffense;
      st.ball = KICKOFF; st.down = 1; st.toGo = 10;
    }
  }
}

function resolvePlay(st, seats) {
  const off = OFF_PLAYS.find(p => p.id === st.pendingOff);
  const def = DEF_PLAYS.find(p => p.id === st.pendingDef);
  const stopped = def.stops.includes(off.id);
  let mult = stopped ? 0.25 : def.gamble ? 1.7 : def.soft ? 1.25 : 1.0;
  if (def.soft && !off.pass) mult = 1.4; // prevent is soft vs the run
  let yards = Math.round(off.mean * mult + gauss() * off.std);
  let event = null;

  // Disasters and heroics.
  const sackChance = off.pass && (def.gamble || stopped) ? 0.22 : 0.05;
  const pickChance = off.pass ? (stopped ? 0.16 : 0.05) + (off.risky ? 0.05 : 0) : 0;
  const fumbleChance = off.risky ? 0.08 : 0.02;
  const roll = Math.random();
  if (off.pass && roll < pickChance) {
    event = 'INTERCEPTED!';
  } else if (roll < pickChance + fumbleChance) {
    event = 'FUMBLE!';
  } else if (off.pass && Math.random() < sackChance) {
    yards = -(3 + Math.floor(Math.random() * 6));
    event = 'SACKED!';
  } else if (!stopped && Math.random() < (off.risky ? 0.10 : 0.05)) {
    yards = Math.max(yards, 25 + Math.floor(Math.random() * 40));
    event = 'HUGE PLAY!';
  }

  const offTeam = st.offense;
  st.lastPlay = {
    off: off.id, def: def.id, offName: off.name, defName: def.name,
    yards, event, offense: offTeam, stopped,
  };
  if (event === 'INTERCEPTED!' || event === 'FUMBLE!') {
    turnover(st, seats, `${event} Team ${offTeam + 1} coughs it up!`);
    clockTick(st, seats);
    st.step = 'offense';
    st.pendingOff = st.pendingDef = null;
    return;
  }

  st.ball += yards;
  if (st.ball >= 100) {
    st.score[offTeam] += 7;
    st.lastPlay.event = 'TOUCHDOWN! +7';
    log(st, `TOUCHDOWN Team ${offTeam + 1}! (${off.name} for ${yards})`);
    st.offense = 1 - offTeam;
    st.ball = KICKOFF; st.down = 1; st.toGo = 10;
  } else if (st.ball <= 0) {
    st.ball = 1;
    st.score[1 - offTeam] += 2;
    st.lastPlay.event = 'SAFETY! +2';
    turnover(st, seats, `SAFETY! Team ${2 - offTeam} scores 2!`);
  } else {
    st.toGo -= yards;
    if (st.toGo <= 0) {
      st.down = 1; st.toGo = 10;
      log(st, `${off.name}: ${yards >= 0 ? '+' : ''}${yards} — FIRST DOWN!`);
    } else {
      st.down++;
      log(st, `${off.name}: ${yards >= 0 ? '+' : ''}${yards}${event ? ' (' + event + ')' : ''}`);
      if (st.down > 4) turnover(st, seats, `Turnover on downs!`);
    }
  }
  clockTick(st, seats);
  st.step = 'offense';
  st.pendingOff = st.pendingDef = null;
}

function make(seats, options, st) {
  function offCaller() {
    const team = callers(seats, st.offense);
    return team[st.playCount % team.length];
  }
  function defCaller() {
    const team = callers(seats, 1 - st.offense);
    return team[st.playCount % team.length];
  }

  return {
    state: st,
    pub() {
      return {
        phase: st.phase, step: st.step,
        quarter: st.quarter, playsLeft: st.playsLeft, playsPerQuarter: st.playsPerQuarter,
        score: st.score, offense: st.offense, ball: st.ball,
        down: st.down, toGo: st.toGo,
        teams: seats.map((s, i) => ({ name: s.name, team: teamOf(i) })),
        offCaller: offCaller(), defCaller: defCaller(),
        lastPlay: st.lastPlay, log: st.log,
        offPlays: OFF_PLAYS.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
        defPlays: DEF_PLAYS.map(p => ({ id: p.id, name: p.name, icon: p.icon })),
        offPicked: !!st.pendingOff,
      };
    },
    priv(seat) {
      const fourthDown = st.down === 4;
      return {
        team: teamOf(seat),
        callingOffense: st.step === 'offense' && seat === offCaller(),
        callingDefense: st.step === 'defense' && seat === defCaller(),
        canPunt: fourthDown, canFG: fourthDown && st.ball >= 55,
      };
    },
    awaiting() {
      if (st.phase !== 'play') return [];
      return [st.step === 'offense' ? offCaller() : defCaller()];
    },
    act(seat, a) {
      if (st.phase !== 'play') return { err: 'Game over' };
      if (st.step === 'offense' && a.t === 'call') {
        if (seat !== offCaller()) return { err: 'Not your call' };
        if (a.play === 'punt' && st.down === 4) {
          const dist = 35 + Math.floor(Math.random() * 15);
          st.lastPlay = { special: 'PUNT', yards: dist, offense: st.offense };
          st.offense = 1 - st.offense;
          st.ball = Math.max(1, 100 - Math.min(95, st.ball + dist));
          st.down = 1; st.toGo = 10;
          log(st, `Punt! ${dist} yards.`);
          clockTick(st, seats);
          st.playCount++;
          return {};
        }
        if (a.play === 'fg' && st.down === 4 && st.ball >= 55) {
          const dist = 100 - st.ball + 17;
          const good = Math.random() < Math.max(0.15, 1.05 - dist / 55);
          st.lastPlay = { special: good ? 'FIELD GOAL IS GOOD! +3' : 'KICK IS NO GOOD!', offense: st.offense };
          if (good) {
            st.score[st.offense] += 3;
            log(st, `Field goal from ${dist} is GOOD! +3`);
            st.offense = 1 - st.offense;
            st.ball = KICKOFF;
          } else {
            log(st, `Field goal from ${dist} misses!`);
            st.offense = 1 - st.offense;
            st.ball = 100 - st.ball;
          }
          st.down = 1; st.toGo = 10;
          clockTick(st, seats);
          st.playCount++;
          return {};
        }
        if (!OFF_PLAYS.some(p => p.id === a.play)) return { err: 'Pick a play' };
        st.pendingOff = a.play;
        st.step = 'defense';
        return {};
      }
      if (st.step === 'defense' && a.t === 'call') {
        if (seat !== defCaller()) return { err: 'Not your call' };
        if (!DEF_PLAYS.some(p => p.id === a.play)) return { err: 'Pick a play' };
        st.pendingDef = a.play;
        st.playCount++;
        resolvePlay(st, seats);
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.phase !== 'play') return null;
      if (st.step === 'offense' && seat === offCaller()) {
        if (st.down === 4) {
          if (st.toGo <= 2 && Math.random() < 0.5) {
            return { t: 'call', play: ['inside', 'short'][Math.floor(Math.random() * 2)] };
          }
          if (st.ball >= 62) return { t: 'call', play: 'fg' };
          if (st.ball < 55) return { t: 'call', play: 'punt' };
        }
        const w = st.toGo > 8 ? ['short', 'bomb', 'screen', 'short', 'bomb', 'trick']
          : ['inside', 'outside', 'short', 'screen', 'inside', 'bomb'];
        return { t: 'call', play: w[Math.floor(Math.random() * w.length)] };
      }
      if (st.step === 'defense' && seat === defCaller()) {
        const w = st.toGo > 8 ? ['man', 'zone', 'prevent', 'man', 'allout']
          : ['runblitz', 'contain', 'zone', 'man', 'allout'];
        return { t: 'call', play: w[Math.floor(Math.random() * w.length)] };
      }
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const [a, b] = st.score;
      const t1 = callers(seats, 0).map(i => seats[i].name).join(' & ');
      const t2 = callers(seats, 1).map(i => seats[i].name).join(' & ');
      return {
        title: a === b ? `Tie game, ${a}–${b}!` : `${a > b ? t1 : t2} wins ${Math.max(a, b)}–${Math.min(a, b)}!`,
        lines: [`Team 1 (${t1}): ${a}`, `Team 2 (${t2}): ${b}`],
      };
    },
  };
}

export function create({ seats, options }) {
  const st = {
    phase: 'play', step: 'offense',
    quarter: 1, playsPerQuarter: options.quarters || 10,
    playsLeft: options.quarters || 10,
    score: [0, 0], offense: 0, openingOffense: 0,
    ball: KICKOFF, down: 1, toGo: 10,
    pendingOff: null, pendingDef: null, playCount: 0,
    lastPlay: null, log: ['Q1 — Team 1 ball at the 25.'],
  };
  return make(seats, options, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
