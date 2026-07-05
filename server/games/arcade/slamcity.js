// Slam City — 2-on-2 arcade basketball. Real-time: the simulation runs in the
// TV browser (public/js/games/slamcity.tv.js); phones are gamepads and this
// server just relays inputs. Heat up with back-to-back buckets and go on fire!
export const meta = {
  id: 'slamcity', name: 'Slam City', tagline: '2-on-2 arcade hoops. Boomshakalaka-free zone', icon: '🏀', emoji: '🏀',
  category: 'arcade', mode: 'relay',
  minPlayers: 1, maxPlayers: 4, saveable: false,
  options: [
    { key: 'seconds', label: 'Game length', type: 'select', def: 120,
      choices: [{ v: 60, label: '1 minute' }, { v: 120, label: '2 minutes' }, { v: 180, label: '3 minutes' }] },
  ],
};
// Relay games have no server-side engine.
