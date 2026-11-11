// Física sencilla de personajes (sin motor de físicas): correr, saltar, dash, empujones
import { clamp, rand } from './util.js';

export class Body {
  constructor(player, x = 0, z = 0, y = 0) {
    this.p = player;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = Math.atan2(-x, -z) || 0;
    this.grounded = true;
    this.groundY = y;
    this.alive = true;
    this.ko = false;
    this.radius = 0.45;
    this.baseSpeed = 6.5;
    this.speedMul = 1;
    this.accel = 40;
    this.airAccel = 16;
    this.jumpV = 9.2;
    this.gravity = 26;
    this.stun = 0;
    this.dashT = 0;
    this.dashCD = 0;
    this.crouch = false;
    this.vyBefore = 0;
    this.immune = 0;
    this.noGround = false;
  }

  // Aplica los controles. Devuelve los eventos ocurridos (para sonidos)
  control(inp, dt, opt = {}) {
    const ev = {};
    if (!this.alive || this.ko || this.stun > 0) { this.crouch = false; return ev; }
    let ix = inp.x || 0, iz = -(inp.y || 0);
    const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    this.crouch = !!(opt.canCrouch && inp.b && this.grounded);
    const max = this.baseSpeed * this.speedMul * (this.crouch ? 0.45 : 1);
    if (this.dashT <= 0) {
      const a = (this.grounded ? this.accel : this.airAccel) * dt;
      this.vx += clamp(ix * max - this.vx, -a, a);
      this.vz += clamp(iz * max - this.vz, -a, a);
    }
    if (m > 0.15) this.facing = Math.atan2(ix, iz);
    if (opt.canJump !== false && inp.aHit && this.grounded && !this.crouch) {
      this.vy = this.jumpV * (opt.jumpMul || 1);
      this.grounded = false;
      ev.jump = true;
    }
    if (opt.canDash && inp.bHit && this.dashCD <= 0) {
      const dx = m > 0.15 ? ix : Math.sin(this.facing);
      const dz = m > 0.15 ? iz : Math.cos(this.facing);
      const d = Math.hypot(dx, dz) || 1;
      const sp = this.baseSpeed * this.speedMul * 2.5;
      this.vx = (dx / d) * sp; this.vz = (dz / d) * sp;
      this.facing = Math.atan2(dx, dz);
      this.dashT = 0.22;
      this.dashCD = opt.dashCD || 1.5;
      ev.dash = true;
    }
    return ev;
  }

  // groundAt(x, z, y) → altura del suelo más alto por debajo de y en (x, z), o null si no hay suelo
  integrate(dt, groundAt) {
    if (this.stun > 0) this.stun -= dt;
    this.dashT -= dt;
    this.dashCD -= dt;
    this.immune -= dt;
    if (this.grounded && (this.stun > 0 || this.ko)) {
      const f = Math.exp(-5 * dt);
      this.vx *= f; this.vz *= f;
    }
    this.vyBefore = this.vy;
    this.vy -= this.gravity * dt;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt, ny = this.y + this.vy * dt;
    const gh = this.noGround ? null : groundAt(nx, nz, this.y);
    let landed = false;
    if (gh !== null && gh !== undefined && ny <= gh && this.y >= gh - 0.6) {
      if (!this.grounded) landed = true;
      this.y = gh; this.vy = 0; this.grounded = true;
    } else {
      this.y = ny; this.grounded = false;
    }
    this.x = nx; this.z = nz;
    this.groundY = gh === undefined ? null : gh;
    return landed;
  }

  knock(vx, vy, vz, stun = 0.8) {
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.grounded = false;
    this.stun = Math.max(this.stun, stun);
    this.dashT = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  state() {
    return {
      x: this.x, y: this.y, z: this.z, facing: this.facing,
      speed: clamp(this.speed / this.baseSpeed, 0, 1.2) * (this.grounded ? 1 : 0.3),
      grounded: this.grounded, vy: this.vy, vyBefore: this.vyBefore,
      crouch: this.crouch, ko: this.ko, shadowY: this.groundY,
    };
  }
}

// Empujones entre personajes. Devuelve los pares que chocaron fuerte (para efectos)
export function collideBodies(bodies, onHit) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.alive || a.ko) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.alive || b.ko) continue;
      if (Math.abs(a.y - b.y) > 1.3) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const r = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = d2 === 0 ? rand(-1, 1) : dx / d, nz = d2 === 0 ? rand(-1, 1) : dz / d;
      const pen = (r - d) / 2;
      a.x -= nx * pen; a.z -= nz * pen;
      b.x += nx * pen; b.z += nz * pen;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel > 0) {
        const imp = rel * 0.9;
        a.vx -= nx * imp; a.vz -= nz * imp;
        b.vx += nx * imp; b.vz += nz * imp;
        if (onHit && rel > 6) onHit(a, b, rel, nx, nz);
      }
    }
  }
}

// Mantiene un cuerpo dentro de un rectángulo (vallas)
export function keepInBox(b, minX, maxX, minZ, maxZ) {
  const r = b.radius;
  if (b.x < minX + r) { b.x = minX + r; if (b.vx < 0) b.vx *= -0.4; }
  if (b.x > maxX - r) { b.x = maxX - r; if (b.vx > 0) b.vx *= -0.4; }
  if (b.z < minZ + r) { b.z = minZ + r; if (b.vz < 0) b.vz *= -0.4; }
  if (b.z > maxZ - r) { b.z = maxZ - r; if (b.vz > 0) b.vz *= -0.4; }
}

// Obstáculos: cajas (AABB) y barriles (círculos)
export function collideObstacles(b, obstacles) {
  for (const o of obstacles) {
    if (o.r) {
      const dx = b.x - o.x, dz = b.z - o.z;
      const rr = o.r + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        b.x = o.x + (dx / d) * rr; b.z = o.z + (dz / d) * rr;
        const vn = b.vx * (dx / d) + b.vz * (dz / d);
        if (vn < 0) { b.vx -= vn * (dx / d); b.vz -= vn * (dz / d); }
      }
    } else {
      const cx = clamp(b.x, o.x - o.hw, o.x + o.hw), cz = clamp(b.z, o.z - o.hd, o.z + o.hd);
      const dx = b.x - cx, dz = b.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < b.radius * b.radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          b.x = cx + (dx / d) * b.radius; b.z = cz + (dz / d) * b.radius;
          const vn = b.vx * (dx / d) + b.vz * (dz / d);
          if (vn < 0) { b.vx -= vn * (dx / d); b.vz -= vn * (dz / d); }
        } else {
          // dentro de la caja: sacarlo por el lado más cercano
          const px = o.hw - Math.abs(b.x - o.x), pz = o.hd - Math.abs(b.z - o.z);
          if (px < pz) b.x = o.x + Math.sign(b.x - o.x || 1) * (o.hw + b.radius);
          else b.z = o.z + Math.sign(b.z - o.z || 1) * (o.hd + b.radius);
        }
      }
    }
  }
}

// Steering básico para bots: dirección hacia un punto → input de joystick
export function steerTo(b, tx, tz, slowRadius = 0.6) {
  const dx = tx - b.x, dz = tz - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return { x: 0, y: 0 };
  const k = Math.min(1, d / slowRadius);
  return { x: (dx / d) * k, y: -(dz / d) * k };
}
