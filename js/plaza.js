// Isla flotante del menú y de la sala: los jugadores que se unen aparecen aquí y pueden moverse
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds, FX } from './world.js';
import { Avatar } from './avatar.js';
import { Body } from './mover.js';
import { Player } from './players.js';
import { COLORS } from './face.js';
import { rand, pick, randInt, TAU } from './util.js';
import { tree, waterPlane } from './games/common.js';

const R = 10;

export class Plaza {
  constructor(world, sfx) {
    this.world = world;
    this.sfx = sfx;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcdeefb, 40, 120);
    this.fx = new FX(this.scene);
    this.chars = new Map();
    this.t = 0;
    this.mode = 'menu';
    this.build();
    // personajes de demostración para el menú
    this.demo = [];
    for (let i = 0; i < 6; i++) {
      const p = new Player({ id: 'demo' + i, name: '', color: COLORS[i].hex, eyes: randInt(0, 5), mouth: randInt(0, 5), kind: 'bot' });
      this.demo.push(this.addChar(p, { nameTag: false, drop: false }));
    }
  }

  build() {
    const s = this.scene;
    addLights(s);
    this.clouds = addClouds(s, 18, { radius: 70, yMin: -18, yMax: 10 });
    s.add(waterPlane(0x5fc9f0, -24, 500));
    const top = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 1.4, 48), toon(0x7ed46a)), 1.01);
    top.position.y = -0.7;
    s.add(top);
    const dirt = new THREE.Mesh(new THREE.ConeGeometry(R * 0.96, 10, 12), toon(0xb58a5f));
    dirt.rotation.x = Math.PI;
    dirt.position.y = -6.4;
    s.add(dirt);
    for (const [x, z, k] of [[-7, -4, 1.3], [6.5, -5.5, 1.5], [-3, -7.5, 1.1], [7.8, 1.5, 1], [-8.2, 2.5, 0.9], [2.5, -8, 1.2]]) s.add(tree(x, z, k));
    const fl = [0xff5a5a, 0xffc233, 0xff8fc7, 0xffffff, 0xa57bea];
    for (let i = 0; i < 40; i++) {
      const a = rand(TAU), r = rand(2, R - 0.6);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(pick(fl)));
      f.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      s.add(f);
    }
    // casita
    const house = new THREE.Group();
    const body = withOutline(new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), toon(0xfff3e0)), 1.02);
    body.position.y = 1.1; house.add(body);
    const roof = withOutline(new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.6, 4), toon(0xff5a5a)), 1.03);
    roof.position.y = 3; roof.rotation.y = Math.PI / 4; house.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.3, 0.1), toon(0x9b6a43));
    door.position.set(0, 0.65, 1.21); house.add(door);
    house.position.set(-2, 0, -6);
    house.rotation.y = 0.2;
    s.add(house);
    this.obstacles = [{ x: -2, z: -6, r: 1.9 }];
  }

  addChar(p, { nameTag = true, drop = true } = {}) {
    const a = rand(TAU), r = rand(1, 6);
    const body = new Body(p, Math.cos(a) * r, Math.sin(a) * r + 2, drop ? 10 : 0);
    body.baseSpeed = 5.5;
    body.facing = rand(-0.5, 0.5);
    const av = new Avatar(p, { nameTag }).addTo(this.scene);
    const c = { p, body, av, demo: !nameTag };
    this.chars.set(p.id, c);
    if (drop) this.fx.ring(body.x, 0.05, body.z, p.color, 2);
    return c;
  }

  removeChar(id) {
    const c = this.chars.get(id);
    if (!c) return;
    this.fx.burst(c.body.x, c.body.y + 1, c.body.z, c.p.color, 12, 5, 0.7);
    c.av.removeFrom(this.scene);
    c.av.dispose();
    this.chars.delete(id);
  }

  // Sincroniza con la lista de jugadores reales
  syncPlayers(players) {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, c] of this.chars) if (!c.demo && !ids.has(id)) this.removeChar(id);
    for (const p of players) {
      const c = this.chars.get(p.id);
      if (c && c.sig !== sig(p)) { this.removeChar(p.id); }
      if (!this.chars.has(p.id)) { const n = this.addChar(p); n.sig = sig(p); }
    }
    const showDemo = this.mode === 'menu' || players.length === 0;
    for (const d of this.demo) { d.av.root.visible = showDemo; d.av.shadow.visible = showDemo; d.active = showDemo; }
  }

  setMode(mode) {
    this.mode = mode;
  }

  cheer(id) {
    const c = this.chars.get(id);
    if (c) { c.av.pose = 'cheer'; c.cheerT = 3; }
  }

  update(dt) {
    this.t += dt;
    this.clouds.update(dt);
    this.fx.update(dt);
    const groundAt = (x, z) => (x * x + z * z <= R * R ? 0 : null);
    for (const c of this.chars.values()) {
      if (c.demo && !c.active) continue;
      const b = c.body, inp = c.p.input;
      if (c.p.bot || c.demo) this.wander(c, dt);
      const ev = b.control(c.demo ? c.inp : inp, dt, { canJump: true });
      if (ev.jump && !c.demo) this.sfx.play('jump');
      b.integrate(dt, groundAt);
      for (const o of this.obstacles) {
        const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz);
        if (d < o.r + b.radius && d > 0.01) { b.x = o.x + (dx / d) * (o.r + b.radius); b.z = o.z + (dz / d) * (o.r + b.radius); }
      }
      if (b.y < -20) { b.x = rand(-4, 4); b.z = rand(-2, 5); b.y = 12; b.vx = b.vz = b.vy = 0; }
      if (c.cheerT > 0) { c.cheerT -= dt; if (c.cheerT <= 0) c.av.pose = 'normal'; }
      c.av.setExpression(!b.grounded && b.vy < -10 ? 'scared' : c.cheerT > 0 ? 'happy' : 'normal');
      c.av.sync(b.state(), dt);
    }
    // cámara
    if (this.mode === 'menu') {
      const a = this.t * 0.08;
      this.world.aimCamera(Math.sin(a) * 21, 9, Math.cos(a) * 21, 0, 0.5, 0, 2);
    } else {
      this.world.aimCamera(0, 11, 19, 0, 0.6, 0, 2);
    }
  }

  wander(c, dt) {
    const b = c.body;
    const m = c.mem || (c.mem = { t: 0 });
    c.inp = c.inp || { x: 0, y: 0, aHit: false };
    const inp = c.demo ? c.inp : c.p.input;
    inp.aHit = false;
    m.t -= dt;
    if (m.t <= 0) {
      m.t = rand(1.2, 3.5);
      if (Math.random() < 0.35) { m.tx = null; }
      else { const a = rand(TAU), r = rand(0, 7); m.tx = Math.cos(a) * r; m.tz = Math.sin(a) * r + 1; }
      if (Math.random() < 0.3) inp.aHit = true;
    }
    if (m.tx === null || m.tx === undefined) { inp.x = 0; inp.y = 0; return; }
    const dx = m.tx - b.x, dz = m.tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { inp.x = 0; inp.y = 0; return; }
    inp.x = (dx / d) * 0.5; inp.y = -(dz / d) * 0.5;
  }
}

function sig(p) { return [p.name, p.color, p.eyes, p.mouth].join('|'); }
