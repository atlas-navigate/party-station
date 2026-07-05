// Bluetooth/USB controller support via the browser Gamepad API.
// Pads pair with the Pi (bluetoothctl or the desktop UI); Chromium exposes
// them here. Standard mapping: A=0 B=1 X=2 Y=3 Start=9, dpad=12-15, with the
// left stick doubling as a dpad.
const BTN_MAP = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const REPEAT_DELAY = 380, REPEAT_RATE = 140;

export function createPads({ onPress, onConnect, onDisconnect }) {
  const state = new Map(); // index -> {down:{name:bool}, repeat:{name:t}}

  function readPad(gp) {
    const down = {};
    for (const [i, name] of Object.entries(BTN_MAP)) {
      down[name] = !!gp.buttons[i]?.pressed;
    }
    // Left stick as dpad.
    if (gp.axes[0] < -0.55) down.left = true;
    if (gp.axes[0] > 0.55) down.right = true;
    if (gp.axes[1] < -0.55) down.up = true;
    if (gp.axes[1] > 0.55) down.down = true;
    return down;
  }

  function poll(now) {
    const pads = navigator.getGamepads?.() || [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      let st = state.get(gp.index);
      if (!st) {
        st = { down: {}, repeat: {} };
        state.set(gp.index, st);
        onConnect?.(gp.index, gp.id);
      }
      const down = readPad(gp);
      for (const name of Object.keys(down)) {
        const was = st.down[name];
        if (down[name] && !was) {
          st.repeat[name] = now + REPEAT_DELAY;
          onPress?.(gp.index, name);
        } else if (down[name] && was && ['up', 'down', 'left', 'right'].includes(name)
          && now >= st.repeat[name]) {
          st.repeat[name] = now + REPEAT_RATE;
          onPress?.(gp.index, name, true);
        }
      }
      st.down = down;
    }
    for (const idx of [...state.keys()]) {
      if (!pads[idx] || !pads[idx].connected) {
        state.delete(idx);
        onDisconnect?.(idx);
      }
    }
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);

  return {
    isDown(index, name) { return !!state.get(index)?.down[name]; },
    connected() { return [...state.keys()]; },
  };
}
