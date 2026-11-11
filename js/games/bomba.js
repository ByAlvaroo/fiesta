// PATATA BOMBA — pásala antes de que explote
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds } from '../world.js';
import { Body, collideBodies, keepInBox, collideObstacles, steerTo } from '../mover.js';
import { rand, pick, clamp, lerp } from '../util.js';
import { ring, Eliminations, cartoonBomb, canvasTex, tree } from './common.js';

const HALF = 11;
const OBSTACLES = [
  { x: 0, z: 0, r: 1.4, kind: 'fuente' },
  { x: -5.5, z: -4.5, hw: 0.85, hd: 0.85, kind: 'caja' },
  { x: 5.5, z: 4.5, hw: 0.85, hd: 0.85, kind: 'caja' },
  { x: 5.8, z: -5, r: 0.6, kind: 'barril' },
  { x: -5.8, z: 5, r: 0.6, kind: 'barril' },
  { x: -7.5, z: 0.5, hw: 0.6, hd: 1.6, kind: 'banco' },
  { x: 7.5, z: -0.5, hw: 0.6, hd: 1.6, kind: 'banco' },
];

export default {
  id: 'bomba',
  name: 'Patata Bomba',
  short: 'Patata Bomba',
  tag: 'Pásala antes de que explote',
  icon: '💣',
  color: '#3b3b48',
  music: 'tension',
  minPlayers: 2,
  desc: 'Quien lleva la bomba debe <b>tocar a otro</b> para pasársela. Nadie sabe cuánto dura la mecha y el pitido <b>a veces miente</b>. Si te explota encima, quedas eliminado. Con B haces un acelerón.',
  controls: { stick: 'Correr', a: null, b: 'Acelerón' },
  create: (ctx) => new Bomba(ctx),
};

class Bomba {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0; this.gt = 0; this.frame = 0;
    ctx.setSky('linear-gradient(#ffb0a8 0%, #ffd3c7 50%, #fff1ea 100%)', 0xffe1d8);
    this.build();
    this.elim = new Eliminations();
    const spots = ring(ctx.players.length, 8);
    this.bodies = ctx.players.map((p, i) => {
      const b = new Body(p, spots[i].x, spots[i].z, 0);
      b.facing = spots[i].facing;
      b.baseSpeed = 6.6;
      b.bombImmune = 0;
      b.av = ctx.makeAvatar(p);
      return b;
    });
    this.bomb = cartoonBomb(1.1);
    this.bomb.visible = false;
    ctx.scene.add(this.bomb);
    this.holder = null;
    this.round = 0;
    this.state = 'wait';
    this.ended = false;
    ctx.world.snapCamera(0, 21, 17, 0, 0, 1);
    for (const p of ctx.players) ctx.phoneUI(p, { stick: true, a: null, b: 'Acelerón', msg: '¡Que no te toque la bomba!' });
  }

  build() {
    const s = this.ctx.scene;
    addLights(s);
    this.clouds = addClouds(s, 10, { radius: 60, yMin: -12, yMax: -2 });
    const tex = canvasTex(256, 256, (c, W) => {
      const n = 8, k = W / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? '#8fd96b' : '#a3e57f'; c.fillRect(i * k, j * k, k, k); }
    }, [HALF / 4, HALF / 4]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: toon(0xffffff).gradientMap }));
    floor.rotation.x = -Math.PI / 2;
    floor.userData.ownMap = true;
    s.add(floor);
    const base = withOutline(new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 1.6, 3, HALF * 2 + 1.6), toon(0xc59b6d)), 1.005);
    base.position.y = -1.51;
    s.add(base);
    for (const [x, z, w, d] of [[0, -HALF - 0.4, HALF * 2 + 1.6, 0.5], [0, HALF + 0.4, HALF * 2 + 1.6, 0.5], [-HALF - 0.4, 0, 0.5, HALF * 2 + 1.6], [HALF + 0.4, 0, 0.5, HALF * 2 + 1.6]]) {
      const f = withOutline(new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), toon(0xffffff)), 1.02);
      f.position.set(x, 0.45, z);
      s.add(f);
    }
    for (const o of OBSTACLES) {
      if (o.kind === 'fuente') {
        const f = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r + 0.15, 0.8, 24), toon(0xdfe7ee)), 1.03);
        f.position.set(o.x, 0.4, o.z); s.add(f);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(o.r - 0.15, o.r - 0.15, 0.1, 24), toon(0x5fc9f0));
        w.position.set(o.x, 0.78, o.z); s.add(w);
        const c = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.4, 12), toon(0xdfe7ee)), 1.05);
        c.position.set(o.x, 1.2, o.z); s.add(c);
        this.jet = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), toon(0x9fe2fb));
        this.jet.position.set(o.x, 2.1, o.z); s.add(this.jet);
      } else if (o.kind === 'caja' || o.kind === 'banco') {
        const h = o.kind === 'caja' ? 1.5 : 0.7;
        const m = withOutline(new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, h, o.hd * 2), toon(o.kind === 'caja' ? 0xd9a066 : 0x9b6a43)), 1.03);
        m.position.set(o.x, h / 2, o.z); s.add(m);
      } else {
        const m = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 1.3, 16), toon(0xff5a5a)), 1.04);
        m.position.set(o.x, 0.65, o.z); s.add(m);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(o.r + 0.03, o.r + 0.03, 0.18, 16), toon(0xffffff));
        band.position.set(o.x, 0.9, o.z); s.add(band);
      }
    }
    for (const [x, z] of [[-14, -12], [14.5, -11], [-15, 10], [15, 12], [0, -15]]) s.add(tree(x, z, 1.3, 0));
  }

  start() { this.newRound(); }

  newRound() {
    const alive = this.bodies.filter((b) => b.alive);
    if (alive.length <= 1) return this.end(alive);
    this.round++;
    const h = pick(alive);
    this.fuse = rand(6, 9) + alive.length * rand(0.4, 0.8);
    this.fuseMax = this.fuse;
    this.lie = Math.random() < 0.5 ? rand(0.45, 0.7) * (Math.random() < 0.5 ? 1 : 2.4) : 1;
    this.beepT = 0.3;
    this.state = 'play';
    this.bomb.visible = true;
    this.bombFrom = null;
    this.setHolder(h, null);
    this.ctx.announce(`Ronda ${this.round}`, { color: '#ff5a5a', dur: 1.2 });
    this.ctx.toast(`💣 ¡La bomba la tiene ${h.p.name}!`);
  }

  setHolder(b, prev) {
    if (prev) {
      prev.bombImmune = 1.0;
      this.bombFrom = { x: this.bomb.position.x, y: this.bomb.position.y, z: this.bomb.position.z, t: 0 };
      this.ctx.phoneUI(prev.p, { stick: true, a: null, b: 'Acelerón', msg: '¡Huye de la bomba!' });
      this.ctx.sfx.play('pop');
      this.ctx.fx.burst(b.x, 2, b.z, 0xffd23a, 8, 4, 0.5);
    }
    this.holder = b;
    this.ctx.phoneUI(b.p, { stick: true, a: null, b: 'Acelerón', msg: '💣 ¡TIENES LA BOMBA! Toca a alguien' });
    this.ctx.vibrate(b.p, 120);
  }

  update(dt, active) {
    this.t += dt; this.frame++;
    this.clouds.update(dt);
    if (this.jet) this.jet.position.y = 2.1 + Math.sin(this.t * 6) * 0.15;
    const live = active && !this.ended;
    if (live) this.gt += dt;
    const groundAt = (x, z) => (Math.abs(x) <= HALF + 0.5 && Math.abs(z) <= HALF + 0.5 ? 0 : null);

    for (const b of this.bodies) {
      b.bombImmune -= dt;
      b.speedMul = b === this.holder ? 1.14 : 1;
      if (b.p.bot && live && b.alive && this.state === 'play') this.bot(b, dt);
      if (live && b.alive && this.state === 'play') {
        const ev = b.control(b.p.input, dt, { canJump: false, canDash: true, dashCD: 1.5 });
        if (ev.dash) this.ctx.sfx.play('whoosh');
      } else if (b.alive) { b.vx *= 0.85; b.vz *= 0.85; }
      b.integrate(dt, groundAt);
      if (b.alive) { keepInBox(b, -HALF, HALF, -HALF, HALF); collideObstacles(b, OBSTACLES); }
    }
    collideBodies(this.bodies.filter((b) => b.alive), () => this.ctx.sfx.play('pop'));

    if (live && this.state === 'play') {
      // pasar la bomba
      const h = this.holder;
      if (h && h.alive && h.stun <= 0) {
        for (const o of this.bodies) {
          if (o === h || !o.alive || o.bombImmune > 0) continue;
          if (Math.hypot(o.x - h.x, o.z - h.z) < 1.05) { this.setHolder(o, h); break; }
        }
      }
      // mecha
      this.fuse -= dt;
      const shown = Math.max(0.05, this.fuse * this.lie);
      this.beepT -= dt;
      if (this.beepT <= 0) {
        this.ctx.sfx.play('beep');
        this.beepT = clamp(shown * 0.09, 0.08, 0.9);
        this.flash = 0.08;
      }
      if (this.fuse <= 0) this.explode();
    } else if (this.state === 'boom' && live) {
      this.pause -= dt;
      if (this.pause <= 0) this.newRound();
    }

    // bomba sobre la cabeza
    if (this.holder && this.bomb.visible) {
      const h = this.holder;
      const tx = h.x, ty = h.y + 2.55, tz = h.z;
      if (this.bombFrom) {
        this.bombFrom.t += dt * 5;
        const k = Math.min(1, this.bombFrom.t);
        this.bomb.position.set(lerp(this.bombFrom.x, tx, k), lerp(this.bombFrom.y, ty, k) + Math.sin(k * Math.PI) * 1.2, lerp(this.bombFrom.z, tz, k));
        if (k >= 1) this.bombFrom = null;
      } else this.bomb.position.set(tx, ty + Math.sin(this.t * 10) * 0.05, tz);
      const grow = 1.1 + (1 - Math.max(0, this.fuse) / this.fuseMax) * 0.35;
      this.flash = (this.flash || 0) - dt;
      this.bomb.scale.setScalar(grow * (this.flash > 0 ? 1.12 : 1));
      this.bomb.rotation.y += dt * 2;
      this.bomb.userData.spark.scale.setScalar(0.8 + Math.random() * 0.8);
    }

    for (const b of this.bodies) {
      if (!b.alive && b.y < -30) { b.av.root.visible = false; b.vy = 0; b.vx = b.vz = 0; b.y = -30; }
      const scared = b.alive && this.holder && b !== this.holder && Math.hypot(b.x - this.holder.x, b.z - this.holder.z) < 3;
      b.av.setExpression(!b.alive ? 'ko' : b === this.holder && this.state === 'play' ? 'scared' : this.ended ? 'happy' : scared ? 'scared' : 'normal');
      b.av.sync(b.state(), dt);
    }

    if (live && Math.floor(this.t * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.t * 4);
      const alive = this.bodies.filter((b) => b.alive).length;
      this.ctx.hud(`<div class="hud-pill">💣 Ronda ${this.round}</div><div class="hud-pill">🧍 Vivos: ${alive}</div>${this.holder && this.state === 'play' ? `<div class="hud-pill">Bomba: ${this.ctx.chip(this.holder.p)}</div>` : ''}`);
    }
  }

  explode() {
    const h = this.holder;
    this.state = 'boom';
    this.pause = 2.6;
    this.bomb.visible = false;
    this.ctx.sfx.play('explode');
    this.ctx.world.shake(0.9);
    this.ctx.fx.explosion(h.x, h.y + 1.5, h.z);
    h.alive = false;
    h.ko = true;
    h.noGround = true;
    const a = rand(6.28);
    h.knock(Math.cos(a) * 3, 17, Math.sin(a) * 3, 99);
    this.elim.out(h.p.id, this.frame);
    this.ctx.vibrate(h.p, 500);
    this.ctx.phoneUI(h.p, { stick: false, a: null, b: null, msg: '💥 ¡BOOM! Estás fuera' });
    this.ctx.toast(`💥 ¡${h.p.name} ha explotado!`);
    for (const o of this.bodies) {
      if (o === h || !o.alive) continue;
      const dx = o.x - h.x, dz = o.z - h.z, d = Math.hypot(dx, dz);
      if (d < 4) { const k = (4 - d) * 3; o.knock((dx / (d || 1)) * k, 6, (dz / (d || 1)) * k, 0.8); }
    }
    this.holder = null;
  }

  bot(b, dt) {
    const p = b.p, m = p.botMem, prof = p.prof, inp = p.input;
    inp.bHit = false;
    m.think = (m.think || 0) - dt;
    if (m.side === undefined) m.side = Math.random() < 0.5 ? 1 : -1;
    if (m.think > 0) return;
    m.think = prof.think * 0.45;
    const h = this.holder;
    if (b === h) {
      let best = null, bd = 1e9;
      for (const o of this.bodies) {
        if (o === b || !o.alive) continue;
        const d = Math.hypot(o.x - b.x, o.z - b.z) + (o.bombImmune > 0 ? 6 : 0);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) return;
      const look = 0.35 * prof.skill;
      const st = steerTo(b, best.x + best.vx * look, best.z + best.vz * look, 0.3);
      inp.x = st.x * prof.speed; inp.y = st.y * prof.speed;
      if (bd < 3.2 && b.dashCD <= 0 && Math.random() < prof.skill * 0.8) inp.bHit = true;
      return;
    }
    if (!h) { inp.x = inp.y = 0; return; }
    const dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz) || 0.01;
    let fx = 0, fz = 0;
    if (d < 9) {
      const w = (9 - d) / 9;
      fx += (dx / d) * w * 2; fz += (dz / d) * w * 2;
      fx += (-dz / d) * m.side * w * 1.1; fz += (dx / d) * m.side * w * 1.1;
    } else {
      m.wt = (m.wt || 0) - 1;
      if (m.wt <= 0 || m.wx === undefined) { m.wt = 12; m.wx = rand(-8, 8); m.wz = rand(-8, 8); }
      const st = steerTo(b, m.wx, m.wz, 1);
      fx += st.x * 0.5; fz += -st.y * 0.5;
    }
    // paredes
    const wall = 3;
    if (b.x < -HALF + wall) fx += (-HALF + wall - b.x) * 0.8;
    if (b.x > HALF - wall) fx -= (b.x - (HALF - wall)) * 0.8;
    if (b.z < -HALF + wall) fz += (-HALF + wall - b.z) * 0.8;
    if (b.z > HALF - wall) fz -= (b.z - (HALF - wall)) * 0.8;
    // esquinas: cambiar de lado si está atrapado
    if ((Math.abs(b.x) > HALF - 1.5 || Math.abs(b.z) > HALF - 1.5) && d < 4 && Math.random() < 0.05) m.side *= -1;
    for (const o of OBSTACLES) {
      const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz);
      const rr = (o.r || Math.max(o.hw, o.hd)) + 1.2;
      if (od < rr && od > 0.01) { fx += (ox / od) * (rr - od) * 0.8; fz += (oz / od) * (rr - od) * 0.8; }
    }
    const fm = Math.hypot(fx, fz);
    if (fm > 0.05) { inp.x = (fx / fm) * prof.speed * Math.min(1, fm * 1.5); inp.y = -(fz / fm) * prof.speed * Math.min(1, fm * 1.5); }
    else { inp.x = inp.y = 0; }
    if (d < 2.4 && b.dashCD <= 0 && Math.random() < prof.skill * 0.7) inp.bHit = true;
  }

  end(alive) {
    this.ended = true;
    this.bomb.visible = false;
    for (const b of alive) { b.av.pose = 'cheer'; this.ctx.fx.confetti(b.x, 3, b.z, 60); }
    this.ctx.finish(this.elim.groups(alive.map((b) => b.p.id)));
  }

  dispose() {}
}
