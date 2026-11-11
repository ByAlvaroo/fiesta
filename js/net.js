// Conexión PC ⇄ móviles con WebRTC (PeerJS). No necesita servidor propio.
export const PEER_PREFIX = 'fiesta-salon-byalvaro-';
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

export function peerAvailable() { return typeof window.Peer === 'function'; }

// ---------------- Lado del PC (anfitrión) ----------------
export class HostNet {
  constructor({ onData, onClose, onStatus }) {
    this.onData = onData;
    this.onClose = onClose;
    this.onStatus = onStatus || (() => {});
    this.conns = new Set();
    this.code = null;
    this.status = 'off';
    this.tries = 0;
  }

  start() {
    if (!peerAvailable()) { this.setStatus('nopeer'); return; }
    this.code = randomCode();
    this.setStatus('connecting');
    const peer = new window.Peer(PEER_PREFIX + this.code, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => { this.tries = 0; this.setStatus('ready'); });
    peer.on('connection', (conn) => {
      conn.on('open', () => this.conns.add(conn));
      conn.on('data', (msg) => {
        try { this.onData(conn, typeof msg === 'string' ? JSON.parse(msg) : msg); } catch (e) { console.warn(e); }
      });
      conn.on('close', () => { this.conns.delete(conn); this.onClose(conn); });
      conn.on('error', () => { this.conns.delete(conn); this.onClose(conn); });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && this.tries++ < 5) { peer.destroy(); this.start(); return; }
      if (err.type === 'peer-unavailable') return;
      console.warn('PeerJS:', err.type, err);
      if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) this.setStatus('error');
    });
  }

  setStatus(s) { this.status = s; this.onStatus(s); }

  send(conn, msg) {
    if (conn && conn.open) { try { conn.send(msg); } catch (e) { /* conexión caída */ } }
  }
  broadcast(msg) { for (const c of this.conns) this.send(c, msg); }
}

// URL que abre el móvil
export function controllerURL(code) {
  const u = new URL('mando.html', location.href);
  u.search = '?sala=' + code;
  u.hash = '';
  return u.href;
}
