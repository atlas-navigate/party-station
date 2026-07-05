// Card helpers. A card is a 2-char string: rank + suit, e.g. 'As', 'Td', '9c'.
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export function freshDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return shuffle(d);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const rank = c => c[0];
export const suit = c => c[1];
export const rv = c => RANKS.indexOf(c[0]) + 2; // 2..14

export function sortHand(hand) {
  const so = { s: 0, h: 1, c: 2, d: 3 };
  return hand.sort((a, b) => so[suit(a)] - so[suit(b)] || rv(a) - rv(b));
}

export function removeCard(hand, c) {
  const i = hand.indexOf(c);
  if (i < 0) return false;
  hand.splice(i, 1);
  return true;
}

// Poker: evaluate best 5-card hand from 5-7 cards.
// Returns an array [category, tiebreak...] comparable with cmpEval.
// Categories: 8 straight flush, 7 quads, 6 full house, 5 flush, 4 straight,
// 3 trips, 2 two pair, 1 pair, 0 high card.
export function evaluate(cards) {
  const vals = cards.map(rv).sort((a, b) => b - a);
  const bySuit = {};
  for (const c of cards) (bySuit[suit(c)] ||= []).push(rv(c));
  let flushSuit = null;
  for (const s in bySuit) if (bySuit[s].length >= 5) flushSuit = s;

  const straightHigh = vs => {
    const u = [...new Set(vs)].sort((a, b) => b - a);
    if (u.includes(14)) u.push(1); // wheel
    let run = 1;
    for (let i = 1; i < u.length; i++) {
      run = (u[i] === u[i - 1] - 1) ? run + 1 : 1;
      if (run >= 5) return u[i] + 4;
    }
    return 0;
  };

  if (flushSuit) {
    const sfHigh = straightHigh(bySuit[flushSuit]);
    if (sfHigh) return [8, sfHigh];
  }
  const count = {};
  for (const v of vals) count[v] = (count[v] || 0) + 1;
  const groups = Object.entries(count)
    .map(([v, n]) => [Number(v), n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (groups[0][1] === 4) {
    const kick = vals.find(v => v !== groups[0][0]);
    return [7, groups[0][0], kick];
  }
  if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) {
    return [6, groups[0][0], groups[1][0]];
  }
  if (flushSuit) {
    return [5, ...bySuit[flushSuit].sort((a, b) => b - a).slice(0, 5)];
  }
  const sh = straightHigh(vals);
  if (sh) return [4, sh];
  if (groups[0][1] === 3) {
    const kicks = vals.filter(v => v !== groups[0][0]).slice(0, 2);
    return [3, groups[0][0], ...kicks];
  }
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const kick = vals.find(v => v !== groups[0][0] && v !== groups[1][0]);
    return [2, groups[0][0], groups[1][0], kick];
  }
  if (groups[0][1] === 2) {
    const kicks = vals.filter(v => v !== groups[0][0]).slice(0, 3);
    return [1, groups[0][0], ...kicks];
  }
  return [0, ...vals.slice(0, 5)];
}

export function cmpEval(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

export const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind',
  'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
