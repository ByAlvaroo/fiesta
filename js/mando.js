// Mando del móvil — HECHO POR @BYALVARO__
import { COLORS, EYES, MOUTHS, drawAvatar2D } from './face.js';
import { PEER_PREFIX } from './net.js';
import { store, clamp, hexStr } from './util.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

const prof = Object.assign({ name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)].hex, eyes: 0, mouth: 0 }, store('perfil') || {});
let token = store('token');
if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); store('token', token); }

let peer = null, conn = null, code = '', joined = false, lastSig = null, retryT = null;
let ui = { stick: true, a: 'Saltar', b: null, msg: '' };

// ---------------------------------------------------------------- pantallas
function screen(id) { for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id); }
function message(ico, text, { retry = false, back = true } = {}) {
  $('#m-ico').textContent = ico;
  $('#m-text').textContent = text;
  $('#m-retry').hidden = !retry;
  $('#m-back').hidden = !back;
  screen('s-msg');
}
function theme(color) { document.body.style.setProperty('--c', hexStr(color)); }

// ---------------------------------------------------------------- perfil
function buildProfile() {
  $('#f-code').value = (params.get('sala') || store('sala') || '').toUpperCase();
  $('#f-name').value = prof.name;
  $('#f-colors').innerHTML = COLORS.map((c) => `<button class="sw" data-c="${c.hex}" style="--sw:${hexStr(c.hex)}"></button>`).join('');
  for (const b of document.querySelectorAll('.sw')) b.onclick = () => { prof.color = +b.dataset.c; drawProfile(); };
  for (const b of document.querySelectorAll('.stepper button')) b.onclick = () => {
    const k = b.dataset.k, n = k === 'eyes' ? EYES.length : MOUTHS.length;
    prof[k] = (prof[k] + +b.dataset.d + n) % n;
    drawProfile();
  };
  $('#f-go').onclick = enter;
  $('#f-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  drawProfile();
}

function drawProfile() {
  drawAvatar2D($('#preview'), prof.color, prof.eyes, prof.mouth);
  $('#f-eyes').textContent = EYES[prof.eyes];
  $('#f-mouth').textContent = MOUTHS[prof.mouth];
  for (const b of document.querySelectorAll('.sw')) b.classList.toggle('on', +b.dataset.c === prof.color);
  theme(prof.color);
}

function enter() {
  code = $('#f-code').value.trim().toUpperCase();
  prof.name = $('#f-name').value.trim().slice(0, 12);
  if (code.length !== 4) { $('#f-code').focus(); $('#f-code').style.borderColor = '#ff5a5a'; return; }
  if (!prof.name) { $('#f-name').focus(); $('#f-name').style.borderColor = '#ff5a5a'; return; }
  store('perfil', prof);
  store('sala', code);
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* nada */ }
  try { if (document.documentElement.requestFullscreen && /Android/i.test(navigator.userAgent)) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* nada */ }
  if (joined && conn && conn.open) { send({ t: 'prof', ...prof }); showPad(); return; }
  connect();
}

// ---------------------------------------------------------------- conexión
function connect() {
  if (typeof window.Peer !== 'function') { message('📵', 'No se ha podido cargar la conexión. Revisa que tienes internet y recarga la página.', { retry: true }); return; }
  clearTimeout(retryT);
  message('⏳', `Conectando a la sala ${code}…`, { back: true });
  if (peer && !peer.destroyed) peer.destroy();
  peer = new window.Peer({ debug: 0 });
  peer.on('open', () => {
    conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    conn.on('open', () => send({ t: 'hello', token, ...prof }));
    conn.on('data', onData);
    conn.on('close', onLost);
    conn.on('error', onLost);
  });
  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') message('🤔', `No existe ninguna sala con el código ${code}. Mira el código en la tele.`, { retry: true });
    else if (joined) onLost();
    else message('⚠️', 'No se ha podido conectar. Comprueba tu conexión.', { retry: true });
  });
}

function onLost() {
  if (!joined) return;
  joined = false;
  message('📶', 'Se ha perdido la conexión. Reconectando…', { retry: true });
  retryT = setTimeout(connect, 2000);
}

function send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) { /* nada */ } } }

function onData(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'welcome':
      joined = true;
      prof.color = msg.color;
      if (msg.name) prof.name = msg.name;
      store('perfil', prof);
      theme(prof.color);
      showPad();
      break;
    case 'ui':
      ui = msg;
      if (msg.color !== undefined) { prof.color = msg.color; theme(msg.color); }
      applyUI();
      break;
    case 'vib':
      vibrate(msg.ms || 100);
      break;
    case 'sig':
      lastSig = msg.on ? performance.now() : null;
      if (msg.on) vibrate(40);
      break;
    case 'wait':
      message('⏸️', msg.msg || 'Espera un momento…', { retry: true });
      joined = false;
      break;
    case 'kick':
      joined = false;
      message('👋', msg.msg || 'Has salido de la sala', { retry: true });
      if (conn) conn.close();
      break;
  }
}

function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* iPhone no vibra */ } }

// ---------------------------------------------------------------- mando
function showPad() {
  screen('s-pad');
  drawAvatar2D($('#pad-face'), prof.color, prof.eyes, prof.mouth);
  $('#pad-name').textContent = prof.name;
  applyUI();
}

function applyUI() {
  $('#pad-msg').textContent = ui.msg || '';
  const pad = $('#pad');
  pad.classList.toggle('nostick', !ui.stick);
  pad.classList.toggle('nobuttons', !ui.stick && !ui.a && !ui.b);
  const A = $('#btn-a'), B = $('#btn-b');
  A.hidden = !ui.a; B.hidden = !ui.b;
  A.querySelector('small').textContent = ui.a || '';
  B.querySelector('small').textContent = ui.b || '';
  if (!ui.stick) setStick(0, 0, true);
  if (!ui.a) release('a');
  if (!ui.b) release('b');
}

// joystick
const zone = $('#stick-zone'), base = $('#stick-base'), knob = $('#stick-knob');
let stickId = null, sx = 0, sy = 0, cur = { x: 0, y: 0 }, lastSent = { x: 0, y: 0 }, lastSendT = 0;
const RAD = 62;
zone.addEventListener('pointerdown', (e) => {
  if (stickId !== null) return;
  stickId = e.pointerId;
  zone.setPointerCapture(e.pointerId);
  const r = zone.getBoundingClientRect();
  sx = e.clientX; sy = e.clientY;
  base.style.left = (sx - r.left) + 'px';
  base.style.top = (sy - r.top) + 'px';
  base.classList.add('on');
  $('#stick-hint').style.opacity = 0;
  moveStick(e);
});
zone.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
const endStick = (e) => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  base.classList.remove('on');
  setStick(0, 0, true);
};
zone.addEventListener('pointerup', endStick);
zone.addEventListener('pointercancel', endStick);

function moveStick(e) {
  let dx = e.clientX - sx, dy = e.clientY - sy;
  const d = Math.hypot(dx, dy);
  if (d > RAD) {
    // la base sigue al dedo si se pasa mucho
    const over = d - RAD;
    sx += (dx / d) * over; sy += (dy / d) * over;
    const r = zone.getBoundingClientRect();
    base.style.left = (sx - r.left) + 'px';
    base.style.top = (sy - r.top) + 'px';
    dx = e.clientX - sx; dy = e.clientY - sy;
  }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  setStick(clamp(dx / RAD, -1, 1), clamp(-dy / RAD, -1, 1));
}

function setStick(x, y, force = false) {
  if (Math.hypot(x, y) < 0.15) { x = 0; y = 0; }
  cur = { x, y };
  if (force) knob.style.transform = 'translate(0,0)';
  const now = performance.now();
  if (force || Math.abs(x - lastSent.x) + Math.abs(y - lastSent.y) > 0.06 || (now - lastSendT > 120 && (x !== lastSent.x || y !== lastSent.y))) {
    send({ t: 'in', x: +x.toFixed(2), y: +y.toFixed(2) });
    lastSent = { x, y };
    lastSendT = now;
  }
}
setInterval(() => { if (joined && (cur.x !== lastSent.x || cur.y !== lastSent.y)) setStick(cur.x, cur.y, false); }, 60);

// botones
const held = { a: null, b: null };
for (const k of ['a', 'b']) {
  const el = $('#btn-' + k);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (held[k] !== null) return;
    held[k] = e.pointerId;
    el.setPointerCapture(e.pointerId);
    el.classList.add('down');
    vibrate(15);
    const rt = k === 'a' && lastSig !== null ? Math.round(performance.now() - lastSig) : -1;
    send({ t: 'btn', k, d: 1, rt });
  });
  const up = (e) => { if (e.pointerId === held[k]) release(k); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function release(k) {
  if (held[k] === null) return;
  held[k] = null;
  $('#btn-' + k).classList.remove('down');
  send({ t: 'btn', k, d: 0 });
}

// teclado (para probar el mando desde un PC)
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') send({ t: 'btn', k: 'a', d: 1, rt: lastSig !== null ? Math.round(performance.now() - lastSig) : -1 });
  if (e.code === 'ShiftLeft') send({ t: 'btn', k: 'b', d: 1 });
  kbStick();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') send({ t: 'btn', k: 'a', d: 0 });
  if (e.code === 'ShiftLeft') send({ t: 'btn', k: 'b', d: 0 });
  kbStick();
});
function kbStick() {
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  if (stickId === null) setStick(x, y, true);
}

$('#pad-edit').onclick = () => { buildProfile(); screen('s-profile'); };
$('#m-retry').onclick = () => connect();
$('#m-back').onclick = () => { clearTimeout(retryT); screen('s-profile'); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !joined && code && conn) connect(); });

buildProfile();
if (params.get('sala') && prof.name) {
  // ya tiene perfil guardado: entrar directo
  $('#f-code').value = params.get('sala').toUpperCase();
}
