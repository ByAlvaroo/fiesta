// Caras y avatares en 2D (se usan en la tele, en el móvil y como textura 3D)
export const COLORS = [
  { name: 'Azul', hex: 0x34beed },
  { name: 'Rojo', hex: 0xff5a5a },
  { name: 'Amarillo', hex: 0xffc233 },
  { name: 'Verde', hex: 0x4cd07d },
  { name: 'Morado', hex: 0xa57bea },
  { name: 'Rosa', hex: 0xff8fc7 },
  { name: 'Naranja', hex: 0xff8a3d },
  { name: 'Turquesa', hex: 0x2ec4b6 },
];
export const EYES = ['Normales', 'Felices', 'Grandes', 'Dormilones', 'Enfadados', 'Brillantes'];
export const MOUTHS = ['Sonrisa', 'Abierta', 'Lengua', 'Seria', 'Dientes', 'Bigote'];
export const SKIN = '#FFDDBE';
const INK = '#3B3B48';

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

// expr: 'normal' | 'ko' | 'happy' | 'scared'
export function drawFace(ctx, cx, cy, s, eyes, mouth, expr = 'normal') {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  const ex = 0.36 * s, ey = cy - 0.12 * s;

  // mofletes
  ctx.fillStyle = 'rgba(255,120,140,0.35)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + sx * 0.56 * s, cy + 0.22 * s, 0.16 * s, 0.1 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = INK;

  for (const sx of [-1, 1]) {
    const x = cx + sx * ex;
    ctx.lineWidth = 0.09 * s;
    if (expr === 'ko') {
      const r = 0.13 * s;
      ctx.beginPath();
      ctx.moveTo(x - r, ey - r); ctx.lineTo(x + r, ey + r);
      ctx.moveTo(x + r, ey - r); ctx.lineTo(x - r, ey + r);
      ctx.stroke();
      continue;
    }
    if (expr === 'happy') {
      ctx.beginPath();
      ctx.arc(x, ey + 0.05 * s, 0.14 * s, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      continue;
    }
    if (expr === 'scared') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, ey, 0.19 * s, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.05 * s; ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x, ey, 0.06 * s, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    switch (eyes) {
      case 1: // felices
        ctx.beginPath();
        ctx.arc(x, ey + 0.05 * s, 0.14 * s, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 2: // grandes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(x, ey, 0.17 * s, 0.22 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 0.045 * s; ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.ellipse(x + 0.03 * s, ey + 0.03 * s, 0.1 * s, 0.13 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 0.06 * s, ey - 0.03 * s, 0.035 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = INK;
        break;
      case 3: // dormilones
        ctx.beginPath();
        ctx.moveTo(x - 0.15 * s, ey); ctx.lineTo(x + 0.15 * s, ey);
        ctx.stroke();
        ctx.lineWidth = 0.04 * s;
        ctx.beginPath(); ctx.arc(x, ey - 0.02 * s, 0.15 * s, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        break;
      case 4: // enfadados
        ctx.beginPath(); ctx.ellipse(x, ey + 0.04 * s, 0.08 * s, 0.1 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 0.07 * s;
        ctx.beginPath();
        ctx.moveTo(x - sx * 0.18 * s, ey - 0.2 * s); ctx.lineTo(x + sx * 0.12 * s, ey - 0.1 * s);
        ctx.stroke();
        break;
      case 5: // brillantes
        ctx.beginPath(); ctx.ellipse(x, ey, 0.1 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 0.035 * s, ey - 0.05 * s, 0.04 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 0.04 * s, ey + 0.05 * s, 0.02 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = INK;
        ctx.lineWidth = 0.035 * s;
        ctx.beginPath(); ctx.moveTo(x - 0.1 * s, ey - 0.2 * s); ctx.lineTo(x - 0.15 * s, ey - 0.25 * s); ctx.stroke();
        break;
      default: // normales
        ctx.beginPath(); ctx.ellipse(x, ey, 0.08 * s, 0.12 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // boca
  const my = cy + 0.32 * s;
  ctx.lineWidth = 0.07 * s;
  ctx.fillStyle = INK;
  if (expr === 'ko' || expr === 'scared') {
    ctx.beginPath(); ctx.ellipse(cx, my + 0.02 * s, 0.11 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'happy') {
    ctx.beginPath(); ctx.arc(cx, my - 0.06 * s, 0.22 * s, 0.1 * Math.PI, 0.9 * Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff7b8a';
    ctx.beginPath(); ctx.arc(cx, my + 0.1 * s, 0.08 * s, 0, Math.PI); ctx.fill();
  } else switch (mouth) {
    case 1: // abierta
      ctx.beginPath(); ctx.arc(cx, my - 0.05 * s, 0.2 * s, 0.05 * Math.PI, 0.95 * Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff7b8a';
      ctx.beginPath(); ctx.arc(cx, my + 0.09 * s, 0.07 * s, 0, Math.PI); ctx.fill();
      break;
    case 2: // lengua
      ctx.beginPath(); ctx.arc(cx, my - 0.08 * s, 0.18 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#ff7b8a';
      ctx.beginPath(); ctx.ellipse(cx + 0.05 * s, my + 0.11 * s, 0.07 * s, 0.09 * s, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 3: // seria
      ctx.beginPath(); ctx.moveTo(cx - 0.13 * s, my); ctx.lineTo(cx + 0.13 * s, my); ctx.stroke();
      break;
    case 4: // dientes
      ctx.beginPath(); ctx.arc(cx, my - 0.07 * s, 0.2 * s, 0.08 * Math.PI, 0.92 * Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 0.12 * s, my - 0.03 * s, 0.24 * s, 0.06 * s);
      break;
    case 5: // bigote
      ctx.beginPath(); ctx.arc(cx, my, 0.12 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#6b4a35';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + sx * 0.14 * s, my - 0.1 * s, 0.16 * s, 0.07 * s, sx * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    default: // sonrisa
      ctx.beginPath(); ctx.arc(cx, my - 0.1 * s, 0.2 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  ctx.restore();
}

// Avatar 2D completo (círculo cuerpo + cabeza) para listas y el móvil
export function drawAvatar2D(canvas, color, eyes, mouth, expr = 'normal') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const s = Math.min(w, h);
  // cuerpo
  ctx.fillStyle = css(color);
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.92, s * 0.36, s * 0.3, 0, Math.PI, 0);
  ctx.fill();
  // cabeza
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.44, s * 0.34, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  drawFace(ctx, w / 2, h * 0.46, s * 0.34, eyes, mouth, expr);
}

export function avatarCanvas(player, size = 64, expr = 'normal') {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  c.style.width = c.style.height = size + 'px';
  drawAvatar2D(c, player.color, player.eyes, player.mouth, expr);
  return c;
}
