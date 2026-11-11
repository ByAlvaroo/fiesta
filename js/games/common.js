// Piezas comunes a los minijuegos
import * as THREE from 'three';
import { toon, withOutline } from '../world.js';
import { rand } from '../util.js';

// Posiciones en círculo mirando al centro
export function ring(n, r, offset = Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, facing: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  return out;
}

// Registro de eliminaciones → clasificación final
export class Eliminations {
  constructor() { this.order = []; this.frame = null; }
  // Los eliminados en el mismo fotograma empatan
  out(id, frame) {
    const last = this.order[this.order.length - 1];
    if (last && frame !== undefined && last.frame === frame) last.ids.push(id);
    else this.order.push({ ids: [id], frame });
  }
  has(id) { return this.order.some((g) => g.ids.includes(id)); }
  groups(survivors) {
    const g = [];
    if (survivors.length) g.push(survivors);
    for (let i = this.order.length - 1; i >= 0; i--) g.push(this.order[i].ids.slice());
    return g;
  }
}

// Agua/mar estilizado de fondo
export function waterPlane(color = 0x5fc9f0, y = -6, size = 300) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 48), toon(color));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

// Árbol redondito
export function tree(x, z, s = 1, y = 0) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 1.2 * s, 8), toon(0x9b6a43));
  trunk.position.y = 0.6 * s;
  g.add(trunk);
  const leaves = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 14, 10), toon(0x5bc46b)), 1.04);
  leaves.position.y = 1.65 * s;
  g.add(leaves);
  const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.55 * s, 12, 8), toon(0x6fd47c));
  l2.position.set(0.45 * s, 1.35 * s, 0.25 * s);
  g.add(l2);
  g.position.set(x, y, z);
  g.rotation.y = rand(6);
  return g;
}

// Textura de canvas reutilizable
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Bomba de dibujos animados (también se usa en otros sitios)
export function cartoonBomb(scale = 1) {
  const g = new THREE.Group();
  const ball = withOutline(new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), toon(0x2f3140)), 1.06);
  g.add(ball);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12), toon(0x6b6f80));
  cap.position.y = 0.44;
  g.add(cap);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 6), toon(0xc9a36a));
  fuse.position.set(0.06, 0.6, 0);
  fuse.rotation.z = -0.4;
  g.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
  spark.position.set(0.13, 0.74, 0);
  g.add(spark);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  shine.position.set(-0.17, 0.18, 0.32);
  g.add(shine);
  g.scale.setScalar(scale);
  g.userData.spark = spark;
  return g;
}
