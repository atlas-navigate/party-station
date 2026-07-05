// Incognito — a social deduction word game. Everyone gets the secret word…
// except the impostor, who only knows the category. Give one-word clues,
// debate, and vote. Catch the impostor before they blend in — but even caught,
// they can steal the win by guessing the word!
export const meta = {
  id: 'incognito', name: 'Incognito', tagline: 'One of you doesn’t know the word', icon: '🕵️', emoji: '🎭',
  category: 'arcade', mode: 'server',
  minPlayers: 4, maxPlayers: 10, saveable: true,
  options: [],
};

const WORDS = [
  { word: 'Pizza', category: 'Food', clues: ['cheese', 'slice', 'pepperoni', 'oven', 'crust', 'Italy', 'delivery'], decoys: ['Burger', 'Taco', 'Pasta'] },
  { word: 'Beach', category: 'Places', clues: ['sand', 'waves', 'sunscreen', 'towel', 'shells', 'surf', 'tide'], decoys: ['Pool', 'Desert', 'Lake'] },
  { word: 'Dragon', category: 'Creatures', clues: ['fire', 'wings', 'scales', 'hoard', 'knight', 'cave', 'legend'], decoys: ['Phoenix', 'Griffin', 'Wyvern'] },
  { word: 'Guitar', category: 'Music', clues: ['strings', 'strum', 'chords', 'pick', 'amp', 'solo', 'fret'], decoys: ['Violin', 'Banjo', 'Piano'] },
  { word: 'Winter', category: 'Seasons', clues: ['snow', 'cold', 'mittens', 'frost', 'sled', 'icicle', 'cocoa'], decoys: ['Autumn', 'Spring', 'Summer'] },
  { word: 'Astronaut', category: 'Jobs', clues: ['space', 'rocket', 'helmet', 'orbit', 'NASA', 'float', 'moon'], decoys: ['Pilot', 'Diver', 'Scientist'] },
  { word: 'Coffee', category: 'Drinks', clues: ['beans', 'morning', 'caffeine', 'mug', 'espresso', 'roast', 'brew'], decoys: ['Tea', 'Cocoa', 'Soda'] },
  { word: 'Circus', category: 'Entertainment', clues: ['clown', 'tent', 'acrobat', 'ring', 'juggler', 'trapeze', 'lion'], decoys: ['Carnival', 'Theater', 'Rodeo'] },
  { word: 'Shark', category: 'Animals', clues: ['fin', 'teeth', 'ocean', 'bite', 'jaws', 'predator', 'reef'], decoys: ['Whale', 'Dolphin', 'Barracuda'] },
  { word: 'Castle', category: 'Buildings', clues: ['moat', 'king', 'towers', 'drawbridge', 'stone', 'knights', 'throne'], decoys: ['Palace', 'Fortress', 'Mansion'] },
  { word: 'Skiing', category: 'Sports', clues: ['slopes', 'poles', 'powder', 'lift', 'goggles', 'alpine', 'lodge'], decoys: ['Snowboarding', 'Skating', 'Sledding'] },
  { word: 'Vampire', category: 'Spooky', clues: ['fangs', 'garlic', 'bat', 'coffin', 'blood', 'cape', 'night'], decoys: ['Zombie', 'Ghost', 'Werewolf'] },
  { word: 'Library', category: 'Places', clues: ['books', 'quiet', 'shelves', 'librarian', 'borrow', 'reading', 'stacks'], decoys: ['Bookstore', 'Museum', 'School'] },
  { word: 'Birthday', category: 'Events', clues: ['cake', 'candles', 'presents', 'party', 'wish', 'balloons', 'confetti'], decoys: ['Wedding', 'Graduation', 'Holiday'] },
  { word: 'Robot', category: 'Technology', clues: ['metal', 'circuits', 'beep', 'android', 'program', 'gears', 'AI'], decoys: ['Drone', 'Computer', 'Cyborg'] },
  { word: 'Volcano', category: 'Nature', clues: ['lava', 'eruption', 'ash', 'magma', 'crater', 'smoke', 'mountain'], decoys: ['Earthquake', 'Geyser', 'Tornado'] },
  { word: 'Detective', category: 'Jobs', clues: ['clues', 'mystery', 'magnifier', 'case', 'suspect', 'sleuth', 'evidence'], decoys: ['Police', 'Spy', 'Lawyer'] },
  { word: 'Campfire', category: 'Outdoors', clues: ['marshmallow', 'logs', 'smoke', 'stories', 'flames', 'smores', 'sparks'], decoys: ['Barbecue', 'Bonfire', 'Fireplace'] },
];

const VAGUE = ['thing', 'fun', 'classic', 'big', 'cool', 'popular', 'famous', 'nice', 'good', 'interesting'];

function log(st, text) {
  st.log.push(text);
  if (st.log.length > 8) st.log.shift();
}

function aliveSeats(st) {
  return st.alive.map((a, i) => a && i).filter(v => v !== false);
}

function startRound(st) {
  st.round++;
  st.clues = {};
  st.votes = {};
  st.step = 'clue';
}

function make(seats, options, st) {
  const n = seats.length;
  const entry = WORDS[st.wordIdx];

  function finish(civiliansWin, reason) {
    st.phase = 'over';
    st.result = { civiliansWin, reason, impostor: st.impostor, word: entry.word };
  }

  function tallyVotes() {
    const alive = aliveSeats(st);
    const counts = {};
    for (const s of alive) {
      const v = st.votes[s];
      if (v != null) counts[v] = (counts[v] || 0) + 1;
    }
    let top = null, topN = 0, tie = false;
    for (const [t, c] of Object.entries(counts)) {
      if (c > topN) { top = Number(t); topN = c; tie = false; }
      else if (c === topN) tie = true;
    }
    if (top == null || tie || topN <= alive.length / 2) {
      log(st, 'No majority — nobody was ejected.');
    } else {
      st.alive[top] = false;
      if (top === st.impostor) {
        log(st, `${seats[top].name} was the impostor! One last chance to guess…`);
        st.step = 'guess';
        return;
      }
      log(st, `${seats[top].name} was innocent! 😱`);
    }
    const alive2 = aliveSeats(st);
    if (alive2.length <= 3 && st.alive[st.impostor]) {
      finish(false, 'The impostor blended in to the end!');
      return;
    }
    if (st.round >= 4 && st.alive[st.impostor]) {
      finish(false, 'The impostor survived four rounds!');
      return;
    }
    startRound(st);
  }

  return {
    state: st,
    pub() {
      return {
        phase: st.phase, step: st.step, round: st.round,
        category: entry.category,
        alive: st.alive,
        clues: st.step === 'clue'
          ? Object.fromEntries(Object.keys(st.clues).map(s => [s, '…'])) // hide until all in
          : st.clues,
        allClues: st.history,
        voted: Object.keys(st.votes).map(Number),
        log: st.log, result: st.result,
        guessOptions: st.step === 'guess' ? st.guessOptions : null,
      };
    },
    priv(seat) {
      return {
        isImpostor: seat === st.impostor,
        word: seat === st.impostor ? null : entry.word,
        yourClue: st.clues[seat] || null,
        yourVote: st.votes[seat] ?? null,
      };
    },
    awaiting() {
      if (st.phase === 'over') return [];
      const alive = aliveSeats(st);
      if (st.step === 'clue') return alive.filter(s => !st.clues[s]);
      if (st.step === 'vote') return alive.filter(s => st.votes[s] == null);
      if (st.step === 'guess') return [st.impostor];
      return [];
    },
    act(seat, a) {
      if (st.phase === 'over') return { err: 'Game over' };
      if (st.step === 'clue' && a.t === 'clue') {
        if (!st.alive[seat] || st.clues[seat]) return { err: 'Clue already given' };
        const word = String(a.word || '').trim().slice(0, 20);
        if (!word) return { err: 'Say one word' };
        if (word.toLowerCase() === entry.word.toLowerCase() && seat !== st.impostor) {
          return { err: 'You can’t say the word itself!' };
        }
        st.clues[seat] = word;
        if (aliveSeats(st).every(s => st.clues[s])) {
          st.history.push({ round: st.round, clues: { ...st.clues } });
          st.step = 'vote';
          log(st, `Round ${st.round}: clues are in — who sounds fake?`);
        }
        return {};
      }
      if (st.step === 'vote' && a.t === 'vote') {
        if (!st.alive[seat] || st.votes[seat] != null) return { err: 'Already voted' };
        if (!st.alive[a.seat] || a.seat === seat) return { err: 'Vote for someone else (alive)' };
        st.votes[seat] = a.seat;
        if (aliveSeats(st).every(s => st.votes[s] != null)) tallyVotes();
        return {};
      }
      if (st.step === 'guess' && a.t === 'guess') {
        if (seat !== st.impostor) return { err: 'Only the impostor guesses' };
        if (String(a.word).toLowerCase() === entry.word.toLowerCase()) {
          finish(false, `${seats[seat].name} guessed the word and stole the win!`);
        } else {
          finish(true, 'The impostor was caught and couldn’t guess the word!');
        }
        return {};
      }
      return { err: 'Invalid action' };
    },
    botAct(seat) {
      if (st.step === 'clue' && st.alive[seat] && !st.clues[seat]) {
        const used = new Set(st.history.flatMap(h => Object.values(h.clues)).map(w => w.toLowerCase()));
        for (const [, c] of Object.entries(st.clues)) used.add(String(c).toLowerCase());
        if (seat === st.impostor) {
          const pool = VAGUE.filter(w => !used.has(w));
          return { t: 'clue', word: pool[Math.floor(Math.random() * pool.length)] || 'hmm' };
        }
        const pool = entry.clues.filter(w => !used.has(w.toLowerCase()));
        const word = pool[Math.floor(Math.random() * pool.length)]
          || entry.clues[Math.floor(Math.random() * entry.clues.length)] + '!';
        return { t: 'clue', word };
      }
      if (st.step === 'vote' && st.alive[seat] && st.votes[seat] == null) {
        const alive = aliveSeats(st).filter(s => s !== seat);
        if (seat !== st.impostor) {
          // Suspect whoever gave a clue that isn't in the word's clue pool.
          const known = new Set(entry.clues.map(w => w.toLowerCase()));
          const sus = alive.filter(s => {
            const c = String(st.clues[s] || '').toLowerCase();
            return c && !known.has(c);
          });
          if (sus.length && Math.random() < 0.75) {
            return { t: 'vote', seat: sus[Math.floor(Math.random() * sus.length)] };
          }
        }
        return { t: 'vote', seat: alive[Math.floor(Math.random() * alive.length)] };
      }
      if (st.step === 'guess' && seat === st.impostor) {
        const pick = st.guessOptions[Math.floor(Math.random() * st.guessOptions.length)];
        return { t: 'guess', word: pick };
      }
      return null;
    },
    over() {
      if (st.phase !== 'over') return null;
      const r = st.result;
      const civs = seats.filter((_, i) => i !== st.impostor).map(s => s.name);
      return {
        title: r.civiliansWin ? 'The crew wins! 🎉' : `${seats[st.impostor].name} wins as the impostor! 🕵️`,
        lines: [
          `The word was “${r.word}”`,
          `Impostor: ${seats[st.impostor].name}`,
          r.reason,
        ],
      };
    },
  };
}

export function create({ seats }) {
  const n = seats.length;
  const wordIdx = Math.floor(Math.random() * WORDS.length);
  const entry = WORDS[wordIdx];
  const guessOptions = [entry.word, ...entry.decoys].sort(() => Math.random() - 0.5);
  const st = {
    phase: 'play', step: 'clue', round: 0,
    wordIdx, impostor: Math.floor(Math.random() * n),
    alive: seats.map(() => true),
    clues: {}, votes: {}, history: [],
    guessOptions,
    log: ['Give a one-word clue about the secret word.'], result: null,
  };
  startRound(st);
  st.round = 1;
  return make(seats, {}, st);
}

export function restore({ seats, options }, state) {
  return make(seats, options, state);
}
