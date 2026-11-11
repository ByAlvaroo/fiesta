// ¡EL SUELO SE CAE! — tres pisos de hexágonos que caen al pisarlos
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds } from '../world.js';
import { Body, collideBodies } from '../mover.js';
import { rand, pick, clamp } from '../util.js';
import { ring, Eliminations } from './common.js';

const S = 1.05;                 // radio del hexágono
const SQ3 = Math.sqrt(3);
const LAYERS = [0, -7, -14, -21];
const GOO_Y = LAYERS[LAYERS.length - 1] - 12;
const TRIG_DELAY = 0.75;
const PALETTES = [
  [0x7fd3f7, 0x4fbdf0, 0xb2e6fb],
  [0xff9fc8, 0xff78b0, 0xffc6df],
  [0xffd36b, 0xffbb2e, 0xffe6a6],
  [0x8be38f, 0x5fd06a, 0xbdf0bf],
];
const GROUP_NAMES = ['claro', 'oscuro', 'pastel'];

export default {
  id: 'suelo',
  name: '¡El Suelo Se Cae!',
  short: 'Suelo Se Cae',
  tag: 'Hexágonos que desaparecen bajo tus pies',
  icon: '⬡',
  color: '#34beed',
  music: 'tension',
  minPlayers: 2,
  desc: 'Cada baldosa que pisas tiembla y se cae. Si caes, aterrizas en el piso de abajo… hasta que ya no queda ninguno. No te quedes quieto y salta los huecos. <b>Truco:</b> andar despacio (B) gasta menos baldosas. Si pisas la <b>baldosa dorada</b>, cae todo un color.',
  controls: { stick: 'Moverte', a: 'Saltar', b: 'Andar despacio' },
  create: (ctx) => new Suelo(ctx),
};

function hexRound(q, r) {
  let x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return [rx, rz];
}

class Suelo {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0; this.gt = 0; this.frame = 0;
    const n = ctx.players.length;
    this.rad = n <= 2 ? 6 : n <= 4 ? 7 : 8;
    ctx.setSky('linear-gradient(#a98bf0 0%, #c9b6f7 45%, #f3ecff 100%)', 0xe6dcfb);
    this.build();
    this.elim = new Eliminations();
    const spots = ring(n, n > 4 ? 6 : 4.5);
    this.bodies = ctx.players.map((p, i) => {
      const b = new Body(p, spots[i].x, spots[i].z, LAYERS[0]);
      b.facing = spots[i].facing;
      b.baseSpeed = 5.3;
      b.jumpV = 9.6;
      b.av = ctx.makeAvatar(p);
      return b;
    });
    this.nextGold = 9;
    this.gold = null;
    this.ended = false;
    this.cam = { x: 0, y: 0, z: 0 };
    ctx.world.snapCamera(0, 16, 15, 0, -1.5, 0);
    for (const p of ctx.players) ctx.phoneUI(p, { stick: true, a: 'Saltar', b: 'Despacio', msg: '¡No te quedes quieto!' });
  }

  build() {
    const s = this.ctx.scene;
    addLights(s);
    this.clouds = addClouds(s, 18, { radius: 75, yMin: GOO_Y + 3, yMax: 6 });
    const goo = new THREE.Mesh(new THREE.CircleGeometry(160, 48), toon(0xb15fd6));
    goo.rotation.x = -Math.PI / 2;
    goo.position.y = GOO_Y;
    s.add(goo);
    this.goo = goo;
    this.dummy = new THREE.Object3D();
    this.layers = LAYERS.map((ly, li) => {
      const tiles = [];
      const map = new Map();
      for (let q = -this.rad; q <= this.rad; q++) {
        for (let r = -this.rad; r <= this.rad; r++) {
          if (Math.abs(q + r) > this.rad) continue;
          const x = S * SQ3 * (q + r / 2), z = S * 1.5 * r;
          const group = Math.floor(Math.random() * 3);
          map.set(q + ',' + r, tiles.length);
          tiles.push({ q, r, x, z, group, alive: true, trig: -1, off: 0, v: 0, gone: false, color: new THREE.Color(PALETTES[li][group]) });
        }
      }
      const geo = new THREE.CylinderGeometry(S * 0.93, S * 0.93, 0.5, 6);
      const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0xffffff).gradientMap });
      const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
      tiles.forEach((t, i) => { this.setTile(inst, i, t, ly); inst.setColorAt(i, t.color); });
      s.add(inst);
      // borde bajo cada hexágono (un poco más oscuro) para que se lea la forma
      return { y: ly, tiles, map, inst };
    });
  }

  setTile(inst, i, t, ly, shake = 0, scale = 1) {
    this.dummy.position.set(t.x + shake * (Math.random() - 0.5), ly - 0.25 + t.off, t.z + shake * (Math.random() - 0.5));
    this.dummy.scale.set(scale, 1, scale);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    inst.setMatrixAt(i, this.dummy.matrix);
  }

  tileAt(li, x, z) {
    const q = (SQ3 / 3 * x - z / 3) / S, r = (2 / 3 * z) / S;
    const [rq, rr] = hexRound(q, r);
    const idx = this.layers[li].map.get(rq + ',' + rr);
    return idx === undefined ? -1 : idx;
  }

  groundAt(x, z, y) {
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      if (L.y > y + 0.05) continue;
      const idx = this.tileAt(li, x, z);
      if (idx >= 0 && L.tiles[idx].alive) return L.y;
    }
    return null;
  }

  layerOf(b) {
    for (let li = 0; li < this.layers.length; li++) if (this.layers[li].y <= b.y + 0.1) return li;
    return this.layers.length - 1;
  }

  trigger(li, idx, at = this.gt) {
    const t = this.layers[li].tiles[idx];
    if (!t.alive || t.trig >= 0) return false;
    t.trig = at;
    return true;
  }

  start() {}

  update(dt, active) {
    this.t += dt; this.frame++;
    this.clouds.update(dt);
    const live = active && !this.ended;
    if (live) this.gt += dt;
    const groundAt = (x, z, y) => this.groundAt(x, z, y);

    for (const b of this.bodies) {
      if (b.p.bot && live && b.alive) this.bot(b, dt);
      b.speedMul = b.p.input.b ? 0.5 : 1;
      if (live && b.alive) {
        const ev = b.control(b.p.input, dt, { canJump: true });
        if (ev.jump) this.ctx.sfx.play('jump');
      } else if (!live) { b.vx *= 0.8; b.vz *= 0.8; }
      if (b.integrate(dt, groundAt)) this.ctx.sfx.play('land');
    }
    collideBodies(this.bodies.filter((b) => b.alive), () => this.ctx.sfx.play('pop'));

    // pisar baldosas
    if (live) {
      for (const b of this.bodies) {
        if (!b.alive || !b.grounded) continue;
        const li = this.layerOf(b);
        const idx = this.tileAt(li, b.x, b.z);
        if (idx < 0) continue;
        if (this.trigger(li, idx)) {
          this.ctx.sfx.play('crack');
          if (this.gold && this.gold.li === li && this.gold.idx === idx) this.goldEffect(b, li);
        }
      }
      this.nextGold -= dt;
      if (this.nextGold <= 0) { this.spawnGold(); this.nextGold = rand(13, 18); }
    }

    // animar baldosas
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      let mDirty = false, cDirty = false;
      for (let i = 0; i < L.tiles.length; i++) {
        const t = L.tiles[i];
        if (t.gone) continue;
        const isGold = this.gold && this.gold.li === li && this.gold.idx === i;
        if (t.trig >= 0 && this.gt >= t.trig) {
          const k = this.gt - t.trig;
          if (t.alive && k >= TRIG_DELAY) {
            t.alive = false;
            if (isGold) this.gold = null;
          }
          if (t.alive) {
            const c = this.tmpC || (this.tmpC = new THREE.Color());
            c.copy(t.color).lerp(new THREE.Color(0xffffff), 0.35 + 0.35 * Math.sin(k * 30));
            L.inst.setColorAt(i, c); cDirty = true;
            this.setTile(L.inst, i, t, L.y, 0.12 * (k / TRIG_DELAY), 1);
            mDirty = true;
          } else {
            t.v += 30 * dt;
            t.off -= t.v * dt;
            this.setTile(L.inst, i, t, L.y, 0, Math.max(0.01, 1 + t.off * 0.04));
            mDirty = true;
            if (t.off < -14) { t.gone = true; this.dummy.scale.set(0, 0, 0); this.dummy.updateMatrix(); L.inst.setMatrixAt(i, this.dummy.matrix); }
          }
        } else if (isGold) {
          const c = this.tmpC || (this.tmpC = new THREE.Color());
          c.setHex(0xffd700).lerp(new THREE.Color(0xffffff), 0.3 + 0.3 * Math.sin(this.t * 8));
          L.inst.setColorAt(i, c); cDirty = true;
          this.setTile(L.inst, i, t, L.y, 0, 1 + 0.05 * Math.sin(this.t * 8));
          mDirty = true;
        }
      }
      if (mDirty) L.inst.instanceMatrix.needsUpdate = true;
      if (cDirty && L.inst.instanceColor) L.inst.instanceColor.needsUpdate = true;
    }

    // eliminaciones
    for (const b of this.bodies) {
      if (b.alive && b.y < LAYERS[LAYERS.length - 1] - 7) {
        b.alive = false;
        this.elim.out(b.p.id, this.frame);
        this.ctx.sfx.play('splash');
        this.ctx.fx.burst(b.x, GOO_Y + 0.5, b.z, 0xd28aef, 18, 7, 1);
        this.ctx.vibrate(b.p, 250);
        this.ctx.phoneUI(b.p, { stick: false, a: null, b: null, msg: '¡Al pozo! 💜 Mira cómo caen los demás' });
      }
      if (b.y < GOO_Y - 1) { b.av.root.visible = false; b.vy = 0; b.y = GOO_Y - 1; b.vx = b.vz = 0; }
      b.av.setExpression(!b.alive ? 'ko' : b.grounded ? (this.ended ? 'happy' : 'normal') : b.vy < -6 ? 'scared' : 'normal');
      b.av.sync(b.state(), dt);
    }

    this.updateCamera(dt);

    if (live) {
      const alive = this.bodies.filter((b) => b.alive);
      if (alive.length <= 1 || this.gt > 180) return this.end(alive);
      if (Math.floor(this.t * 4) !== this.hudTick) {
        this.hudTick = Math.floor(this.t * 4);
        const left = this.layers.map((L, li) => `<span class="lyr" style="background:${'#' + PALETTES[li][1].toString(16)}">${L.tiles.filter((t) => t.alive).length}</span>`).join('');
        this.ctx.hud(`<div class="hud-pill">🧍 Vivos: ${alive.length}</div><div class="hud-pill">Baldosas ${left}</div>`);
      }
    }
  }

  updateCamera(dt) {
    const alive = this.bodies.filter((b) => b.alive);
    const list = alive.length ? alive : this.bodies;
    let x = 0, y = 0, z = 0;
    for (const b of list) { x += b.x; y += Math.max(b.y, LAYERS[2]); z += b.z; }
    x /= list.length; y /= list.length; z /= list.length;
    let spread = 0;
    for (const b of list) spread = Math.max(spread, Math.hypot(b.x - x, b.z - z));
    const ly = LAYERS.reduce((best, v) => (Math.abs(v - y) < Math.abs(best - y) ? v : best), LAYERS[0]);
    const k = 1 + Math.min(1.1, spread / 9);
    this.ctx.world.aimCamera(x * 0.6, ly + 13 * k, z * 0.6 + 12 * k, x * 0.6, ly - 1.5, z * 0.6, 2.2);
  }

  spawnGold() {
    // en el piso más alto donde haya alguien vivo
    const alive = this.bodies.filter((b) => b.alive);
    if (!alive.length) return;
    const li = Math.min(...alive.map((b) => this.layerOf(b)));
    const cands = this.layers[li].tiles.map((t, i) => i).filter((i) => {
      const t = this.layers[li].tiles[i];
      return t.alive && t.trig < 0 && !alive.some((b) => Math.hypot(b.x - t.x, b.z - t.z) < 2);
    });
    if (!cands.length) return;
    this.gold = { li, idx: pick(cands) };
    const t = this.layers[li].tiles[this.gold.idx];
    this.ctx.fx.ring(t.x, this.layers[li].y + 0.05, t.z, 0xffd700, 2);
    this.ctx.toast('✨ ¡Ha aparecido una baldosa dorada!');
    this.ctx.sfx.play('coin');
  }

  goldEffect(b, li) {
    const L = this.layers[li];
    const gsel = Math.floor(Math.random() * 3);
    let n = 0;
    for (let i = 0; i < L.tiles.length; i++) {
      const t = L.tiles[i];
      if (t.group !== gsel || !t.alive || t.trig >= 0) continue;
      const d = Math.hypot(t.x - b.x, t.z - b.z);
      if (this.trigger(li, i, this.gt + 0.5 + d * 0.05)) n++;
    }
    this.gold = null;
    this.ctx.toast(`✨ ${b.p.name} ha pisado la dorada: ¡cae el color ${GROUP_NAMES[gsel]}!`);
    this.ctx.sfx.play('rumble');
    this.ctx.world.shake(0.4);
    this.ctx.fx.confetti(b.x, L.y + 2, b.z, 30, 4);
  }

  bot(b, dt) {
    const p = b.p, m = p.botMem, prof = p.prof, inp = p.input;
    inp.aHit = false;
    m.think = (m.think || 0) - dt;
    const li = this.layerOf(b);
    const L = this.layers[li];
    const ok = (x, z) => { const i = this.tileAt(li, x, z); return i >= 0 && L.tiles[i].alive ? (L.tiles[i].trig < 0 ? 2 : 1) : 0; };
    if (m.think <= 0 && b.grounded) {
      m.think = prof.think * rand(0.5, 1.1);
      let best = m.dir ?? rand(6.28), bestS = -1e9, bestJump = false;
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const dx = Math.cos(a), dz = Math.sin(a);
        let s = 0, jump = false;
        for (let step = 1; step <= 4; step++) {
          const d = step * 0.95;
          const v = ok(b.x + dx * d, b.z + dz * d);
          if (v === 2) s += step === 1 ? 2 : 1;
          else if (v === 1) s += step === 1 ? -0.5 : 0.2;
          else {
            if (step <= 2 && ok(b.x + dx * (d + 1), b.z + dz * (d + 1)) === 2) { jump = step === 1; s += 0.6; continue; }
            s -= 2; break;
          }
        }
        // no ir hacia otros jugadores (dejan rastro de baldosas)
        for (const o of this.bodies) {
          if (o === b || !o.alive) continue;
          const ox = o.x - b.x, oz = o.z - b.z, od = Math.hypot(ox, oz);
          if (od < 4 && od > 0.01) s -= ((ox * dx + oz * dz) / od) * (4 - od) * 0.3;
        }
        // ir hacia donde hay más suelo (centro de masa de baldosas vivas cercano al centro)
        s += -((b.x + dx * 2) ** 2 + (b.z + dz * 2) ** 2) * 0.012;
        if (m.dir !== undefined) s += Math.cos(a - m.dir) * 0.6;
        s += rand(0, 2.5) * (1 - prof.skill);
        if (s > bestS) { bestS = s; best = a; bestJump = jump; }
      }
      m.dir = best;
      if (bestJump && Math.random() > prof.err) m.jumpSoon = 0.05;
    }
    if (m.dir === undefined) m.dir = rand(6.28);
    // los bots listos andan despacio (gastan menos baldosas), los fáciles corren
    const sp = { facil: 0.9, normal: 0.62, dificil: 0.48 }[p.difficulty] ?? 0.62;
    inp.b = false;
    inp.x = Math.cos(m.dir) * sp;
    inp.y = -Math.sin(m.dir) * sp;
    // saltar si justo delante hay un hueco o una baldosa a punto de caer
    if (b.grounded) {
      const ax = b.x + Math.cos(m.dir) * 0.85, az = b.z + Math.sin(m.dir) * 0.85;
      const far = ok(b.x + Math.cos(m.dir) * 2, b.z + Math.sin(m.dir) * 2);
      if (ok(ax, az) === 0 && far === 2 && Math.random() > prof.err) inp.aHit = true;
      if (m.jumpSoon !== undefined) { m.jumpSoon -= dt; if (m.jumpSoon <= 0) { inp.aHit = true; m.jumpSoon = undefined; } }
    }
  }

  end(alive) {
    this.ended = true;
    for (const b of alive) { b.av.pose = 'cheer'; this.ctx.fx.confetti(b.x, b.y + 3, b.z, 60); }
    this.ctx.finish(this.elim.groups(alive.map((b) => b.p.id)));
  }

  dispose() {}
}
