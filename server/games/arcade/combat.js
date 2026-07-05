// Combat Legends — 1v1 arcade fighter. Real-time: the simulation runs in the
// TV browser (public/js/games/combat.tv.js); phones are gamepads and this
// server just relays inputs. Best of 3 rounds.
export const meta = {
  id: 'combat', name: 'Combat Legends', tagline: '1v1 fights, best of three', icon: '🥋', emoji: '🥊',
  category: 'arcade', mode: 'relay',
  minPlayers: 1, maxPlayers: 2, saveable: false,
  options: [],
};
// Relay games have no server-side engine.
