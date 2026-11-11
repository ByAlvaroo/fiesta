// Personaje 3D tipo Mii hecho solo con primitivas
import * as THREE from 'three';
import { toon, withOutline, makeBlobShadow, textSprite } from './world.js';
import { drawFace, SKIN } from './face.js';
import { dampAngle, damp } from './util.js';

const G = {};
function geos() {
  if (G.body) return G;
  G.body = new THREE.CapsuleGeometry(0.4, 0.42, 6, 16);
  G.head = new THREE.SphereGeometry(0.5, 32, 20);
  G.hand = new THREE.SphereGeometry(0.14, 12, 10);
  G.foot = new THREE.SphereGeometry(0.17, 12, 10);
  G.gun = new THREE.BoxGeometry(0.1, 0.14, 0.42);
  G.hat = new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24);
  G.hatTop = new THREE.CylinderGeometry(0.3, 0.36, 0.34, 20);
  for (const k in G) G[k].userData = { keep: true };
  return G;
}

export const AVATAR_HEIGHT = 1.75;

export class Avatar {
  constructor(player, { nameTag = true } = {}) {
    const g = geos();
    this.player = player;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);

    const bodyMat = toon(player.color);
    this.body = withOutline(new THREE.Mesh(g.body, bodyMat), 1.05);
    this.body.position.y = 0.72;
    this.inner.add(this.body);

    // Cara en textura de canvas
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 512; this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const headMat = new THREE.MeshToonMaterial({ color: 0xffffff, map: this.faceTex, gradientMap: bodyMat.gradientMap });
    this.head = withOutline(new THREE.Mesh(g.head, headMat), 1.045);
    this.head.position.y = 1.42;
    this.inner.add(this.head);
    this.expr = null;
    this.setExpression('normal');

    const handMat = toon(player.color);
    this.hands = [-1, 1].map((s) => {
      const h = withOutline(new THREE.Mesh(g.hand, handMat), 1.1);
      h.position.set(s * 0.55, 0.72, 0.05);
      this.inner.add(h);
      return h;
    });
    const footMat = toon(0x4a4a5a);
    this.feet = [-1, 1].map((s) => {
      const f = new THREE.Mesh(g.foot, footMat);
      f.scale.set(1, 0.6, 1.4);
      f.position.set(s * 0.2, 0.08, 0.04);
      this.inner.add(f);
      return f;
    });

    // Punto de anclaje sobre la cabeza (bomba, coronas...)
    this.top = new THREE.Group();
    this.top.position.y = 2.0;
    this.inner.add(this.top);

    this.shadow = makeBlobShadow(1.3);
    if (nameTag) {
      this.tag = textSprite(player.name, { color: '#fff', bg: '#' + player.color.toString(16).padStart(6, '0') });
      this.tag.position.y = 2.45;
      this.root.add(this.tag);
    }

    this.t = Math.random() * 10;
    this.squash = 0;
    this.squashV = 0;
    this.facing = 0;
    this.wasGrounded = true;
    this.crouch = 0;
    this.spin = 0;
    this.pose = 'normal';
  }

  addTo(scene) { scene.add(this.root); scene.add(this.shadow); return this; }
  removeFrom(scene) { scene.remove(this.root); scene.remove(this.shadow); }

  setExpression(expr) {
    if (expr === this.expr) return;
    this.expr = expr;
    const ctx = this.faceCanvas.getContext('2d');
    ctx.fillStyle = SKIN;
    ctx.fillRect(0, 0, 512, 256);
    drawFace(ctx, 128, 128, 74, this.player.eyes, this.player.mouth, expr);
    this.faceTex.needsUpdate = true;
  }

  hat(color = 0x8b5a2b) {
    if (this.hatMesh) return;
    const g = geos();
    const h = new THREE.Group();
    h.add(withOutline(new THREE.Mesh(g.hat, toon(color)), 1.04));
    const top = withOutline(new THREE.Mesh(g.hatTop, toon(color)), 1.05);
    top.position.y = 0.18;
    h.add(top);
    h.position.y = 1.82;
    h.rotation.x = -0.08;
    this.inner.add(h);
    this.hatMesh = h;
  }

  gun() {
    if (this.gunMesh) return this.gunMesh;
    this.gunMesh = new THREE.Mesh(geos().gun, toon(0x3a3a46));
    this.gunMesh.position.set(0, 0, 0.18);
    this.hands[1].add(this.gunMesh);
    return this.gunMesh;
  }

  bounce(amount = 0.35) { this.squashV -= amount * 12; }

  // Coloca el personaje. st: {x,y,z, facing, speed(0-1), grounded, vy, crouch, ko, shadowY}
  sync(st, dt) {
    this.root.position.set(st.x, st.y, st.z);
    if (st.facing !== undefined) this.facing = dampAngle(this.facing, st.facing, 12, dt);
    this.root.rotation.y = this.facing;
    this.anim(dt, st);
    if (st.shadowY === null || st.shadowY === undefined || st.y - st.shadowY > 30) {
      this.shadow.visible = false;
    } else {
      this.shadow.visible = true;
      const h = Math.max(0, st.y - st.shadowY);
      this.shadow.position.set(st.x, st.shadowY + 0.03, st.z);
      this.shadow.scale.setScalar(Math.max(0.3, 1 - h * 0.08));
    }
  }

  anim(dt, st) {
    const speed = st.speed || 0;
    this.t += dt * (5 + speed * 9);
    const sw = Math.sin(this.t);

    if (st.grounded && !this.wasGrounded) this.bounce(Math.min(0.5, 0.15 + Math.abs(st.vyBefore || 0) * 0.025));
    this.wasGrounded = st.grounded;

    // muelle para aplastar/estirar
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const stretch = !st.grounded && st.vy > 2 ? 0.12 : 0;
    this.crouch = damp(this.crouch, st.crouch ? 1 : 0, 18, dt);
    const sy = 1 + this.squash + stretch - this.crouch * 0.38;
    const sxz = 1 - (this.squash + stretch) * 0.5 + this.crouch * 0.18;
    this.inner.scale.set(sxz, Math.max(0.3, sy), sxz);

    this.inner.position.y = st.grounded ? Math.abs(sw) * 0.09 * speed : 0;
    this.inner.rotation.x = speed * 0.18;
    if (st.ko) {
      this.spin += dt * 14;
      this.inner.rotation.x = this.spin;
      this.inner.rotation.z = this.spin * 0.6;
    } else {
      this.inner.rotation.z = 0;
    }

    // manos y pies
    if (this.pose === 'aim') {
      this.hands[1].position.set(0.35, 1.05, 0.5);
      this.hands[0].position.set(-0.55, 0.72, 0.05);
    } else if (this.pose === 'holster') {
      this.hands[1].position.set(0.55, 0.62, 0.1);
      this.hands[0].position.set(-0.55, 0.62, 0.1);
    } else if (this.pose === 'cheer') {
      const up = 1.35 + Math.abs(Math.sin(this.t * 1.5)) * 0.25;
      this.hands[0].position.set(-0.58, up, 0.05);
      this.hands[1].position.set(0.58, up, 0.05);
    } else if (!st.grounded) {
      this.hands[0].position.set(-0.62, 1.05, 0);
      this.hands[1].position.set(0.62, 1.05, 0);
    } else {
      this.hands[0].position.set(-0.55, 0.72, 0.05 + sw * 0.28 * speed);
      this.hands[1].position.set(0.55, 0.72, 0.05 - sw * 0.28 * speed);
    }
    this.feet[0].position.z = 0.04 + (st.grounded ? sw * 0.22 * speed : 0.1);
    this.feet[1].position.z = 0.04 - (st.grounded ? sw * 0.22 * speed : -0.1);
  }

  dispose() {
    this.faceTex.dispose();
    if (this.tag) this.tag.material.map.dispose();
  }
}
