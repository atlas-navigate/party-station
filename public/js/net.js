// WebSocket client with auto-reconnect and identity resume.
export function connect({ role, onSync, onMsg }) {
  let ws = null;
  let closed = false;
  let backoff = 500;
  const listeners = [];

  function open() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      backoff = 500;
      const hello = { t: 'hello', role };
      if (role === 'player') {
        hello.token = localStorage.getItem('ps-token') || undefined;
        hello.name = localStorage.getItem('ps-name') || undefined;
      }
      ws.send(JSON.stringify(hello));
    };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        localStorage.setItem('ps-token', m.token);
        localStorage.setItem('ps-name', m.name);
      } else if (m.t === 'sync') {
        onSync(m);
      } else {
        onMsg?.(m);
        for (const fn of listeners) fn(m);
      }
    };
    ws.onclose = () => {
      if (closed) return;
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 1.7, 5000);
    };
    ws.onerror = () => ws.close();
  }
  open();

  // Keep phone connections warm through screen locks.
  setInterval(() => { if (ws?.readyState === 1) ws.send('{"t":"ping"}'); }, 25000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ws?.readyState !== 1) { try { ws?.close(); } catch {} }
  });

  return {
    send(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); },
    onExtra(fn) { listeners.push(fn); },
    close() { closed = true; ws?.close(); },
  };
}
