// Podio final con confeti y globos
import * as THREE from 'three';
import { toon, withOutline, addLights, addClouds, FX } from './world.js';
import { Avatar } from './avatar.js';
import { rand, pick, TAU } from './util.js';
import { canvasTex } from './games/common.js';

export class Podium {
  constructor(world, ranking) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.fx = new FX(this.scene);
    this.t = 0;
    const s = this.scene;
    addLights(s);
    this.clouds = addClouds(s, 12, { radius: 60, yMin: 2, yMax: 16 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 1, 48), toon(0x7ed46a));
    floor.position.y = -0.5;
    s.add(floor);
    const stage = withOutline(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.5, 40), toon(0xffffff)), 1.01);
    stage.position.y = 0.25;
    s.add(stage);
    // podios
    const spots = [{ x: 0, h: 2.6, c: 0xffc233 }, { x: -2.6, h: 1.8, c: 0xd9e2ea }, { x: 2.6, h: 1.2, c: 0xe39a68 }];
    spots.forEach((sp, i) => {
      const m = withOutline(new THREE.Mesh(new THREE.BoxGeometry(2.4, sp.h, 2.2), toon(sp.c)), 1.02);
      m.position.set(sp.x, 0.5 + sp.h / 2, 0);
      s.add(m);
      const tex = canvasTex(128, 128, (c, W) => {
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 6, 0, TAU); c.fill();
        c.fillStyle = '#3b4552'; c.font = '800 80px Poppins, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(i + 1), W / 2, W / 2 + 6);
      });
      const num = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      num.position.set(sp.x, 0.5 + sp.h / 2, 1.12);
      num.userData.ownMap = true;
      s.add(num);
    });
    // globos
    this.balloons = [];
    for (let i = 0; i < 14; i++) {
      const b = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), toon(pick([0xff5a5a, 0x34beed, 0xffc233, 0x4cd07d, 0xa57bea, 0xff8fc7]))), 1.05);
      b.scale.y = 1.2;
      b.position.set(rand(-12, 12), rand(-6, 10), rand(-9, -3));
      b.userData.v = rand(0.8, 1.6);
      s.add(b);
      this.balloons.push(b);
    }
    this.avatars = [];
    ranking.forEach((p, i) => {
      const av = new Avatar(p).addTo(s);
      let st;
      if (i < 3) {
        const sp = spots[i];
        st = { x: sp.x, y: 0.5 + sp.h, z: 0, shadowY: 0.5 + sp.h };
        av.pose = i === 0 ? 'cheer' : 'normal';
        av.setExpression('happy');
      } else {
        const k = i - 3;
        st = { x: (k - (ranking.length - 4) / 2) * 1.6, y: 0.5, z: 3.6, shadowY: 0.5 };
        av.setExpression('normal');
      }
      this.avatars.push({ av, st: { ...st, facing: 0, speed: 0, grounded: true, vy: 0 }, i, jt: rand(2) });
    });
    world.snapCamera(0, 4.5, 13, 0, 2.6, 0);
    this.confT = 0;
  }

  update(dt) {
    this.t += dt;
    this.clouds.update(dt);
    this.fx.update(dt);
    this.confT -= dt;
    if (this.confT <= 0) { this.confT = rand(0.6, 1.4); this.fx.confetti(rand(-6, 6), 9, rand(-3, 2), 30, 5); }
    for (const b of this.balloons) {
      b.position.y += b.userData.v * dt;
      b.position.x += Math.sin(this.t + b.position.z) * dt * 0.3;
      if (b.position.y > 16) b.position.y = -6;
    }
    for (const a of this.avatars) {
      // los de abajo saltan y aplauden
      a.jt -= dt;
      if (a.jt <= 0 && a.i > 0) { a.jt = rand(0.8, 2.2); a.vy = 6; }
      if (a.vy !== undefined) {
        a.vy -= 22 * dt;
        a.st.y += a.vy * dt;
        const base = a.st.shadowY;
        if (a.st.y <= base) { a.st.y = base; a.vy = undefined; a.st.grounded = true; } else a.st.grounded = false;
      }
      a.st.facing = Math.sin(this.t * 0.8 + a.i) * 0.25;
      a.av.sync(a.st, dt);
    }
    this.world.aimCamera(Math.sin(this.t * 0.2) * 2, 4.5, 13, 0, 2.6, 0, 1.5);
  }
}
