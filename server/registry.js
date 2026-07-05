// Central game registry. To add a game: create a module under server/games/,
// matching client modules under public/js/games/, and import it here.
import * as hearts from './games/cards/hearts.js';
import * as crazy8s from './games/cards/crazy8s.js';
import * as holdem from './games/cards/holdem.js';
import * as blackjack from './games/cards/blackjack.js';
import * as gofish from './games/cards/gofish.js';
import * as tycoon from './games/board/tycoon.js';
import * as milestones from './games/board/milestones.js';
import * as candydash from './games/board/candydash.js';
import * as islanders from './games/board/islanders.js';
import * as incognito from './games/arcade/incognito.js';
import * as gridiron from './games/arcade/gridiron.js';
import * as slamcity from './games/arcade/slamcity.js';
import * as combat from './games/arcade/combat.js';

export const MODULES = [
  hearts, crazy8s, holdem, blackjack, gofish,
  tycoon, milestones, candydash, islanders,
  slamcity, combat, incognito, gridiron,
];

const map = new Map(MODULES.map(m => [m.meta.id, m]));

export function byId(id) { return map.get(id); }

// Lightweight metadata sent to clients for the hub grid + lobby option forms.
export function catalog() {
  return MODULES.map(m => ({ ...m.meta }));
}
