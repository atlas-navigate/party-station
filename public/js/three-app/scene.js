// Shared three.js scene harness for TV game scenes.
// Renders on demand (turn-based scenes) or continuously (arcade), with a tiny
// tween system for card deals, dice rolls, and token hops — kept lean so a
// Raspberry Pi 4 GPU stays comfortable.
import * as THREE from '/vendor/three.module.js';
export { THREE };

export const EASE = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  linear: t => t,
};

export function createScene(initialHolder, opts = {}) {
  let holder = initialHolder;
  const {
    fov = 45, camPos = [0, 9, 11], lookAt = [0, 0, 0],
    bg = 0x14162a, continuous = false,
  } = opts;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  } catch (e) {
    // No WebGL on this screen (very old TV browser?) — degrade with a notice
    // instead of a dead panel. Gameplay still works from phones/controllers.
    console.error('WebGL unavailable:', e);
    holder.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;'
      + 'color:#9aa0b8;font-size:22px;text-align:center;padding:30px">'
      + 'This screen’s browser can’t show 3D graphics.<br>The game is still running — follow along on phones.</div>';
    const noop = () => {};
    return {
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: null,
      hud: holder.appendChild(Object.assign(document.createElement('div'), { style: 'position:absolute;inset:0;' })),
      invalidate: noop, setContinuous: noop, onTick: noop,
      tween: () => Promise.resolve(), hop: () => Promise.resolve(),
      clearGroup: noop, rehome: noop, dispose: noop, degraded: true,
    };
  }
  renderer.setPixelRatio(1); // crispness costs too much on a Pi; HUD text is DOM anyway
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border-radius:18px;';
  holder.style.position = 'relative';
  holder.innerHTML = '';
  holder.appendChild(canvas);

  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  holder.appendChild(hud);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, 26, 46);

  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 100);
  camera.position.set(...camPos);
  camera.lookAt(...lookAt);

  scene.add(new THREE.AmbientLight(0x9aa2c8, 1.15));
  const key = new THREE.DirectionalLight(0xffe2b0, 1.6);
  key.position.set(-4, 12, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.4);
  fill.position.set(6, 8, -6);
  scene.add(fill);

  let tweens = [];
  let dirty = 2;
  let running = true;
  let isContinuous = continuous;
  let tickFn = null;

  function resize() {
    const w = holder.clientWidth || 1280, h = holder.clientHeight || 620;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = 2;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(holder);
  resize();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    let active = isContinuous || dirty > 0 || tweens.length > 0;
    if (!active) return;
    if (tweens.length) {
      const keep = [];
      for (const tw of tweens) {
        const t = Math.min(1, (now - tw.t0) / tw.dur);
        tw.set(tw.from + (tw.to - tw.from) * tw.ease(t), t);
        if (t < 1) keep.push(tw);
        else tw.done?.();
      }
      tweens = keep;
    }
    tickFn?.(now);
    renderer.render(scene, camera);
    if (dirty > 0) dirty--;
  }
  requestAnimationFrame(frame);

  return {
    scene, camera, renderer, hud,
    invalidate() { dirty = 2; },
    setContinuous(v) { isContinuous = v; dirty = 2; },
    onTick(fn) { tickFn = fn; },
    tween(set, from, to, dur, ease = EASE.outCubic) {
      return new Promise(res => {
        tweens.push({ set, from, to, dur, ease, t0: performance.now(), done: res });
      });
    },
    // Parabolic hop for tokens moving tile-to-tile.
    hop(obj, from, to, height = 0.7, dur = 260) {
      return this.tween((v, t) => {
        obj.position.lerpVectors(from, to, v);
        obj.position.y += Math.sin(t * Math.PI) * height;
      }, 0, 1, dur, EASE.inOutCubic);
    },
    clearGroup(group) {
      for (let i = group.children.length - 1; i >= 0; i--) group.remove(group.children[i]);
    },
    // The TV shell rebuilds its DOM on every sync; adopt the new holder.
    rehome(newHolder) {
      if (newHolder === holder) return;
      ro.unobserve(holder);
      holder = newHolder;
      holder.style.position = 'relative';
      holder.innerHTML = '';
      holder.append(canvas, hud);
      ro.observe(holder);
      resize();
    },
    dispose() {
      running = false;
      ro.disconnect();
      renderer.dispose();
      holder.innerHTML = '';
    },
  };
}
