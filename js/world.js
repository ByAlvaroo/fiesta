// Motor 3D: renderizador, materiales "toon", efectos de partículas y cámara
import * as THREE from 'three';
import { rand, damp, pick } from './util.js';

let gradientMap = null;
function getGradient() {
  if (gradientMap) return gradientMap;
  gradientMap = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: getGradient(), ...opts.params });
  if (!opts.unique) matCache.set(key, m);
  return m;
}
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2b2b38, side: THREE.BackSide });

// Añade contorno negro (técnica del casco invertido)
export function withOutline(mesh, thickness = 1.06) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(thickness);
  mesh.add(o);
  return mesh;
}

export function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, opts.mat || toon(color));
  if (opts.outline) withOutline(m, opts.outline === true ? 1.04 : opts.outline);
  if (opts.pos) m.position.set(...opts.pos);
  return m;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);
    this.scene = new THREE.Scene();
    this.cam = { x: 0, y: 10, z: 14, tx: 0, ty: 0, tz: 0, shake: 0 };
    this.camGoal = { x: 0, y: 10, z: 14, tx: 0, ty: 0, tz: 0 };
    this.camSpeed = 4;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setScene(scene) { this.scene = scene; }

  // Coloca la cámara de golpe
  snapCamera(x, y, z, tx, ty, tz) {
    Object.assign(this.camGoal, { x, y, z, tx, ty, tz });
    Object.assign(this.cam, { x, y, z, tx, ty, tz });
  }
  // La cámara se desliza suavemente hacia aquí
  aimCamera(x, y, z, tx, ty, tz, speed = 4) {
    Object.assign(this.camGoal, { x, y, z, tx, ty, tz });
    this.camSpeed = speed;
  }
  shake(amount = 0.4) { this.cam.shake = Math.max(this.cam.shake, amount); }

  update(dt) {
    const c = this.cam, g = this.camGoal, k = this.camSpeed;
    for (const key of ['x', 'y', 'z', 'tx', 'ty', 'tz']) c[key] = damp(c[key], g[key], k, dt);
    c.shake = Math.max(0, c.shake - dt * 1.5);
    const s = c.shake * c.shake;
    this.camera.position.set(c.x + rand(-s, s), c.y + rand(-s, s), c.z + rand(-s, s));
    this.camera.lookAt(c.tx, c.ty, c.tz);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

// Luces estándar estilo Wii (suaves, sin sombras duras)
export function addLights(scene, { sky = 0xffffff, ground = 0xb8d8e8, sun = 0xffffff, intensity = 1 } = {}) {
  const hemi = new THREE.HemisphereLight(sky, ground, 1.6 * intensity);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(sun, 1.8 * intensity);
  dir.position.set(6, 14, 8);
  scene.add(dir);
  return { hemi, dir };
}

// Nubes de esferas
export function addClouds(scene, n = 10, { radius = 40, yMin = -6, yMax = 12 } = {}) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 12, 10);
  const mat = toon(0xffffff);
  const clouds = [];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rand(3));
    for (let j = 0; j < puffs; j++) {
      const p = new THREE.Mesh(geo, mat);
      const s = rand(1.2, 2.2);
      p.scale.set(s, s * 0.75, s);
      p.position.set((j - puffs / 2) * 1.5, rand(-0.3, 0.4), rand(-0.6, 0.6));
      c.add(p);
    }
    const a = rand(Math.PI * 2), r = rand(radius * 0.6, radius);
    c.position.set(Math.cos(a) * r, rand(yMin, yMax), Math.sin(a) * r);
    c.userData.speed = rand(0.3, 0.8);
    group.add(c);
    clouds.push(c);
  }
  scene.add(group);
  return {
    group,
    update(dt) {
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > radius) c.position.x = -radius;
      }
    },
  };
}

// Sombra redonda bajo los personajes
let shadowTex = null;
export function makeBlobShadow(size = 1.1) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

// ---------- Partículas: confeti, explosiones, salpicaduras ----------
const CONFETTI_COLORS = [0x34beed, 0xff5a5a, 0xffc233, 0x4cd07d, 0xa57bea, 0xff8fc7];
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.pool = [];
    this.geoPlane = new THREE.PlaneGeometry(0.22, 0.14);
    this.geoBall = new THREE.IcosahedronGeometry(0.25, 0);
    this.rings = [];
  }

  _get(kind, color) {
    let p = this.pool.find((q) => q.userData.kind === kind);
    if (p) this.pool.splice(this.pool.indexOf(p), 1);
    else {
      const mat = kind === 'plane'
        ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true })
        : new THREE.MeshToonMaterial({ color, gradientMap: getGradient(), transparent: true });
      p = new THREE.Mesh(kind === 'plane' ? this.geoPlane : this.geoBall, mat);
      p.userData.kind = kind;
    }
    p.material.color.setHex(color);
    p.material.opacity = 1;
    p.visible = true;
    this.scene.add(p);
    return p;
  }

  spawn(kind, x, y, z, { color, vx = 0, vy = 0, vz = 0, life = 2, grav = 9, size = 1, spin = 6, drag = 0.5, fade = true }) {
    if (this.parts.length > 400) return;
    const m = this._get(kind, color);
    m.position.set(x, y, z);
    m.scale.setScalar(size);
    m.rotation.set(rand(6), rand(6), rand(6));
    this.parts.push({ m, x, y, z, vx, vy, vz, life, max: life, grav, spin, drag, fade, size, rx: rand(-spin, spin), ry: rand(-spin, spin) });
  }

  confetti(x, y, z, n = 60, spread = 6) {
    for (let i = 0; i < n; i++) {
      this.spawn('plane', x + rand(-1, 1), y, z + rand(-1, 1), {
        color: pick(CONFETTI_COLORS), vx: rand(-spread, spread), vy: rand(4, 12), vz: rand(-spread, spread),
        life: rand(2.5, 4), grav: 7, drag: 1.6, spin: 10,
      });
    }
  }

  burst(x, y, z, color, n = 16, speed = 6, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), e = rand(-0.2, 1);
      this.spawn('ball', x, y, z, {
        color, vx: Math.cos(a) * speed * rand(0.4, 1), vy: e * speed, vz: Math.sin(a) * speed * rand(0.4, 1),
        life: rand(0.5, 1.1), grav: 12, size: size * rand(0.5, 1.2), drag: 1, spin: 8,
      });
    }
  }

  explosion(x, y, z) {
    this.burst(x, y, z, 0xffc233, 26, 11, 2.2);
    this.burst(x, y, z, 0xff5a5a, 20, 8, 1.8);
    this.burst(x, y, z, 0x555566, 14, 5, 2.4);
    this.ring(x, y, z, 0xffe9a8, 7);
  }

  ring(x, y, z, color = 0xffffff, maxR = 4) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.05, z);
    this.scene.add(m);
    this.rings.push({ m, t: 0, maxR });
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        this.scene.remove(p.m);
        this.pool.push(p.m);
        this.parts.splice(i, 1);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.m.position.set(p.x, p.y, p.z);
      p.m.rotation.x += p.rx * dt;
      p.m.rotation.y += p.ry * dt;
      if (p.fade) p.m.material.opacity = Math.min(1, p.life / (p.max * 0.4));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt * 2.2;
      r.m.scale.setScalar(1 + r.t * r.maxR);
      r.m.material.opacity = Math.max(0, 1 - r.t);
      if (r.t >= 1) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }
  }
}

// Libera memoria al cambiar de escena (los materiales cacheados se conservan)
export function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.keep)) o.geometry.dispose();
    if (o.material && o.material.map && o.userData.ownMap) o.material.map.dispose();
  });
}

// Texto 3D sencillo como sprite (para nombres)
export function textSprite(text, { color = '#3b4552', bg = 'rgba(255,255,255,0.92)', size = 40, border = null } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `700 ${size}px Poppins, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  c.width = w; c.height = size * 1.6;
  ctx.font = `700 ${size}px Poppins, sans-serif`;
  ctx.fillStyle = bg;
  const r = c.height / 2;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, c.height); ctx.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  if (border) { ctx.lineWidth = 6; ctx.strokeStyle = border; ctx.stroke(); }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(w / c.height * 0.45, 0.45, 1);
  sp.renderOrder = 10;
  sp.userData.ownMap = true;
  return sp;
}
