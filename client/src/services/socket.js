class SyncSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.url = null;
    this._dead = false;
  }
  connect(serverUrl) {
    this._dead = false;
    this.url = serverUrl;
    const wsUrl = serverUrl.replace(/\/$/, '').replace(/^https/, 'wss').replace(/^http/, 'ws');
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen    = () => this._emit('__open');
    this.ws.onclose   = () => { this._emit('__close'); if (!this._dead) setTimeout(() => this.connect(this.url), 2000); };
    this.ws.onerror   = () => {};
    this.ws.onmessage = (e) => { try { const m = JSON.parse(e.data); this._emit(m.type, m); } catch(_) {} };
  }
  disconnect() { this._dead = true; this.ws?.close(); }
  send(obj) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }
  _emit(type, data) { this.listeners.get(type)?.forEach(fn => fn(data)); }
  waitOpen(ms = 6000) {
    return new Promise((res, rej) => {
      if (this.ws?.readyState === 1) return res();
      const u = this.on('__open', () => { u(); res(); });
      setTimeout(() => { u(); rej(new Error('timeout')); }, ms);
    });
  }
}
export default new SyncSocket();
