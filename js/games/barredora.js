// LA BARREDORA — salta la barra giratoria (y agáchate bajo la alta). Último en pie gana.
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds } from '../world.js';
import { Body, collideBodies } from '../mover.js';
import { rand, clamp, TAU } from '../util.js';
import { ring, Eliminations, waterPlane, canvasTex } from './common.js';

const R = 9;            // radio de la plataforma
const PILLAR = 1.15;    // radio del pilar central
const L = R + 0.8;      // largo de cada brazo
const LOW_Y = 0.45, LOW_TOP = 0.52;   // hay que tener los pies por encima de LOW_TOP
const HIT_W = 0.5;                     // media anchura (barra + cuerpo) para el golpe
const HIGH_Y = 1.5, HIGH_CLEAR = 1.6;

export default {
  id: 'barredora',
  name: 'La Barredora',
  short: 'Barredora',
  tag: 'Salta la barra giratoria',
  icon: '🌀',
  color: '#ff5a5a',
  music: 'game',
  minPlayers: 2,
  desc: 'Una barra gira barriendo la plataforma cada vez más rápido. <b>Salta</b> para esquivarla. Más tarde aparece una <b>barra alta</b>: agáchate. Si saltas sobre la cabeza de otro, rebotas.',
  controls: { stick: 'Moverte', a: 'Saltar', b: 'Agacharse' },
  create: (ctx) => new Barredora(ctx),
};

// Distancia angular a una barra de diámetro completo (periodo π) con signo en (-π/2, π/2]
function sdiff(a, b) {
  let d = (a - b) % Math.PI;
  if (d <= -Math.PI / 2) d += Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  return d;
}

class Barredora {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.frame = 0;
    ctx.setSky('linear-gradient(#5fc8f4 0%, #9edcf7 50%, #e3f6fd 100%)', 0xcdeefb);
    this.build();
    this.elim = new Eliminations();
    const spots = ring(ctx.players.length, 5.2);
    this.bodies = ctx.players.map((p, i) => {
      const b = new Body(p, spots[i].x, spots[i].z, 0);
      b.facing = spots[i].facing;
      b.av = ctx.makeAvatar(p);
      return b;
    });
    this.rot = 0;        // giro acumulado de las barras
    this.omega = 1.05;
    this.dir = 1;
    this.dirMul = 1;
    this.highOn = false;
    this.highRise = 0;
    this.nextFlip = rand(20, 26);
    this.flipWarn = 0;
    this.ended = false;
    ctx.world.snapCamera(0, 15.5, 17.5, 0, -0.5, 0.8);
    for (const p of ctx.players) ctx.phoneUI(p, { stick: true, a: 'Saltar', b: 'Agacharse', msg: '¡Que no te barra!' });
  }

  build() {
    const s = this.ctx.scene;
    addLights(s);
    this.clouds = addClouds(s, 14, { radius: 70, yMin: -14, yMax: 4 });
    s.add(waterPlane(0x56c3ee, -14, 400));
    // plataforma
    const top = canvasTex(512, 512, (c, W) => {
      const cx = W / 2;
      for (let i = 8; i >= 1; i--) {
        c.fillStyle = i % 2 ? '#ffffff' : '#e6f4fb';
        c.beginPath(); c.arc(cx, cx, (i / 8) * cx, 0, TAU); c.fill();
      }
      c.strokeStyle = 'rgba(52,190,237,0.35)';
      c.lineWidth = 6;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * 60, cx + Math.sin(a) * 60); c.lineTo(cx + Math.cos(a) * cx, cx + Math.sin(a) * cx); c.stroke();
      }
      c.lineWidth = 14; c.strokeStyle = '#34beed';
      c.beginPath(); c.arc(cx, cx, cx - 8, 0, TAU); c.stroke();
    });
    const plat = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.96, 1.2, 64), toon(0x34beed)), 1.01);
    plat.position.y = -0.6;
    s.add(plat);
    const deco = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshToonMaterial({ map: top, gradientMap: toon(0xffffff).gradientMap }));
    deco.rotation.x = -Math.PI / 2;
    deco.position.y = 0.005;
    deco.userData.ownMap = true;
    s.add(deco);
    const rock = new THREE.Mesh(new THREE.ConeGeometry(R * 0.95, 9, 9), toon(0x9b7a5a));
    rock.rotation.x = Math.PI;
    rock.position.y = -5.7;
    s.add(rock);
    // pilar
    const pillar = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(PILLAR, PILLAR * 1.1, 2.2, 24), toon(0xffffff)), 1.04);
    pillar.position.y = 1.1;
    s.add(pillar);
    this.dome = withOutline(new THREE.Mesh(new THREE.SphereGeometry(PILLAR * 0.95, 20, 12, 0, TAU, 0, Math.PI / 2), toon(0xff5a5a)), 1.04);
    this.dome.position.y = 2.2;
    s.add(this.dome);

    // franjas en anillo a lo largo de la barra (se ve mejor el giro)
    const stripes = (a, b) => canvasTex(32, 256, (c, W, H) => {
      for (let i = 0; i < 18; i++) { c.fillStyle = i % 2 ? a : b; c.fillRect(0, (i * H) / 18, W, H / 18 + 1); }
    }, [1, 1]);
    // brazo bajo
    this.lowMat = new THREE.MeshToonMaterial({ map: stripes('#ff5a5a', '#ffffff'), gradientMap: toon(0xffffff).gradientMap });
    this.low = new THREE.Group();
    const lowBar = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, L * 2, 14), this.lowMat), 1.08);
    lowBar.rotation.z = Math.PI / 2;
    lowBar.userData.ownMap = true;
    this.low.add(lowBar);
    for (const sx of [-1, 1]) {
      const cap = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), toon(0xff5a5a)), 1.06);
      cap.position.x = sx * L;
      this.low.add(cap);
    }
    this.low.position.y = LOW_Y;
    s.add(this.low);
    // brazo alto (aparece más tarde)
    this.highMat = new THREE.MeshToonMaterial({ map: stripes('#ffc233', '#3b3b48'), gradientMap: toon(0xffffff).gradientMap });
    this.high = new THREE.Group();
    const hb = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, L * 2, 14), this.highMat), 1.08);
    hb.rotation.z = Math.PI / 2;
    hb.userData.ownMap = true;
    this.high.add(hb);
    this.high.position.y = -3;
    this.high.visible = false;
    s.add(this.high);
  }

  start() {
    // colocar la barra en el hueco más grande entre jugadores
    let best = 0, bestD = -1;
    for (let k = 0; k < 72; k++) {
      const beta = (k / 72) * Math.PI;
      let dmin = 9;
      for (const b of this.bodies) dmin = Math.min(dmin, Math.abs(sdiff(Math.atan2(b.z, b.x), beta)), Math.abs(sdiff(Math.atan2(b.z, b.x), beta + Math.PI / 2)));
      if (dmin > bestD) { bestD = dmin; best = beta; }
    }
    this.rot = -best;
    this.ctx.sfx.play('whoosh');
  }

  // ángulo (en el plano xz) del brazo bajo
  get beta() { return -this.rot; }

  timeToBar(phi, barAngle) {
    const w = -this.omega * this.dirMul; // velocidad angular de beta
    if (Math.abs(w) < 0.05) return 99;
    let d = w > 0 ? (phi - barAngle) % Math.PI : (barAngle - phi) % Math.PI;
    if (d < 0) d += Math.PI;
    return d / Math.abs(w);
  }

  update(dt, active) {
    this.t += dt; this.frame++;
    this.clouds.update(dt);
    if (active && !this.ended) {
      this.gt = (this.gt || 0) + dt;
      this.omega = Math.min(3.15, 1.05 + this.gt * 0.042);
      // cambio de sentido
      if (this.gt > this.nextFlip - 1.3 && !this.flipWarn) {
        this.flipWarn = 1;
        this.ctx.toast('🔄 ¡Cambio de sentido!');
        this.ctx.sfx.play('whistle');
      }
      if (this.gt > this.nextFlip) {
        this.dir *= -1; this.flipWarn = 0; this.nextFlip = this.gt + rand(13, 21);
      }
      if (!this.highOn && this.gt > 22) {
        this.highOn = true;
        this.high.visible = true;
        this.ctx.toast('⚠️ ¡Llega la barra alta! Agáchate con B');
        this.ctx.sfx.play('rumble');
      }
    }
    this.dirMul += clamp(this.dir - this.dirMul, -dt * 3.5, dt * 3.5);
    const prevBeta = this.beta;
    if (active || this.ended) this.rot += this.omega * this.dirMul * dt * (this.ended ? 0.4 : 1);
    else this.rot += 0.35 * dt;
    this.low.rotation.y = this.rot;
    this.high.rotation.y = this.rot + Math.PI / 2;
    this.dome.rotation.y = this.rot * 2;
    if (this.highOn) { this.highRise = Math.min(1, this.highRise + dt * 0.7); this.high.position.y = -3 + (HIGH_Y + 3) * this.highRise; }
    const blink = this.flipWarn && Math.floor(this.t * 10) % 2 === 0;
    this.lowMat.color.setHex(blink ? 0xffe08a : 0xffffff);

    const groundAt = (x, z, y) => (x * x + z * z <= R * R && y > -0.7 ? 0 : null);
    for (const b of this.bodies) {
      const inp = b.p.input;
      if (b.p.bot && active && b.alive) this.bot(b, dt);
      if (active && b.alive && !this.ended) {
        const ev = b.control(inp, dt, { canJump: true, canCrouch: true });
        if (ev.jump) this.ctx.sfx.play('jump');
      } else if (!b.ko) {
        b.vx *= 0.85; b.vz *= 0.85;
      }
      if (b.integrate(dt, groundAt)) this.ctx.sfx.play('land');
      // pilar
      const r = Math.hypot(b.x, b.z);
      if (r < PILLAR + b.radius && b.y < 2.3) {
        const k = (PILLAR + b.radius) / (r || 0.01);
        b.x *= k; b.z *= k;
      }
    }
    collideBodies(this.bodies.filter((b) => b.alive), (a, c) => { this.ctx.sfx.play('pop'); });
    this.headBounces();

    if (active && !this.ended) this.sweep(prevBeta);

    for (const b of this.bodies) {
      if (b.alive && b.y < -4) {
        b.alive = false;
        this.elim.out(b.p.id, this.frame);
        this.ctx.sfx.play('splash');
        this.ctx.fx.ring(b.x, -13.9, b.z, 0xffffff, 3);
        this.ctx.vibrate(b.p, 250);
        this.ctx.phoneUI(b.p, { stick: false, a: null, b: null, msg: 'Al agua 💦 ¡Ánimo a los demás!' });
      }
      if (b.y < -16) b.av.root.visible = false;
      b.av.setExpression(b.ko ? 'ko' : b.crouch ? 'scared' : this.ended && b.alive ? 'happy' : 'normal');
      b.av.sync(b.state(), dt);
    }

    if (active && !this.ended) {
      const alive = this.bodies.filter((b) => b.alive);
      if (alive.length <= 1 || this.gt > 150) this.end(alive);
      if (Math.floor(this.t * 4) !== this.hudTick) {
        this.hudTick = Math.floor(this.t * 4);
        this.ctx.hud(`<div class="hud-pill">⏱ ${Math.floor(this.gt)} s</div><div class="hud-pill">🧍 Vivos: ${alive.length}</div><div class="hud-pill">⚡ x${(this.omega / 1.05).toFixed(1)}</div>`);
      }
    }
  }

  headBounces() {
    for (const a of this.bodies) {
      if (!a.alive || a.ko || a.vy >= 0) continue;
      for (const b of this.bodies) {
        if (a === b || !b.alive || b.ko) continue;
        const dy = a.y - b.y;
        if (dy > 1.0 && dy < 2.1 && Math.hypot(a.x - b.x, a.z - b.z) < 0.75) {
          a.vy = 10.5;
          b.stun = Math.max(b.stun, 0.4);
          b.av.bounce(0.6);
          this.ctx.sfx.play('boing');
          this.ctx.fx.burst(b.x, b.y + 1.9, b.z, 0xffffff, 6, 3, 0.5);
        }
      }
    }
  }

  sweep(prevBeta) {
    const beta = this.beta;
    for (const b of this.bodies) {
      if (!b.alive || b.ko || b.immune > 0) continue;
      const r = Math.hypot(b.x, b.z);
      if (r < PILLAR || r > L + 0.3 || b.y < -1) continue;
      const phi = Math.atan2(b.z, b.x);
      const tol = HIT_W / Math.max(r, 0.5);
      for (const [off, isHigh] of [[0, false], [Math.PI / 2, true]]) {
        if (isHigh && this.highRise < 0.95) continue;
        const d0 = sdiff(phi, prevBeta + off), d1 = sdiff(phi, beta + off);
        const crossed = (Math.sign(d0) !== Math.sign(d1) && Math.abs(d0) < 0.6 && Math.abs(d1) < 0.6);
        if (!(Math.abs(d1) < tol || crossed)) continue;
        const hit = isHigh ? (!b.crouch && b.y < HIGH_CLEAR) : b.y < LOW_TOP;
        if (!hit) continue;
        const w = -this.omega * this.dirMul;
        const s = Math.sign(w) || 1;
        const tx = -Math.sin(phi) * s, tz = Math.cos(phi) * s;
        const ox = Math.cos(phi), oz = Math.sin(phi);
        const power = 9 + Math.abs(w) * r * 0.35;
        b.knock(tx * power + ox * 3, 8.5, tz * power + oz * 3, 1.3);
        b.ko = true;
        b.immune = 1;
        setTimeout(() => { b.ko = false; }, 700);
        this.ctx.sfx.play('hit');
        this.ctx.world.shake(0.35);
        this.ctx.fx.burst(b.x, b.y + 1, b.z, 0xffffff, 10, 6, 0.6);
        this.ctx.vibrate(b.p, 150);
        break;
      }
    }
  }

  bot(b, dt) {
    const p = b.p, m = p.botMem, prof = p.prof, inp = p.input;
    const r = Math.hypot(b.x, b.z);
    const phi = Math.atan2(b.z, b.x);
    // moverse un poco por la plataforma
    m.think = (m.think || 0) - dt;
    if (m.think <= 0 || m.tx === undefined) {
      m.think = rand(1, 2.5);
      const a = phi + rand(-1, 1), rr = rand(2.8, 6.6);
      m.tx = Math.cos(a) * rr; m.tz = Math.sin(a) * rr;
    }
    const dx = m.tx - b.x, dz = m.tz - b.z, d = Math.hypot(dx, dz);
    const sp = d > 0.4 ? 0.55 * prof.speed : 0;
    inp.x = d > 0 ? (dx / d) * sp : 0; inp.y = d > 0 ? -(dz / d) * sp : 0;
    if (r > R - 1.2) { inp.x = -b.x / r; inp.y = b.z / r; }

    const tLow = this.timeToBar(phi, this.beta);
    const tHigh = this.highRise >= 0.95 ? this.timeToBar(phi, this.beta + Math.PI / 2) : 99;
    // barra baja: decidir una vez por pasada. Lo ideal es saltar ~0,35 s antes (centro del tiempo en el aire)
    const spread = { facil: 0.17, normal: 0.1, dificil: 0.05 }[p.difficulty] ?? 0.1;
    if (tLow > 0.75) m.lowDecided = false;
    if (!m.lowDecided && tLow < 0.7) {
      m.lowDecided = true;
      m.jumpAt = 0.35 + rand(-spread, spread);
      m.miss = Math.random() < prof.err * 0.3 * (0.4 + this.omega / 2.5);
    }
    // con la barra cerca, quedarse quieto (si no, el salto se descuadra)
    if (tLow < 0.9 || tHigh < 0.9) { inp.x = 0; inp.y = 0; }
    inp.aHit = false;
    if (m.lowDecided && !m.miss && tLow <= m.jumpAt && b.grounded && !inp.b) {
      inp.aHit = true;
      m.miss = true; // ya saltó en esta pasada
    }
    // barra alta: agacharse y no levantarse hasta que haya pasado del todo
    const dHigh = this.highRise >= 0.95 ? Math.abs(sdiff(phi, this.beta + Math.PI / 2)) * Math.max(r, 0.5) : 99;
    if (tHigh > 0.9 && dHigh > 1.2) m.highDecided = false;
    if (!m.highDecided && tHigh < 0.85) { m.highDecided = true; m.highMiss = Math.random() < prof.err * 0.6; m.crouchAt = 0.45 + rand(-spread, spread * 2); }
    const lowSoon = tLow < 0.45 && tLow < tHigh;
    inp.b = !!(m.highDecided && !m.highMiss && !lowSoon && b.grounded && (tHigh < m.crouchAt || dHigh < 1.0));
  }

  end(alive) {
    this.ended = true;
    for (const b of alive) { b.av.pose = 'cheer'; this.ctx.fx.confetti(b.x, b.y + 3, b.z, 50); }
    this.ctx.finish(this.elim.groups(alive.map((b) => b.p.id)));
  }

  dispose() {}
}
