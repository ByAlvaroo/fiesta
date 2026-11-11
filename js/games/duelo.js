// DUELO AL SOL — reflejos puros en un pueblo del oeste. Torneo por eliminatorias.
import * as THREE from 'three';
import { toon, withOutline, addLights } from '../world.js';
import { rand, randInt, pick, shuffle, lerp, easeOutCubic } from '../util.js';
import { canvasTex } from './common.js';

const FAKES = ['¡YO!', '¡VA!', '¡YAK!', '¡AY!', '¡YO-YO!', '¡YA... NO!', '¡YAM!'];

export default {
  id: 'duelo',
  name: 'Duelo al Sol',
  short: 'Duelo al Sol',
  tag: 'El que dispara primero',
  icon: '🤠',
  color: '#ff8a3d',
  music: 'western',
  minPlayers: 2,
  desc: 'Torneo de duelos en el oeste. Cuando aparezca <b>¡YA!</b> en pantalla, dispara antes que tu rival. Si disparas antes de tiempo, pierdes. Cuidado con las señales trampa.',
  controls: { stick: null, a: 'Disparar', b: null },
  create: (ctx) => new Duelo(ctx),
};

class Duelo {
  constructor(ctx) {
    this.ctx = ctx;
    this.players = ctx.players;
    this.byId = new Map(this.players.map((p) => [p.id, p]));
    this.t = 0;
    ctx.setSky('linear-gradient(#ffb36b 0%, #ffd8a0 45%, #ffeccc 70%)', 0xffdcae);
    this.build();
    this.st = new Map();
    const hats = [0x8b5a2b, 0x3a3030, 0xf2efe6, 0xa0522d, 0x6b4a35];
    this.players.forEach((p, i) => {
      const av = ctx.makeAvatar(p);
      av.hat(hats[i % hats.length]);
      av.gun();
      this.st.set(p.id, { av, x: 0, y: 0, z: 0, facing: 0, speed: 0, vy: 0, grounded: true, ko: false, mode: 'spectator' });
    });
    this.alive = shuffle(this.players.map((p) => p.id));
    this.roundLosers = [];
    this.elim = [];
    this.round = 0;
    this.need = this.players.length <= 3 ? 2 : 1;
    this.phase = 'idle';
    this.placeSpectators();
    ctx.world.snapCamera(0, 3.2, 13, 0, 1.4, 0);
    this.tumble = null;
    this.bird = null;
  }

  build() {
    const s = this.ctx.scene;
    addLights(s, { sky: 0xfff1d6, ground: 0xe8b07a, sun: 0xfff0d0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), toon(0xefc283));
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);
    const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 5), toon(0xe0aa68));
    street.rotation.x = -Math.PI / 2;
    street.position.y = 0.01;
    s.add(street);

    // Edificios del pueblo
    const signs = ['SALOON', 'BANCO', 'SHERIFF', 'HOTEL', 'TIENDA', 'BARBERO'];
    const cols = [0xc98b5a, 0xa8673f, 0xe0a96d, 0x9c5b3b, 0xd29a64, 0xb57447];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const w = 4.2, h = rand(3.4, 4.6);
      const col = cols[i];
      const body = withOutline(new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), toon(col)), 1.01);
      body.position.y = h / 2;
      g.add(body);
      const front = withOutline(new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 1.2, 0.2), toon(col)), 1.02);
      front.position.set(0, h + 0.5, 1.45);
      g.add(front);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.1), toon(0x5a3a26));
      door.position.set(0, 0.95, 1.52);
      g.add(door);
      for (const wx of [-1.4, 1.4]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), toon(0xfbe7b5));
        win.position.set(wx, 2.2, 1.52);
        g.add(win);
      }
      const tex = canvasTex(256, 64, (c, W, H) => {
        c.fillStyle = '#f6e3bd'; c.fillRect(0, 0, W, H);
        c.strokeStyle = '#6b4a35'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
        c.fillStyle = '#5a3a26'; c.font = '700 38px Poppins, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(signs[i], W / 2, H / 2 + 2);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: tex }));
      sign.position.set(0, h + 0.5, 1.57);
      sign.userData.ownMap = true;
      g.add(sign);
      // porche
      const porch = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, 1.6), toon(0x8a5a3a));
      porch.position.set(0, 0.12, 2.3);
      g.add(porch);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.12, 1.7), toon(0x7a4a30));
      roof.position.set(0, 2.85, 2.3);
      g.add(roof);
      for (const px of [-w / 2, w / 2]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.7, 6), toon(0x7a4a30));
        post.position.set(px, 1.45, 3.05);
        g.add(post);
      }
      g.position.set((i - 2.5) * 5, 0, -8.5);
      s.add(g);
    }

    // Cactus y mesetas
    const cactus = (x, z, k = 1) => {
      const g = new THREE.Group();
      const mat = toon(0x5aa65a);
      const t = withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.35 * k, 2.2 * k, 4, 10), mat), 1.06);
      t.position.y = 1.4 * k; g.add(t);
      for (const sx of [-1, 1]) {
        const arm = withOutline(new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * k, 0.8 * k, 4, 8), mat), 1.08);
        arm.position.set(sx * 0.6 * k, (1.5 + (sx > 0 ? 0.5 : 0)) * k, 0);
        g.add(arm);
        const link = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * k, 0.18 * k, 0.5 * k, 8), mat);
        link.rotation.z = Math.PI / 2;
        link.position.set(sx * 0.35 * k, (1.15 + (sx > 0 ? 0.5 : 0)) * k, 0);
        g.add(link);
      }
      g.position.set(x, 0, z);
      s.add(g);
    };
    cactus(-15, -3, 1); cactus(16, -2, 0.9); cactus(-11, 6, 0.7); cactus(12, 7, 0.8); cactus(-24, -14, 1.3); cactus(25, -12, 1.2);
    for (let i = 0; i < 7; i++) {
      const w = rand(10, 20), h = rand(5, 11);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.55, h, 7), toon(pick([0xd9875a, 0xcf7a4e, 0xe39a68])));
      m.position.set(-70 + i * 23 + rand(-5, 5), h / 2, -60 - rand(15));
      s.add(m);
    }
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    sun.position.set(18, 26, -90);
    s.add(sun);
  }

  placeSpectators() {
    let i = 0;
    for (const p of this.players) {
      const s = this.st.get(p.id);
      if (s.mode === 'duel') continue;
      const out = !this.alive.includes(p.id);
      const k = i++;
      s.x = -11 + k * 3.1 + (k % 2) * 0.4; s.z = -6.1; s.y = 0.25;
      s.facing = 0; s.ko = false; s.speed = 0; s.mode = 'spectator';
      s.av.setExpression(out ? 'ko' : 'normal');
      s.av.pose = 'holster';
    }
  }

  start() {
    this.ctx.sfx.play('wind');
    this.nextRound();
  }

  nextRound() {
    this.round++;
    if (this.roundLosers.length) { this.elim.push(this.roundLosers); this.roundLosers = []; }
    if (this.alive.length <= 1) return this.end();
    const ids = shuffle(this.alive);
    this.pairs = [];
    while (ids.length >= 2) this.pairs.push([ids.pop(), ids.pop()]);
    this.bye = ids.length ? ids[0] : null;
    this.pairIdx = 0;
    const label = this.alive.length === 2 ? '¡GRAN FINAL!' : `Ronda ${this.round}`;
    this.ctx.announce(label, { color: '#ff8a3d', dur: 1.4 });
    if (this.bye) this.ctx.toast(`${this.byId.get(this.bye).name} pasa directo a la siguiente ronda`);
    this.wait(1.6, () => this.startDuel());
  }

  wait(t, fn) { this.timer = t; this.after = fn; }

  startDuel() {
    const [a, b] = this.pairs[this.pairIdx];
    this.duel = { a, b, wins: { [a]: 0, [b]: 0 } };
    for (const p of this.players) {
      const s = this.st.get(p.id);
      if (p.id === a || p.id === b) s.mode = 'duel';
      else if (s.mode === 'duel') s.mode = 'spectator';
    }
    this.placeSpectators();
    for (const p of this.players) {
      const inDuel = p.id === a || p.id === b;
      this.ctx.phoneUI(p, inDuel
        ? { stick: false, a: '¡DISPARA!', b: null, msg: '¡Es tu duelo! Dispara cuando veas ¡YA!' }
        : { stick: false, a: null, b: null, msg: 'Mira el duelo en la tele 🤠' });
    }
    this.resetDuelPositions();
  }

  resetDuelPositions() {
    const { a, b } = this.duel;
    const sa = this.st.get(a), sb = this.st.get(b);
    Object.assign(sa, { x: -0.5, z: 0, y: 0, facing: -Math.PI / 2, ko: false, vy: 0, grounded: true });
    Object.assign(sb, { x: 0.5, z: 0, y: 0, facing: Math.PI / 2, ko: false, vy: 0, grounded: true });
    for (const s of [sa, sb]) { s.av.pose = 'holster'; s.av.setExpression('normal'); s.fly = null; }
    this.phase = 'walk';
    this.pt = 0;
    this.steps = 0;
    this.ctx.signal(false);
    this.ctx.world.aimCamera(0, 2.6, 10.5, 0, 1.3, 0, 3);
    this.updateHud();
  }

  updateHud() {
    if (!this.duel) return;
    const pa = this.byId.get(this.duel.a), pb = this.byId.get(this.duel.b);
    const w = this.duel.wins;
    const best = this.need > 1 ? `<div class="hud-sub">Al mejor de 3 · ${w[pa.id]} - ${w[pb.id]}</div>` : '';
    this.ctx.hud(`<div class="hud-vs">${this.ctx.chip(pa)}<span>VS</span>${this.ctx.chip(pb)}</div>${best}`);
  }

  update(dt, active) {
    this.t += dt;
    if (active && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0 && this.after) { const f = this.after; this.after = null; f(); }
    }
    if (active && this.duel) this.updateDuel(dt);
    this.updateProps(dt);
    for (const s of this.st.values()) {
      if (s.fly) {
        s.fly.t += dt;
        s.vy -= 20 * dt;
        s.x += s.fly.vx * dt; s.y += s.vy * dt;
        if (s.y <= 0 && s.vy < 0) { s.y = 0; s.vy = 0; s.ko = false; s.fly = null; s.grounded = true; this.ctx.sfx.play('land'); this.ctx.fx.burst(s.x, 0.2, s.z, 0xe8c08a, 10, 3); }
        else s.grounded = false;
      }
      s.av.sync({ x: s.x, y: s.y, z: s.z, facing: s.facing, speed: s.speed, grounded: s.grounded, vy: s.vy, ko: s.ko, shadowY: 0 }, dt);
    }
  }

  updateDuel(dt) {
    const d = this.duel;
    const sa = this.st.get(d.a), sb = this.st.get(d.b);
    const pa = this.byId.get(d.a), pb = this.byId.get(d.b);
    this.pt += dt;
    if (this.phase === 'walk') {
      const k = Math.min(1, this.pt / 2.2);
      const e = easeOutCubic(k);
      sa.x = lerp(-0.5, -4.6, e); sb.x = lerp(0.5, 4.6, e);
      sa.speed = sb.speed = k < 1 ? 0.5 : 0;
      const step = Math.floor(this.pt / 0.42);
      if (step > this.steps && k < 1) { this.steps = step; this.ctx.sfx.play('drum'); }
      if (k >= 1) { this.phase = 'turn'; this.pt = 0; }
      this.checkEarly(pa, pb, false);
    } else if (this.phase === 'turn') {
      sa.facing = Math.PI / 2; sb.facing = -Math.PI / 2;
      if (this.pt > 0.5) this.beginWait();
      this.checkEarly(pa, pb, false);
    } else if (this.phase === 'wait') {
      for (const f of this.fakes) {
        if (!f.done && this.pt >= f.t) {
          f.done = true;
          if (f.kind === 'bird') { this.launchBird(); this.ctx.sfx.play('crow'); }
          else { this.ctx.announce(f.text, { color: '#ff5a5a', dur: 0.55, size: 'huge' }); this.ctx.sfx.play('go'); }
          for (const p of [pa, pb]) {
            if (p.bot && Math.random() < p.prof.err * 1.6) p.botMem.fireAt = this.t + rand(0.15, 0.35);
          }
        }
      }
      if (!this.tumble && Math.random() < dt * 0.15) this.launchTumble();
      this.botFire(pa); this.botFire(pb);
      if (this.checkEarly(pa, pb, true)) return;
      if (this.pt >= this.waitFor) {
        this.phase = 'fire';
        this.pt = 0;
        this.sigT = this.t;
        this.presses = [];
        this.ctx.announce('¡YA!', { color: '#ff5a5a', dur: 0.9, size: 'huge' });
        this.ctx.sfx.play('go');
        this.ctx.signal(true);
        for (const p of [pa, pb]) if (p.bot) {
          p.botMem.fireAt = this.t + rand(p.prof.react[0], p.prof.react[1]);
          if (Math.random() < p.prof.err * 0.5) p.botMem.fireAt += rand(0.2, 0.5);
        }
      }
    } else if (this.phase === 'fire') {
      this.botFire(pa); this.botFire(pb);
      for (const p of [pa, pb]) {
        if (p.input.aHit && !this.presses.some((q) => q.id === p.id)) {
          let rt = this.t - this.sigT;
          const r = p.input.aRT;
          if (p.kind === 'phone' && typeof r === 'number' && r >= 0 && r < 3000) rt = r / 1000;
          this.presses.push({ id: p.id, rt, at: this.t });
        }
      }
      if (this.presses.length && (this.t - this.presses[0].at > 0.15 || this.presses.length === 2)) {
        this.presses.sort((x, y) => x.rt - y.rt);
        const w = this.presses[0];
        this.resolve(w.id, w.id === d.a ? d.b : d.a, `${this.byId.get(w.id).name}: ${(w.rt).toFixed(3).replace('.', ',')} s`);
      } else if (this.pt > 2.6) {
        this.phase = 'result';
        this.ctx.announce('¡Demasiado lentos!', { color: '#a57bea', dur: 1.2 });
        this.ctx.sfx.play('lose');
        this.wait(1.4, () => this.resetDuelPositions());
      }
    }
  }

  botFire(p) {
    if (p.bot && p.botMem.fireAt && this.t >= p.botMem.fireAt) {
      p.botMem.fireAt = 0;
      p.input.aHit = true;
    }
  }

  // Disparos antes de tiempo
  checkEarly(pa, pb, armed) {
    for (const p of [pa, pb]) {
      if (p.input.aHit) {
        if (!armed) { p.input.aHit = false; continue; }
        const other = p === pa ? pb : pa;
        this.ctx.announce('¡Se ha adelantado!', { color: '#a57bea', dur: 1.2 });
        this.ctx.toast(`${p.name} ha disparado antes de tiempo`);
        this.resolve(other.id, p.id, null, true);
        return true;
      }
    }
    return false;
  }

  beginWait() {
    this.phase = 'wait';
    this.pt = 0;
    this.waitFor = rand(2.2, 5.6);
    this.fakes = [];
    const n = randInt(0, this.round >= 2 ? 3 : 2);
    for (let i = 0; i < n; i++) {
      const t = rand(0.9, this.waitFor - 0.5);
      if (t > 0.8) this.fakes.push({ t, kind: Math.random() < 0.25 ? 'bird' : 'text', text: pick(FAKES), done: false });
    }
    for (const id of [this.duel.a, this.duel.b]) { const p = this.byId.get(id); p.botMem.fireAt = 0; p.input.aHit = false; }
  }

  resolve(winId, loseId, msg, early = false) {
    this.phase = 'result';
    this.ctx.signal(false);
    const sw = this.st.get(winId), sl = this.st.get(loseId);
    const dir = Math.sign(sl.x - sw.x) || 1;
    if (!early) {
      sw.av.pose = 'aim';
      this.ctx.sfx.play('shot');
      this.ctx.world.shake(0.5);
      this.ctx.fx.burst(sw.x + dir * 0.9, 1.1, sw.z + 0.2, 0xffd23a, 12, 5, 0.6);
      if (msg) this.ctx.toast('⚡ ' + msg);
    } else {
      sl.av.setExpression('scared');
    }
    sl.ko = true;
    sl.vy = 7;
    sl.fly = { vx: dir * 4, t: 0 };
    sl.av.setExpression('ko');
    sw.av.setExpression('happy');
    this.ctx.fx.burst(sl.x, 1.2, sl.z, 0xffffff, 8, 4, 0.7);
    const winner = this.byId.get(winId), loser = this.byId.get(loseId);
    this.ctx.vibrate(loser, 300);
    this.ctx.world.aimCamera(sw.x * 0.6, 2.1, 7.5, sw.x * 0.5, 1.2, 0, 2.5);
    this.duel.wins[winId]++;
    this.updateHud();
    if (this.duel.wins[winId] >= this.need) {
      this.alive = this.alive.filter((id) => id !== loseId);
      this.roundLosers.push(loseId);
      this.ctx.phoneUI(loser, { stick: false, a: null, b: null, msg: 'Eliminado 💀 Mira el resto de duelos' });
      this.wait(2.4, () => {
        sw.av.pose = 'holster';
        this.pairIdx++;
        if (this.pairIdx < this.pairs.length) this.startDuel();
        else {
          this.duel = null;
          for (const s of this.st.values()) if (s.mode === 'duel') s.mode = 'spectator';
          this.placeSpectators();
          this.ctx.world.aimCamera(0, 3.2, 13, 0, 1.4, 0, 2);
          this.nextRound();
        }
      });
    } else {
      this.ctx.toast(`${winner.name} gana este asalto`);
      this.wait(2.2, () => this.resetDuelPositions());
    }
  }

  end() {
    const winner = this.alive[0];
    const s = this.st.get(winner);
    Object.assign(s, { x: 0, z: 1, y: 0, facing: 0, mode: 'duel' });
    s.av.pose = 'cheer';
    s.av.setExpression('happy');
    this.ctx.fx.confetti(0, 4, 1, 80);
    this.ctx.world.aimCamera(0, 2.2, 6, 0, 1.3, 0, 2);
    const groups = [[winner]];
    for (let i = this.elim.length - 1; i >= 0; i--) groups.push(this.elim[i]);
    this.ctx.finish(groups);
  }

  launchTumble() {
    if (!this.tumbleMesh) {
      this.tumbleMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshBasicMaterial({ color: 0xa8743c, wireframe: true }));
      this.ctx.scene.add(this.tumbleMesh);
    }
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.tumble = { x: -18 * dir, z: rand(1.5, 3.5), dir, t: 0 };
  }

  launchBird() {
    if (!this.birdMesh) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), toon(0x2f3140));
      g.add(body);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.35), toon(0x2f3140));
        w.position.x = sx * 0.55;
        w.userData.side = sx;
        g.add(w);
      }
      this.birdMesh = g;
      this.ctx.scene.add(g);
    }
    this.bird = { x: -16, y: 6, t: 0 };
  }

  updateProps(dt) {
    if (this.tumble && this.tumbleMesh) {
      const tb = this.tumble;
      tb.t += dt;
      tb.x += tb.dir * 5 * dt;
      const y = 0.6 + Math.abs(Math.sin(tb.t * 5)) * 0.6;
      this.tumbleMesh.position.set(tb.x, y, tb.z);
      this.tumbleMesh.rotation.z -= tb.dir * dt * 6;
      if (Math.abs(tb.x) > 20) this.tumble = null;
    }
    if (this.bird && this.birdMesh) {
      const b = this.bird;
      b.t += dt; b.x += 9 * dt;
      this.birdMesh.position.set(b.x, b.y + Math.sin(b.t * 3) * 0.5, -2);
      this.birdMesh.rotation.y = Math.PI / 2;
      for (const c of this.birdMesh.children) if (c.userData.side) c.rotation.z = c.userData.side * Math.sin(b.t * 16) * 0.6;
      if (b.x > 18) this.bird = null;
    }
  }

  dispose() {}
}
