// Jugadores (móvil, teclado, mando de consola o bot) y sus entradas
import { COLORS, EYES, MOUTHS } from './face.js';
import { pick, randInt, shuffle } from './util.js';

export const MAX_PLAYERS = 8;

export const BOT_LEVELS = {
  facil:   { label: 'Fácil',   react: [0.42, 0.68], think: 0.5,  err: 0.22, speed: 0.8,  skill: 0.35 },
  normal:  { label: 'Normal',  react: [0.27, 0.42], think: 0.28, err: 0.09, speed: 0.92, skill: 0.7 },
  dificil: { label: 'Difícil', react: [0.18, 0.28], think: 0.14, err: 0.025, speed: 1.0, skill: 1 },
};

const BOT_NAMES = ['Tuerca', 'Chispas', 'Robotina', 'Bichito', 'Paco Bot', 'Lola Bot', 'Pepinillo', 'Rayo',
  'Tostadora', 'Burbuja', 'Cachivache', 'Croqueta', 'Gominola', 'Pixel', 'Mandarina', 'Tornillo'];

let nextId = 1;

export class Player {
  constructor(o) {
    this.id = o.id || 'p' + nextId++;
    this.name = (o.name || 'Jugador').slice(0, 12);
    this.color = o.color ?? COLORS[0].hex;
    this.eyes = o.eyes ?? 0;
    this.mouth = o.mouth ?? 0;
    this.kind = o.kind || 'bot'; // 'phone' | 'keyboard' | 'gamepad' | 'bot'
    this.slot = o.slot ?? 0;     // teclado 0/1 o índice del mando
    this.difficulty = o.difficulty || 'normal';
    this.token = o.token || null;
    this.conn = o.conn || null;
    this.online = true;
    this.score = 0;
    this.wins = 0;
    this.ready = false;
    this.input = { x: 0, y: 0, a: false, b: false, aHit: false, bHit: false, aRT: null };
    this.botMem = {};
  }
  get bot() { return this.kind === 'bot'; }
  get prof() { return BOT_LEVELS[this.difficulty] || BOT_LEVELS.normal; }
  get kindLabel() {
    return { phone: 'Móvil', keyboard: 'Teclado ' + (this.slot + 1), gamepad: 'Mando', bot: 'Bot · ' + this.prof.label }[this.kind];
  }
  get kindIcon() { return { phone: '📱', keyboard: '⌨️', gamepad: '🎮', bot: '🤖' }[this.kind]; }

  press(k, down, rt = null) {
    const inp = this.input;
    if (k === 'a') { if (down && !inp.a) { inp.aHit = true; inp.aRT = rt; } inp.a = down; }
    if (k === 'b') { if (down && !inp.b) inp.bHit = true; inp.b = down; }
  }
  clearHits() { this.input.aHit = false; this.input.bHit = false; }
  resetInput() { Object.assign(this.input, { x: 0, y: 0, a: false, b: false, aHit: false, bHit: false, aRT: null }); }
}

export function freeColor(players, preferred) {
  const used = new Set(players.map((p) => p.color));
  if (preferred !== undefined && !used.has(preferred)) return preferred;
  const free = COLORS.map((c) => c.hex).filter((h) => !used.has(h));
  return free.length ? free[0] : pick(COLORS).hex;
}

export function makeBot(players, difficulty) {
  const usedNames = new Set(players.map((p) => p.name));
  const name = shuffle(BOT_NAMES).find((n) => !usedNames.has(n)) || 'Bot ' + randInt(1, 99);
  return new Player({
    name, kind: 'bot', difficulty,
    color: freeColor(players, pick(COLORS).hex),
    eyes: randInt(0, EYES.length - 1), mouth: randInt(0, MOUTHS.length - 1),
  });
}

// Puntos según el puesto: 1º 5, 2º 3, 3º 2, resto 1
export const POINTS = [5, 3, 2];
export function pointsFor(place) { return POINTS[place - 1] ?? 1; }

// groups: [[ids empatados en 1º], [ids en el siguiente puesto], ...] → [{id, place, pts}]
export function placementsToResults(groups) {
  const out = [];
  let place = 1;
  for (const g of groups) {
    for (const id of g) out.push({ id, place, pts: pointsFor(place) });
    place += g.length;
  }
  return out;
}

// ---------------- Teclado y mandos de consola ----------------
const KEYMAPS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], a: ['Space'], b: ['ShiftLeft', 'KeyE'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], a: ['Enter', 'NumpadEnter', 'Numpad0'], b: ['ShiftRight', 'ControlRight'] },
];
export const KEY_HELP = [
  'WASD para moverte · Espacio = A · Shift izq. o E = B',
  'Flechas para moverte · Enter = A · Shift der. = B',
];

export class LocalInput {
  constructor(getPlayers) {
    this.getPlayers = getPlayers;
    this.held = new Set();
    this.padPrev = {};
    this.onPadJoin = null;
    this.onAnyA = null;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.keyEvent(e.code, true);
    });
    window.addEventListener('keyup', (e) => { this.held.delete(e.code); this.keyEvent(e.code, false); });
    window.addEventListener('blur', () => { this.held.clear(); for (const p of this.getPlayers()) if (p.kind === 'keyboard') p.resetInput(); });
  }

  keyEvent(code, down) {
    for (const p of this.getPlayers()) {
      if (p.kind !== 'keyboard') continue;
      const km = KEYMAPS[p.slot];
      if (km.a.includes(code)) p.press('a', down);
      if (km.b.includes(code)) p.press('b', down);
    }
  }

  // Llamar cada fotograma
  poll() {
    const players = this.getPlayers();
    for (const p of players) {
      if (p.kind !== 'keyboard') continue;
      const km = KEYMAPS[p.slot];
      const h = (arr) => arr.some((c) => this.held.has(c));
      let x = (h(km.right) ? 1 : 0) - (h(km.left) ? 1 : 0);
      let y = (h(km.up) ? 1 : 0) - (h(km.down) ? 1 : 0);
      if (x && y) { x *= 0.7071; y *= 0.7071; }
      p.input.x = x; p.input.y = y;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const prev = this.padPrev[pad.index] || {};
      const aDown = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const bDown = !!((pad.buttons[1] && pad.buttons[1].pressed) || (pad.buttons[2] && pad.buttons[2].pressed));
      const owner = players.find((p) => p.kind === 'gamepad' && p.slot === pad.index);
      if (owner) {
        let x = pad.axes[0] || 0, y = -(pad.axes[1] || 0);
        if (pad.buttons[14]?.pressed) x = -1;
        if (pad.buttons[15]?.pressed) x = 1;
        if (pad.buttons[12]?.pressed) y = 1;
        if (pad.buttons[13]?.pressed) y = -1;
        const m = Math.hypot(x, y);
        if (m < 0.2) { x = 0; y = 0; }
        owner.input.x = x; owner.input.y = y;
        if (aDown !== !!prev.a) owner.press('a', aDown);
        if (bDown !== !!prev.b) owner.press('b', bDown);
      } else if (aDown && !prev.a && this.onPadJoin) {
        this.onPadJoin(pad.index);
      }
      this.padPrev[pad.index] = { a: aDown, b: bDown };
    }
  }
}
