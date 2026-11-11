// PINTAPISOS — cubre el suelo con tu color en 60 segundos
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds } from '../world.js';
import { Body, collideBodies, keepInBox, steerTo } from '../mover.js';
import { rand, randInt, pick, clamp } from '../util.js';
import { ring, tree } from './common.js';

const N = 24;            // casillas por lado
const HALF = N / 2;
const DURATION = 60;
const WHITE = 0xf6f8fa;

export default {
  id: 'pintapisos',
  name: 'Pintapisos',
  short: 'Pintapisos',
  tag: 'Cubre el suelo con tu color',
  icon: '🎨',
  color: '#ffc233',
  music: 'game',
  minPlayers: 2,
  desc: 'Todo lo que pisas se pinta de tu color. Coge el <b>cubo</b> (brocha gorda), el <b>rayo</b> (velocidad) y la <b>bomba de pintura</b>. Cuidado con los <b>rodillos</b> que borran todo. Con B haces un acelerón que empuja.',
  controls: { stick: 'Moverte', a: null, b: 'Acelerón' },
  create: (ctx) => new Pintapisos(ctx),
};

const tileIndex = (x, z) => {
  const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return j * N + i;
};
const tileCenter = (idx) => ({ x: (idx % N) - HALF + 0.5, z: Math.floor(idx / N) - HALF + 0.5 });

class Pintapisos {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.gt = 0;
    ctx.setSky('linear-gradient(#7fd3f7 0%, #bfeafb 60%, #effaff 100%)', 0xd9f3fd);
    this.owner = new Int8Array(N * N).fill(-1);
    this.pop = new Float32Array(N * N);
    this.washAt = new Float32Array(N * N).fill(-1);
    this.counts = ctx.players.map(() => 0);
    this.colors = ctx.players.map((p) => new THREE.Color(p.color));
    this.white = new THREE.Color(WHITE);
    this.build();
    const spots = ring(ctx.players.length, 7.5);
    this.bodies = ctx.players.map((p, i) => {
      const b = new Body(p, spots[i].x, spots[i].z, 0);
      b.facing = spots[i].facing;
      b.baseSpeed = 6.8;
      b.idx = i;
      b.brush = 0; b.fast = 0;
      b.av = ctx.makeAvatar(p);
      return b;
    });
    this.powerups = [];
    this.nextPower = 3;
    this.rollers = [];
    this.nextRoller = 14;
    this.washed = false;
    this.ended = false;
    this.paintSfx = 0;
    ctx.world.snapCamera(0, 25, 19.5, 0, 0, 1.2);
    for (const p of ctx.players) ctx.phoneUI(p, { stick: true, a: null, b: 'Acelerón', msg: '¡Pinta todo lo que puedas!' });
  }

  build() {
    const s = this.ctx.scene;
    addLights(s);
    this.clouds = addClouds(s, 10, { radius: 60, yMin: -10, yMax: 0 });
    const base = withOutline(new THREE.Mesh(new THREE.BoxGeometry(N + 1.6, 2, N + 1.6), toon(0x9fdc7c)), 1.005);
    base.position.y = -1.15;
    s.add(base);
    const under = new THREE.Mesh(new THREE.BoxGeometry(N + 1.2, 3, N + 1.2), toon(0xb58a5f));
    under.position.y = -3.2;
    s.add(under);
    // casillas
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.3, 0.94), new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toon(0xffffff).gradientMap }), N * N);
    this.dummy = new THREE.Object3D();
    for (let k = 0; k < N * N; k++) {
      const c = tileCenter(k);
      this.dummy.position.set(c.x, -0.15, c.z);
      this.dummy.updateMatrix();
      this.tiles.setMatrixAt(k, this.dummy.matrix);
      this.tiles.setColorAt(k, this.white || new THREE.Color(WHITE));
    }
    s.add(this.tiles);
    // vallas
    const fenceMat = toon(0xffffff);
    const capMat = toon(0x34beed);
    for (const [x, z, w, d] of [[0, -HALF - 0.4, N + 1.6, 0.4], [0, HALF + 0.4, N + 1.6, 0.4], [-HALF - 0.4, 0, 0.4, N + 1.6], [HALF + 0.4, 0, 0.4, N + 1.6]]) {
      const f = withOutline(new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), fenceMat), 1.02);
      f.position.set(x, 0.2, z);
      s.add(f);
      const c = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), capMat);
      c.position.set(x, 0.6, z);
      s.add(c);
    }
    for (const [x, z] of [[-15, -14], [15, -14], [-16, 3], [16.5, 6], [-15, 13], [15.5, 14]]) s.add(tree(x, z, 1.2, -0.15));
    // franja de aviso de los rodillos
    this.warnMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.35, depthWrite: false });
  }

  start() {}

  setOwner(idx, who) {
    const prev = this.owner[idx];
    if (prev === who) return false;
    if (prev >= 0) this.counts[prev]--;
    if (who >= 0) this.counts[who]++;
    this.owner[idx] = who;
    this.tiles.setColorAt(idx, who >= 0 ? this.colors[who] : this.white);
    this.pop[idx] = 1;
    this.colorDirty = true;
    return true;
  }

  paintCircle(x, z, r, who) {
    let n = 0;
    for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      for (let j = Math.floor(z - r); j <= Math.ceil(z + r); j++) {
        const cx = i + 0.5, cz = j + 0.5;
        if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue;
        const idx = tileIndex(cx, cz);
        if (idx >= 0 && this.setOwner(idx, who)) n++;
      }
    }
    return n;
  }

  spawnPowerup() {
    const kind = pick(['cubo', 'rayo', 'bomba', 'cubo', 'rayo']);
    const g = new THREE.Group();
    if (kind === 'cubo') {
      const b = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 14), toon(0xdfe7ee)), 1.06);
      g.add(b);
      const paint = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 14), toon(0xff8fc7));
      paint.position.y = 0.28; g.add(paint);
    } else if (kind === 'rayo') {
      g.add(withOutline(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), toon(0xffc233)), 1.08));
    } else {
      g.add(withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), toon(0xa57bea)), 1.06));
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(pick([0xff5a5a, 0x4cd07d, 0x34beed, 0xffc233])));
        const a = rand(6.28), e = rand(-1, 1);
        sp.position.set(Math.cos(a) * 0.36 * Math.sqrt(1 - e * e), e * 0.36, Math.sin(a) * 0.36 * Math.sqrt(1 - e * e));
        g.add(sp);
      }
    }
    const x = rand(-HALF + 1.5, HALF - 1.5), z = rand(-HALF + 1.5, HALF - 1.5);
    g.position.set(x, 0.7, z);
    this.ctx.scene.add(g);
    this.powerups.push({ kind, x, z, g, t: rand(6) });
    this.ctx.fx.ring(x, 0.05, z, 0xffffff, 1.5);
  }

  spawnRoller() {
    const axis = Math.random() < 0.5 ? 'x' : 'z';      // dirección de avance
    const lane = randInt(-HALF + 3, HALF - 3);         // coordenada fija
    const dir = Math.random() < 0.5 ? 1 : -1;
    const width = 4.4;
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? N : width, axis === 'x' ? width : N), this.warnMat);
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(axis === 'x' ? 0 : lane, 0.04, axis === 'x' ? lane : 0);
    this.ctx.scene.add(warn);
    const g = new THREE.Group();
    const cyl = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, width, 20), toon(0xffffff)), 1.04);
    cyl.rotation.z = Math.PI / 2;
    g.add(cyl);
    for (const s of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.99, 0.35, 20), toon(0x34beed));
      band.rotation.z = Math.PI / 2;
      band.position.x = s * (width / 2 - 0.4);
      g.add(band);
    }
    if (axis === 'x') g.rotation.y = Math.PI / 2; // el cilindro queda a lo ancho de la franja
    const start = -dir * (HALF + 3);
    g.position.set(axis === 'x' ? start : lane, 0.95, axis === 'x' ? lane : start);
    g.visible = false;
    this.ctx.scene.add(g);
    this.rollers.push({ axis, lane, dir, width, pos: start, warn, g, cyl, t: 0, state: 'warn' });
    this.ctx.toast('🧻 ¡Rodillo a la vista!');
    this.ctx.sfx.play('whistle');
  }

  update(dt, active) {
    this.t += dt;
    this.clouds.update(dt);
    if (active && !this.ended) this.gt += dt;
    const live = active && !this.ended;

    // power-ups
    if (live) {
      this.nextPower -= dt;
      if (this.nextPower <= 0 && this.powerups.length < 3) { this.spawnPowerup(); this.nextPower = rand(3.5, 5.5); }
      this.nextRoller -= dt;
      if (this.nextRoller <= 0) { this.spawnRoller(); this.nextRoller = rand(9, 13); }
      if (!this.washed && this.gt > DURATION - 12) this.startWash();
    }
    for (const pu of this.powerups) {
      pu.t += dt;
      pu.g.position.y = 0.75 + Math.sin(pu.t * 3) * 0.15;
      pu.g.rotation.y += dt * 2;
    }

    // jugadores
    const groundAt = () => 0;
    for (const b of this.bodies) {
      if (b.p.bot && live) this.bot(b, dt);
      b.speedMul = b.fast > 0 ? 1.45 : 1;
      b.brush -= dt; b.fast -= dt;
      if (live) {
        const ev = b.control(b.p.input, dt, { canJump: false, canDash: true, dashCD: 1.8 });
        if (ev.dash) { this.ctx.sfx.play('whoosh'); this.ctx.fx.burst(b.x, 0.3, b.z, b.p.color, 6, 3, 0.5); }
      } else { b.vx *= 0.85; b.vz *= 0.85; }
      b.integrate(dt, groundAt);
      keepInBox(b, -HALF, HALF, -HALF, HALF);
    }
    collideBodies(this.bodies, (a, c, rel) => {
      const dasher = a.dashT > 0 ? a : c.dashT > 0 ? c : null;
      if (dasher) {
        const victim = dasher === a ? c : a;
        victim.stun = Math.max(victim.stun, 0.7);
        victim.av.bounce(0.5);
        this.ctx.sfx.play('boing');
      } else this.ctx.sfx.play('pop');
    });

    // pintar
    if (live) {
      let painted = 0;
      for (const b of this.bodies) {
        if (b.stun > 0) continue;
        if (b.brush > 0) painted += this.paintCircle(b.x, b.z, 1.25, b.idx);
        else { const idx = tileIndex(b.x, b.z); if (idx >= 0 && this.setOwner(idx, b.idx)) painted++; }
        // coger power-ups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
          const pu = this.powerups[i];
          if ((pu.x - b.x) ** 2 + (pu.z - b.z) ** 2 < 0.9) {
            this.ctx.scene.remove(pu.g);
            this.powerups.splice(i, 1);
            this.ctx.sfx.play('coin');
            this.ctx.fx.burst(pu.x, 0.8, pu.z, b.p.color, 14, 5, 0.7);
            if (pu.kind === 'cubo') { b.brush = 6; this.ctx.toast(`🪣 ${b.p.name} tiene la brocha gorda`); }
            else if (pu.kind === 'rayo') { b.fast = 5; this.ctx.toast(`⚡ ${b.p.name} va a toda pastilla`); }
            else {
              this.paintCircle(pu.x, pu.z, 3.3, b.idx);
              this.ctx.sfx.play('splash');
              this.ctx.fx.burst(pu.x, 0.5, pu.z, b.p.color, 30, 9, 1);
              this.ctx.world.shake(0.3);
            }
          }
        }
      }
      this.paintSfx -= dt;
      if (painted && this.paintSfx <= 0) { this.ctx.sfx.play('paint'); this.paintSfx = 0.09; }
    }

    this.updateRollers(dt, live);
    this.updateWash();

    // animación de casillas
    let mDirty = false;
    for (let k = 0; k < N * N; k++) {
      if (this.pop[k] > 0) {
        this.pop[k] = Math.max(0, this.pop[k] - dt * 4);
        const c = tileCenter(k);
        const e = Math.sin(this.pop[k] * Math.PI);
        this.dummy.position.set(c.x, -0.15 + e * 0.12, c.z);
        this.dummy.scale.set(1 - e * 0.1, 1 + e * 0.4, 1 - e * 0.1);
        this.dummy.updateMatrix();
        this.tiles.setMatrixAt(k, this.dummy.matrix);
        mDirty = true;
      }
    }
    if (mDirty) this.tiles.instanceMatrix.needsUpdate = true;
    if (this.colorDirty && this.tiles.instanceColor) { this.tiles.instanceColor.needsUpdate = true; this.colorDirty = false; }

    for (const b of this.bodies) {
      b.av.setExpression(b.stun > 0 ? 'scared' : this.ended ? (b.place === 1 ? 'happy' : 'normal') : 'normal');
      b.av.sync(b.state(), dt);
    }

    if (live) {
      if (Math.floor(this.t * 4) !== this.hudTick) { this.hudTick = Math.floor(this.t * 4); this.drawHud(); }
      if (this.gt >= DURATION) this.end();
    }
  }

  drawHud() {
    const total = N * N;
    const left = Math.max(0, Math.ceil(DURATION - this.gt));
    const rows = this.bodies.map((b) => {
      const pct = (this.counts[b.idx] / total) * 100;
      return `<div class="hud-bar"><span class="dot" style="background:${hex(b.p.color)}"></span><span class="nm">${this.ctx.escape(b.p.name)}</span><span class="track"><i style="width:${Math.min(100, pct * 2.2)}%;background:${hex(b.p.color)}"></i></span><b>${pct.toFixed(0)}%</b></div>`;
    }).join('');
    this.ctx.hud(`<div class="hud-pill big ${left <= 10 ? 'warn' : ''}">⏱ ${left}</div><div class="hud-bars">${rows}</div>`);
  }

  updateRollers(dt, live) {
    for (let i = this.rollers.length - 1; i >= 0; i--) {
      const r = this.rollers[i];
      r.t += dt;
      if (r.state === 'warn') {
        r.warn.material.opacity = 0.2 + 0.25 * (Math.floor(r.t * 8) % 2);
        if (r.t > 1.7) { r.state = 'roll'; r.g.visible = true; this.ctx.sfx.play('rumble'); }
        continue;
      }
      r.pos += r.dir * 8 * dt;
      if (r.axis === 'x') r.g.position.x = r.pos; else r.g.position.z = r.pos;
      r.cyl.rotation.x += r.dir * dt * 8;
      // borrar casillas bajo el rodillo
      if (live) {
        const half = r.width / 2;
        for (let s = -half + 0.3; s <= half - 0.3; s += 0.5) {
          const x = r.axis === 'x' ? r.pos : r.lane + s;
          const z = r.axis === 'x' ? r.lane + s : r.pos;
          const idx = tileIndex(x, z);
          if (idx >= 0) this.setOwner(idx, -1);
        }
        for (const b of this.bodies) {
          if (b.stun > 0) continue;
          const along = r.axis === 'x' ? b.x - r.pos : b.z - r.pos;
          const across = r.axis === 'x' ? b.z - r.lane : b.x - r.lane;
          if (Math.abs(along) < 1.1 && Math.abs(across) < half + 0.3) {
            const kx = r.axis === 'x' ? r.dir * 7 : Math.sign(across || 1) * 4;
            const kz = r.axis === 'x' ? Math.sign(across || 1) * 4 : r.dir * 7;
            b.knock(kx, 7, kz, 1.2);
            this.ctx.sfx.play('hit');
            this.ctx.vibrate(b.p, 200);
            this.ctx.fx.burst(b.x, 1, b.z, 0xffffff, 10, 5, 0.6);
          }
        }
      }
      if (Math.abs(r.pos) > HALF + 3.5) {
        this.ctx.scene.remove(r.g); this.ctx.scene.remove(r.warn);
        this.rollers.splice(i, 1);
      } else if (Math.abs(r.pos) < HALF) {
        r.warn.material.opacity = 0.18;
      }
    }
  }

  startWash() {
    this.washed = true;
    const qx = Math.random() < 0.5 ? -1 : 1, qz = Math.random() < 0.5 ? -1 : 1;
    this.ctx.toast('🚿 ¡LAVADO! Una esquina vuelve a blanco');
    this.ctx.sfx.play('splash');
    for (let k = 0; k < N * N; k++) {
      const c = tileCenter(k);
      if (Math.sign(c.x) === qx && Math.sign(c.z) === qz) {
        const d = Math.hypot(c.x - qx * HALF, c.z - qz * HALF);
        this.washAt[k] = this.gt + 0.4 + d * 0.09;
      }
    }
  }

  updateWash() {
    if (!this.washed) return;
    for (let k = 0; k < N * N; k++) {
      if (this.washAt[k] > 0 && this.gt >= this.washAt[k]) {
        this.washAt[k] = -1;
        this.setOwner(k, -1);
        if (Math.random() < 0.05) { const c = tileCenter(k); this.ctx.fx.burst(c.x, 0.2, c.z, 0x9fdcff, 3, 3, 0.4); }
      }
    }
  }

  bot(b, dt) {
    const p = b.p, m = p.botMem, prof = p.prof, inp = p.input;
    m.think = (m.think || 0) - dt;
    const danger = (x, z) => this.rollers.some((r) => Math.abs((r.axis === 'x' ? z : x) - r.lane) < r.width / 2 + 0.8 &&
      (r.state === 'warn' || Math.sign((r.axis === 'x' ? x : z) - r.pos) === r.dir));
    if (m.think <= 0 || m.tx === undefined || ((m.tx - b.x) ** 2 + (m.tz - b.z) ** 2 < 0.5) || danger(m.tx, m.tz)) {
      m.think = prof.think * rand(1.5, 3);
      let best = null, bestS = -1e9;
      for (const pu of this.powerups) {
        const d = Math.hypot(pu.x - b.x, pu.z - b.z);
        const s = 5 - d * 0.35 + prof.skill * 2;
        if (s > bestS && !danger(pu.x, pu.z)) { bestS = s; best = { x: pu.x, z: pu.z }; }
      }
      const leader = this.counts.indexOf(Math.max(...this.counts));
      for (let n = 0; n < 22; n++) {
        const a = rand(6.283), rr = rand(1.5, 8);
        const x = clamp(b.x + Math.cos(a) * rr, -HALF + 0.6, HALF - 0.6), z = clamp(b.z + Math.sin(a) * rr, -HALF + 0.6, HALF - 0.6);
        let gain = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const idx = tileIndex(x + i, z + j);
          if (idx < 0) continue;
          const o = this.owner[idx];
          if (o !== b.idx) gain += o === leader && leader !== b.idx ? 1.4 : 1;
        }
        const s = gain * 0.6 * (0.5 + prof.skill) - rr * 0.2 + rand(0, 2.5 * (1 - prof.skill));
        if (s > bestS && !danger(x, z)) { bestS = s; best = { x, z }; }
      }
      if (best) { m.tx = best.x; m.tz = best.z; }
    }
    // huir de la franja del rodillo
    let st = steerTo(b, m.tx, m.tz, 0.8);
    for (const r of this.rollers) {
      const across = (r.axis === 'x' ? b.z : b.x) - r.lane;
      if (Math.abs(across) < r.width / 2 + 0.9 && (r.state === 'warn' || Math.sign((r.axis === 'x' ? b.x : b.z) - r.pos) === r.dir)) {
        const s = Math.sign(across) || 1;
        st = r.axis === 'x' ? { x: st.x * 0.3, y: -s } : { x: s, y: st.y * 0.3 };
      }
    }
    m.wob = (m.wob || 0) + dt * 3;
    const wob = (1 - prof.skill) * 0.35;
    inp.x = clamp(st.x * prof.speed + Math.sin(m.wob) * wob, -1, 1);
    inp.y = clamp(st.y * prof.speed + Math.cos(m.wob * 1.3) * wob, -1, 1);
    inp.bHit = false;
    const d = Math.hypot(m.tx - b.x, m.tz - b.z);
    if (b.dashCD <= 0 && d > 4 && Math.random() < dt * prof.skill * 0.8) inp.bHit = true;
  }

  end() {
    this.ended = true;
    const order = this.bodies.slice().sort((a, b) => this.counts[b.idx] - this.counts[a.idx]);
    const groups = [];
    let last = null;
    for (const b of order) {
      const c = this.counts[b.idx];
      if (last !== null && c === last) groups[groups.length - 1].push(b.p.id);
      else groups.push([b.p.id]);
      last = c;
    }
    let place = 1;
    for (const g of groups) { for (const id of g) this.bodies.find((b) => b.p.id === id).place = place; place += g.length; }
    for (const b of this.bodies) if (b.place === 1) { b.av.pose = 'cheer'; this.ctx.fx.confetti(b.x, 3, b.z, 50); }
    this.drawHud();
    this.ctx.finish(groups);
  }

  dispose() {}
}

function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }
