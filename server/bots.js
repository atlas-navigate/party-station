// Bot identity helpers.
const NAMES = [
  'Chip', 'Bolt', 'Widget', 'Sprocket', 'Gizmo', 'Circuit', 'Pixel', 'Servo',
  'Diode', 'Gadget', 'Rusty', 'Clank', 'Vector', 'Byte', 'Turbo', 'Socket',
];

export function botName(taken) {
  const free = NAMES.filter(n => !taken.includes(n));
  const base = free.length ? free[Math.floor(Math.random() * free.length)]
    : 'Bot-' + Math.floor(Math.random() * 900 + 100);
  return base;
}
