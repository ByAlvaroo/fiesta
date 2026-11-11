// FIESTA EN EL SALÓN — programa principal del PC (la "tele")
// HECHO POR @BYALVARO__
import * as THREE from 'three';
import { World, FX, disposeScene } from './world.js';
import { Avatar } from './avatar.js';
import { sfx } from './audio.js';
import { COLORS, EYES, MOUTHS, avatarCanvas } from './face.js';
import { Player, makeBot, freeColor, BOT_LEVELS, MAX_PLAYERS, placementsToResults, LocalInput, KEY_HELP } from './players.js';
import { HostNet, controllerURL } from './net.js';
import { Plaza } from './plaza.js';
import { Podium } from './podium.js';
import { GAMES, gameById } from './games/index.js';
import { esc, shuffle, store, clamp, rand, pick, hexStr } from './util.js';

const params = new URLSearchParams(location.search);
const SPEED = Math.max(1, Math.min(20, parseInt(params.get('speed') || '1', 10)));
const AUTOPLAY = params.has('autoplay');

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const DEFAULT_SKY = 'linear-gradient(#5fc8f4 0%, #a9e1f8 55%, #e9f8fe 100%)';

const app = {
  state: 'menu',
  mode: 'fiesta',
  players: [],
  settings: Object.assign({ rounds: 5, botLevel: 'normal' }, store('ajustes') || {}),
  queue: [],
  gameIndex: 0,
  cur: null,
  view: 'plaza',
  paused: false,
  timers: [],
  ready: new Set(),
  played: [],
};
window.__app = app;

// ---------------------------------------------------------------- motor
const world = new World($('#c'));
const plaza = new Plaza(world, sfx);
world.setScene(plaza.scene);
const input = new LocalInput(() => app.players);

let timerGen = 0;
function after(sec, fn) { app.timers.push({ t: sec, fn, gen: timerGen }); }
function clearTimers() { app.timers = []; timerGen++; }

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (let i = 0; i < SPEED; i++) tick(dt);
  world.render();
}

function tick(dt) {
  input.poll();
  // "¡Listo!" en intro y resultados
  if (app.state === 'intro' || app.state === 'results') {
    for (const p of app.players) if (p.input.aHit && !app.ready.has(p.id)) markReady(p);
  }
  if (!app.paused) {
    if (app.view === 'plaza') plaza.update(dt);
    else if (app.view === 'game' && app.cur) {
      app.cur.inst.update(dt, app.cur.active);
      app.cur.fx.update(dt);
    } else if (app.view === 'podium' && app.podium) app.podium.update(dt);
    world.update(dt);
    const due = [];
    for (let i = app.timers.length - 1; i >= 0; i--) {
      const tm = app.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { app.timers.splice(i, 1); due.push(tm); }
    }
    for (const tm of due.reverse()) if (tm.gen === timerGen) tm.fn();
  }
  for (const p of app.players) p.clearHits();
}

// ---------------------------------------------------------------- UI básica
function show(id) {
  for (const s of $$('.screen')) s.classList.toggle('on', s.id === id);
  $('#hud').classList.toggle('on', id === 'hud');
}

function announce(text, { color = '#34beed', dur = 1, size = 'big' } = {}) {
  const el = document.createElement('div');
  el.className = 'ann ' + size;
  el.style.setProperty('--c', color);
  el.textContent = text;
  const box = $('#announce');
  box.innerHTML = '';
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), Math.max(200, (dur * 1000) / SPEED - 250));
  setTimeout(() => el.remove(), (dur * 1000) / SPEED);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('#toasts').appendChild(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => el.classList.add('out'), 2600 / SPEED);
  setTimeout(() => el.remove(), 3000 / SPEED);
}

const faceCache = new Map();
function faceURL(p, size = 40) {
  const key = [p.color, p.eyes, p.mouth, size].join('|');
  if (!faceCache.has(key)) faceCache.set(key, avatarCanvas(p, size).toDataURL());
  return faceCache.get(key);
}
function chip(p) {
  return `<span class="chip" style="--c:${hexStr(p.color)}"><img src="${faceURL(p, 28)}" alt="">${esc(p.name)}</span>`;
}

function setSky(css, fog) {
  $('#sky').style.background = css || DEFAULT_SKY;
  if (app.cur && fog !== undefined) app.cur.scene.fog = new THREE.Fog(fog, 50, 150);
}

document.addEventListener('pointerdown', () => sfx.unlock(), { once: false });
document.addEventListener('keydown', () => sfx.unlock());
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { sfx.play('click'); b.blur(); }
});

// ---------------------------------------------------------------- red (móviles)
const net = new HostNet({
  onData: onPhoneData,
  onClose: onPhoneClose,
  onStatus: () => renderNetStatus(),
});

function phoneSend(p, msg) { if (p.kind === 'phone' && p.conn) net.send(p.conn, msg); }
function phoneUI(p, ui) {
  p.ui = ui;
  phoneSend(p, { t: 'ui', ...ui, color: p.color, name: p.name });
}
function phoneAll(ui) { for (const p of app.players) phoneUI(p, ui); }
function lobbyUI() { phoneAll({ stick: true, a: 'Saltar', b: null, msg: '¡Estás dentro! Muévete por la isla mientras esperáis' }); }

function onPhoneData(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  let p = app.players.find((q) => q.conn === conn);
  if (msg.t === 'hello') {
    const old = msg.token && app.players.find((q) => q.kind === 'phone' && q.token === msg.token);
    if (old) {
      old.conn = conn; old.online = true; old.resetInput();
      net.send(conn, { t: 'welcome', id: old.id, color: old.color, name: old.name });
      phoneUI(old, old.ui || { stick: true, a: 'Saltar', b: null, msg: '¡Reconectado!' });
      toast(`📱 ${old.name} ha vuelto`);
      renderLobby();
      return;
    }
    if (!['menu', 'lobby', 'pick'].includes(app.state)) {
      net.send(conn, { t: 'wait', msg: 'La partida ya ha empezado. Podrás entrar en la siguiente 😉' });
      return;
    }
    if (app.players.length >= MAX_PLAYERS) { net.send(conn, { t: 'wait', msg: 'La sala está llena (8 jugadores).' }); return; }
    p = new Player({
      name: String(msg.name || 'Jugador').trim().slice(0, 12) || 'Jugador',
      color: freeColor(app.players, msg.color),
      eyes: clamp(msg.eyes | 0, 0, EYES.length - 1),
      mouth: clamp(msg.mouth | 0, 0, MOUTHS.length - 1),
      kind: 'phone', conn, token: msg.token,
    });
    app.players.push(p);
    net.send(conn, { t: 'welcome', id: p.id, color: p.color, name: p.name });
    phoneUI(p, { stick: true, a: 'Saltar', b: null, msg: '¡Estás dentro! Muévete por la isla mientras esperáis' });
    sfx.play('join');
    toast(`📱 ¡${p.name} se ha unido!`);
    playersChanged();
    return;
  }
  if (!p) return;
  if (msg.t === 'in') {
    p.input.x = clamp(+msg.x || 0, -1, 1);
    p.input.y = clamp(+msg.y || 0, -1, 1);
  } else if (msg.t === 'btn') {
    p.press(msg.k === 'b' ? 'b' : 'a', !!msg.d, typeof msg.rt === 'number' ? msg.rt : null);
  } else if (msg.t === 'prof' && ['menu', 'lobby', 'pick'].includes(app.state)) {
    p.name = String(msg.name || p.name).trim().slice(0, 12) || p.name;
    p.eyes = clamp(msg.eyes | 0, 0, EYES.length - 1);
    p.mouth = clamp(msg.mouth | 0, 0, MOUTHS.length - 1);
    if (msg.color !== undefined && msg.color !== p.color) p.color = freeColor(app.players.filter((q) => q !== p), msg.color);
    net.send(conn, { t: 'welcome', id: p.id, color: p.color, name: p.name });
    playersChanged();
  }
}

function onPhoneClose(conn) {
  const p = app.players.find((q) => q.conn === conn);
  if (!p) return;
  p.conn = null;
  p.online = false;
  p.resetInput();
  if (['menu', 'lobby', 'pick'].includes(app.state)) {
    // en la sala se espera un poco por si se reconecta
    setTimeout(() => {
      if (!p.online && ['menu', 'lobby', 'pick'].includes(app.state)) {
        app.players = app.players.filter((q) => q !== p);
        toast(`📱 ${p.name} se ha ido`);
        sfx.play('leave');
        playersChanged();
      }
    }, 4000);
  } else toast(`📱 ${p.name} se ha desconectado (puede volver a entrar)`);
  renderLobby();
}

function renderNetStatus() {
  const box = $('#join-box');
  if (!box) return;
  const st = net.status;
  const fileWarn = location.protocol === 'file:'
    ? '<p class="warn">Estás abriendo el juego como archivo. Para usar los móviles, súbelo a GitHub Pages (o cualquier web con https) y abre esa dirección.</p>' : '';
  if (st === 'ready') {
    const url = controllerURL(net.code);
    box.innerHTML = `
      <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=6&data=${encodeURIComponent(url)}" alt="QR"></div>
      <div class="code-label">Código de sala</div>
      <div class="code">${net.code}</div>
      <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>${fileWarn}`;
  } else if (st === 'connecting') {
    box.innerHTML = `<div class="spinner"></div><p>Creando la sala…</p>${fileWarn}`;
  } else if (st === 'nopeer') {
    box.innerHTML = `<div class="big-ico">📵</div><p>No se ha podido cargar la conexión para móviles (¿sin internet?).</p><p class="soft">Podéis jugar con teclado, mandos de consola y bots.</p>`;
  } else if (st === 'error') {
    box.innerHTML = `<div class="big-ico">⚠️</div><p>Error de conexión con el servidor de salas.</p><button class="btn small" id="net-retry">Reintentar</button>`;
    $('#net-retry').onclick = () => net.start();
  } else box.innerHTML = '';
}

// ---------------------------------------------------------------- jugadores locales
input.onPadJoin = (index) => {
  if (!['lobby', 'pick', 'menu'].includes(app.state) || app.players.length >= MAX_PLAYERS) return;
  if (app.players.some((p) => p.kind === 'gamepad' && p.slot === index)) return;
  const p = new Player({ name: 'Mando ' + (index + 1), kind: 'gamepad', slot: index, color: freeColor(app.players), eyes: index % 6, mouth: (index + 2) % 6 });
  app.players.push(p);
  sfx.play('join');
  toast(`🎮 ¡Mando ${index + 1} conectado!`);
  playersChanged();
};

function addKeyboard() {
  if (app.players.length >= MAX_PLAYERS) return toast('La sala está llena');
  const used = app.players.filter((p) => p.kind === 'keyboard').map((p) => p.slot);
  const slot = [0, 1].find((s) => !used.includes(s));
  if (slot === undefined) return toast('Ya hay dos jugadores de teclado');
  const saved = store('teclado' + slot) || {};
  const p = new Player({ name: saved.name || 'Teclado ' + (slot + 1), kind: 'keyboard', slot, color: freeColor(app.players, saved.color), eyes: saved.eyes ?? slot * 2, mouth: saved.mouth ?? slot });
  app.players.push(p);
  sfx.play('join');
  playersChanged();
}

function addBot(level = app.settings.botLevel) {
  if (app.players.length >= MAX_PLAYERS) return toast('La sala está llena');
  app.players.push(makeBot(app.players, level));
  sfx.play('join');
  playersChanged();
}

function removePlayer(id) {
  const p = app.players.find((q) => q.id === id);
  if (!p) return;
  if (p.kind === 'phone') phoneSend(p, { t: 'kick', msg: 'Te han quitado de la sala' });
  app.players = app.players.filter((q) => q.id !== id);
  sfx.play('leave');
  playersChanged();
}

function playersChanged() {
  plaza.syncPlayers(app.players);
  renderLobby();
}

// ---------------------------------------------------------------- MENÚ
function goMenu() {
  disposeGame();
  disposePodium();
  clearTimers();
  app.state = 'menu';
  app.paused = false;
  $('#pause').classList.remove('on');
  app.view = 'plaza';
  world.setScene(plaza.scene);
  setSky(DEFAULT_SKY);
  plaza.setMode('menu');
  plaza.syncPlayers(app.players);
  show('scr-menu');
  sfx.music('menu');
  lobbyUI();
}

function buildMenu() {
  $('#scr-menu').innerHTML = `
    <div class="menu-wrap">
      <div class="logo">
        <div class="logo-kick">PARTY GAME 3D</div>
        <h1><span>Fiesta</span> <span>en el</span> <span>Salón</span></h1>
        <div class="logo-sub">Minijuegos para jugar con amigos y familia, con el móvil como mando</div>
      </div>
      <div class="menu-buttons">
        <button class="btn primary huge" id="m-fiesta">🎉 Modo fiesta</button>
        <button class="btn huge" id="m-libre">🎯 Juego libre</button>
        <div class="row">
          <button class="btn" id="m-opc">⚙️ Opciones</button>
          <button class="btn" id="m-help">❓ Cómo se juega</button>
        </div>
      </div>
    </div>
    <div class="signature">HECHO POR @BYALVARO__</div>
    <div class="version">v1.0 · ${GAMES.length} minijuegos</div>`;
  $('#m-fiesta').onclick = () => goLobby('fiesta');
  $('#m-libre').onclick = () => goLobby('libre');
  $('#m-opc').onclick = openOptions;
  $('#m-help').onclick = openHelp;
}

// ---------------------------------------------------------------- SALA
function goLobby(mode) {
  app.mode = mode || app.mode;
  app.state = 'lobby';
  app.view = 'plaza';
  world.setScene(plaza.scene);
  setSky(DEFAULT_SKY);
  plaza.setMode('lobby');
  if (net.status === 'off') net.start();
  show('scr-lobby');
  sfx.music('menu');
  renderLobby();
  renderNetStatus();
  lobbyUI();
}

function buildLobby() {
  $('#scr-lobby').innerHTML = `
    <div class="lobby">
      <div class="panel join">
        <h2>📱 Únete con el móvil</h2>
        <div id="join-box"></div>
        <p class="soft small">Escanea el QR con la cámara o entra en la dirección y pon el código.</p>
      </div>
      <div class="lobby-center">
        <div class="lobby-title"><h2 id="lobby-title"></h2><span id="lobby-count"></span></div>
        <div class="slots" id="slots"></div>
      </div>
      <div class="panel side">
        <h3>🤖 Bots</h3>
        <div class="seg" id="bot-level">
          ${Object.entries(BOT_LEVELS).map(([k, v]) => `<button data-lv="${k}">${v.label}</button>`).join('')}
        </div>
        <div class="row">
          <button class="btn small" id="add-bot">+ Añadir bot</button>
          <button class="btn small ghost" id="fill-bots">Rellenar hasta 4</button>
        </div>
        <h3>⌨️ En este PC</h3>
        <button class="btn small" id="add-kb">+ Jugador de teclado</button>
        <p class="soft tiny">${KEY_HELP.map(esc).join('<br>')}</p>
        <p class="soft tiny">🎮 Mandos de consola: conéctalo y pulsa <b>A</b> para unirte.</p>
        <div id="party-opts">
          <h3>🎲 Minijuegos por fiesta</h3>
          <div class="seg" id="rounds">${[3, 5, 8, 10].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="bottom-bar">
      <button class="btn" id="lobby-back">◀ Menú</button>
      <button class="btn primary big" id="lobby-go"></button>
    </div>`;
  $('#lobby-back').onclick = goMenu;
  $('#add-bot').onclick = () => addBot();
  $('#fill-bots').onclick = () => { while (app.players.length < 4) addBot(); };
  $('#add-kb').onclick = addKeyboard;
  $('#lobby-go').onclick = startFromLobby;
  for (const b of $$('#bot-level button')) b.onclick = () => { app.settings.botLevel = b.dataset.lv; saveSettings(); renderLobby(); };
  for (const b of $$('#rounds button')) b.onclick = () => { app.settings.rounds = +b.dataset.n; saveSettings(); renderLobby(); };
}

function saveSettings() { store('ajustes', app.settings); }

function renderLobby() {
  if (!$('#slots')) return;
  $('#lobby-title').textContent = app.mode === 'fiesta' ? '🎉 Modo fiesta' : '🎯 Juego libre';
  $('#lobby-count').textContent = `${app.players.length} / ${MAX_PLAYERS}`;
  let html = '';
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = app.players[i];
    if (!p) { html += `<div class="slot empty"><span>Libre</span></div>`; continue; }
    const editable = p.kind !== 'phone';
    html += `<div class="slot" style="--c:${hexStr(p.color)}">
      <img class="face" src="${faceURL(p, 64)}" alt="">
      <div class="nm">${esc(p.name)}</div>
      <div class="kind">${p.kindIcon} ${esc(p.kindLabel)}${p.online ? '' : ' · <b>desconectado</b>'}</div>
      <div class="slot-btns">
        ${editable ? `<button class="mini" data-edit="${p.id}" title="Editar">✏️</button>` : ''}
        <button class="mini" data-del="${p.id}" title="Quitar">✕</button>
      </div></div>`;
  }
  $('#slots').innerHTML = html;
  for (const b of $$('[data-del]')) b.onclick = () => removePlayer(b.dataset.del);
  for (const b of $$('[data-edit]')) b.onclick = () => openEditor(app.players.find((p) => p.id === b.dataset.edit));
  for (const b of $$('#bot-level button')) b.classList.toggle('on', b.dataset.lv === app.settings.botLevel);
  for (const b of $$('#rounds button')) b.classList.toggle('on', +b.dataset.n === app.settings.rounds);
  $('#party-opts').style.display = app.mode === 'fiesta' ? '' : 'none';
  const go = $('#lobby-go');
  go.textContent = app.mode === 'fiesta' ? '¡A jugar! ▶' : 'Elegir minijuego ▶';
  go.disabled = app.players.length < 2;
  go.title = app.players.length < 2 ? 'Hacen falta al menos 2 jugadores (puedes añadir bots)' : '';
}

function openEditor(p) {
  if (!p) return;
  const draft = { name: p.name, color: p.color, eyes: p.eyes, mouth: p.mouth };
  const others = app.players.filter((q) => q !== p).map((q) => q.color);
  openModal(`
    <h2>Editar personaje</h2>
    <div class="editor">
      <canvas id="ed-prev" width="220" height="220"></canvas>
      <div class="ed-ctrls">
        <label>Nombre <input id="ed-name" maxlength="12" value="${esc(draft.name)}"></label>
        <div class="swatches" id="ed-colors">${COLORS.map((c) => `<button class="sw" data-c="${c.hex}" style="--c:${hexStr(c.hex)}" ${others.includes(c.hex) ? 'disabled' : ''}></button>`).join('')}</div>
        <div class="stepper"><button data-k="eyes" data-d="-1">◀</button><span>Ojos: <b id="ed-eyes"></b></span><button data-k="eyes" data-d="1">▶</button></div>
        <div class="stepper"><button data-k="mouth" data-d="-1">◀</button><span>Boca: <b id="ed-mouth"></b></span><button data-k="mouth" data-d="1">▶</button></div>
        ${p.bot ? `<div class="seg" id="ed-lv">${Object.entries(BOT_LEVELS).map(([k, v]) => `<button data-lv="${k}">${v.label}</button>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="row end"><button class="btn" id="ed-cancel">Cancelar</button><button class="btn primary" id="ed-ok">Guardar</button></div>`);
  let lv = p.difficulty;
  const redraw = () => {
    avatarCanvasInto($('#ed-prev'), draft);
    $('#ed-eyes').textContent = EYES[draft.eyes];
    $('#ed-mouth').textContent = MOUTHS[draft.mouth];
    for (const b of $$('#ed-colors .sw')) b.classList.toggle('on', +b.dataset.c === draft.color);
    for (const b of $$('#ed-lv button')) b.classList.toggle('on', b.dataset.lv === lv);
  };
  for (const b of $$('#ed-colors .sw')) b.onclick = () => { draft.color = +b.dataset.c; redraw(); };
  for (const b of $$('.stepper button')) b.onclick = () => {
    const k = b.dataset.k, n = k === 'eyes' ? EYES.length : MOUTHS.length;
    draft[k] = (draft[k] + +b.dataset.d + n) % n; redraw();
  };
  for (const b of $$('#ed-lv button')) b.onclick = () => { lv = b.dataset.lv; redraw(); };
  $('#ed-cancel').onclick = closeModal;
  $('#ed-ok').onclick = () => {
    draft.name = $('#ed-name').value.trim().slice(0, 12) || p.name;
    Object.assign(p, draft);
    if (p.bot) p.difficulty = lv;
    if (p.kind === 'keyboard') store('teclado' + p.slot, draft);
    closeModal();
    playersChanged();
  };
  redraw();
}

function avatarCanvasInto(canvas, d) {
  const tmp = avatarCanvas(d, canvas.width / 2);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

function startFromLobby() {
  if (app.players.length < 2) return toast('Hacen falta al menos 2 jugadores. ¡Añade bots!');
  if (app.mode === 'fiesta') startParty();
  else showPicker();
}

// ---------------------------------------------------------------- FIESTA
function startParty() {
  for (const p of app.players) { p.score = 0; p.wins = 0; }
  app.played = [];
  const n = app.settings.rounds;
  const q = [];
  while (q.length < n) {
    let batch = shuffle(GAMES.map((g) => g.id));
    if (q.length && batch[0] === q[q.length - 1]) batch.push(batch.shift());
    q.push(...batch);
  }
  app.queue = q.slice(0, n);
  if (params.get('games')) app.queue = params.get('games').split(',').filter(gameById).slice(0, n);
  app.gameIndex = 0;
  nextGame();
}

function nextGame() {
  if (app.gameIndex >= app.queue.length) return showPodium();
  showRoulette(gameById(app.queue[app.gameIndex]));
}

// ---------------------------------------------------------------- RULETA
function showRoulette(def) {
  app.state = 'roulette';
  app.view = 'plaza';
  world.setScene(plaza.scene);
  setSky(DEFAULT_SKY);
  plaza.setMode('lobby');
  show('scr-roulette');
  sfx.music('menu');
  phoneAll({ stick: true, a: 'Saltar', b: null, msg: '🎡 ¡Girando la ruleta!' });
  $('#scr-roulette').innerHTML = `
    <div class="roulette-wrap">
      <div class="round-label">Minijuego ${app.gameIndex + 1} de ${app.queue.length}</div>
      <div class="wheel-box"><div class="pointer"></div><canvas id="wheel" width="560" height="560"></canvas></div>
      <div class="wheel-result" id="wheel-result"></div>
      ${miniStandings()}
    </div>`;
  const cv = $('#wheel');
  const ctx = cv.getContext('2d');
  const n = GAMES.length;
  const seg = (Math.PI * 2) / n;
  const target = GAMES.indexOf(def);
  // el puntero está arriba (−π/2): el centro del segmento objetivo debe acabar ahí
  const finalRot = -Math.PI / 2 - (target + 0.5) * seg + Math.PI * 2 * (5 + Math.floor(Math.random() * 2)) + rand(-seg * 0.3, seg * 0.3);
  const startRot = rand(0, Math.PI * 2);
  let t = 0;
  const DUR = 3.6;
  let lastSeg = -1;
  const draw = (rot) => {
    const W = cv.width, R = W / 2 - 10;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.translate(W / 2, W / 2);
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * seg, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#ffffff' : '#eaf7fd';
      ctx.fill();
      ctx.strokeStyle = '#cfe3ee'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = GAMES[i].color;
      ctx.beginPath(); ctx.arc(R - 46, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.font = '34px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(R - 46, 0); ctx.rotate(Math.PI / 2); ctx.fillStyle = '#fff'; ctx.fillText(GAMES[i].icon, 0, 2); ctx.restore();
      ctx.fillStyle = '#3b4552';
      ctx.font = '700 19px Poppins, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(GAMES[i].short || GAMES[i].name, R - 88, 1);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.lineWidth = 12; ctx.strokeStyle = '#34beed'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = '#34beed'; ctx.font = '800 28px Poppins, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, 2);
    ctx.restore();
  };
  const step = () => {
    if (app.state !== 'roulette') return;
    t += 1 / 60 * SPEED;
    const k = Math.min(1, t / DUR);
    const e = 1 - Math.pow(1 - k, 4);
    const rot = startRot + (finalRot + Math.PI * 2 * 2 - startRot) * e;
    draw(rot);
    const cur = Math.floor((((-Math.PI / 2 - rot) % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2) / seg);
    if (cur !== lastSeg) { lastSeg = cur; sfx.play('tick'); }
    if (k < 1) requestAnimationFrame(step);
    else {
      sfx.play('fanfare');
      $('#wheel-result').innerHTML = `<span style="--c:${def.color}">${def.icon} ${esc(def.name)}</span>`;
      after(1.8, () => showIntro(def));
    }
  };
  draw(startRot);
  after(0.4, () => requestAnimationFrame(step));
}

function miniStandings() {
  if (app.mode !== 'fiesta' || app.gameIndex === 0) return '';
  const r = app.players.slice().sort((a, b) => b.score - a.score);
  return `<div class="mini-stand">${r.map((p, i) => `<span>${i + 1}. ${chip(p)} <b>${p.score}</b></span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- JUEGO LIBRE
function showPicker() {
  app.state = 'pick';
  app.view = 'plaza';
  world.setScene(plaza.scene);
  setSky(DEFAULT_SKY);
  plaza.setMode('lobby');
  show('scr-pick');
  sfx.music('menu');
  lobbyUI();
  $('#scr-pick').innerHTML = `
    <h2 class="pick-title">🎯 Elige un minijuego</h2>
    <div class="game-grid">${GAMES.map((g) => `
      <button class="game-card" data-g="${g.id}" style="--c:${g.color}">
        <div class="gc-ico">${g.icon}</div>
        <div class="gc-name">${esc(g.name)}</div>
        <div class="gc-tag">${esc(g.tag)}</div>
      </button>`).join('')}</div>
    <div class="bottom-bar"><button class="btn" id="pick-back">◀ Sala</button><button class="btn" id="pick-rand">🎲 Al azar</button></div>`;
  for (const b of $$('.game-card')) b.onclick = () => showIntro(gameById(b.dataset.g));
  $('#pick-back').onclick = () => goLobby('libre');
  $('#pick-rand').onclick = () => showIntro(pick(GAMES));
}

// ---------------------------------------------------------------- INTRO DEL MINIJUEGO
function controlsHTML(def) {
  const c = def.controls;
  const rows = [];
  if (c.stick) rows.push(`<div class="ctl"><span class="key stick">🕹️</span><span>${esc(c.stick)}</span><span class="soft">WASD / Flechas</span></div>`);
  if (c.a) rows.push(`<div class="ctl"><span class="key a">A</span><span>${esc(c.a)}</span><span class="soft">Espacio / Enter</span></div>`);
  if (c.b) rows.push(`<div class="ctl"><span class="key b">B</span><span>${esc(c.b)}</span><span class="soft">Shift</span></div>`);
  return rows.join('');
}

function showIntro(def) {
  clearTimers();
  createGame(def);
  app.state = 'intro';
  app.ready = new Set();
  show('scr-intro');
  $('#scr-intro').innerHTML = `
    <div class="intro-card" style="--c:${def.color}">
      <div class="intro-head"><div class="intro-ico">${def.icon}</div><div>
        <div class="intro-kick">${app.mode === 'fiesta' ? `Minijuego ${app.gameIndex + 1} de ${app.queue.length}` : 'Juego libre'}</div>
        <h2>${esc(def.name)}</h2><div class="intro-tag">${esc(def.tag)}</div></div></div>
      <p class="intro-desc">${def.desc}</p>
      <div class="ctls">${controlsHTML(def)}</div>
      <div class="ready-row" id="ready-row"></div>
      <div class="row center">
        <button class="btn primary big" id="intro-go">¡Empezar!</button>
      </div>
      <div class="soft small center">Pulsad <b>A</b> cuando estéis listos</div>
    </div>`;
  $('#intro-go').onclick = beginCountdown;
  phoneAll({ stick: false, a: '¡Listo!', b: null, msg: `${def.icon} ${def.name}: pulsa cuando estés listo` });
  for (const p of app.players) if (p.bot) after(rand(0.6, 2.2), () => { if (app.state === 'intro') markReady(p); });
  renderReady();
  after(30, () => { if (app.state === 'intro') beginCountdown(); });
  sfx.play('whoosh');
}

function markReady(p) {
  app.ready.add(p.id);
  sfx.play('pop');
  if (app.state === 'intro') {
    phoneUI(p, { stick: false, a: null, b: null, msg: '✅ ¡Listo! Esperando a los demás…' });
    renderReady();
    if (app.players.every((q) => app.ready.has(q.id) || !q.online)) after(0.5, () => { if (app.state === 'intro') beginCountdown(); });
  } else if (app.state === 'results') {
    phoneUI(p, { stick: false, a: null, b: null, msg: '✅ Esperando a los demás…' });
    renderResultsReady();
    if (app.players.every((q) => app.ready.has(q.id) || !q.online)) after(0.4, () => { if (app.state === 'results') continueAfterResults(); });
  }
}

function renderReady() {
  const row = $('#ready-row');
  if (!row) return;
  row.innerHTML = app.players.map((p) => `<span class="rd ${app.ready.has(p.id) ? 'on' : ''}" style="--c:${hexStr(p.color)}"><img src="${faceURL(p, 28)}" alt="">${esc(p.name)}${app.ready.has(p.id) ? ' ✓' : ''}</span>`).join('');
}

// ---------------------------------------------------------------- CREAR / JUGAR
function createGame(def) {
  disposeGame();
  const scene = new THREE.Scene();
  const fx = new FX(scene);
  const cur = { def, scene, fx, avatars: [], active: false, finished: false };
  app.cur = cur;
  world.setScene(scene);
  app.view = 'game';
  for (const p of app.players) { p.resetInput(); p.botMem = {}; }
  const ctx = {
    world, scene, fx, sfx,
    players: app.players.slice(),
    makeAvatar: (p) => { const av = new Avatar(p).addTo(scene); cur.avatars.push(av); return av; },
    announce, toast,
    hud: (html) => { $('#hud-content').innerHTML = html; },
    chip,
    escape: esc,
    setSky,
    phoneUI,
    vibrate: (p, ms) => phoneSend(p, { t: 'vib', ms }),
    signal: (on) => net.broadcast({ t: 'sig', on: !!on }),
    finish: (groups) => finishGame(groups),
  };
  cur.ctx = ctx;
  setSky(DEFAULT_SKY, 0xcdeefb);
  cur.inst = def.create(ctx);
  $('#hud-game').innerHTML = `<span class="hud-ico" style="--c:${def.color}">${def.icon}</span>${esc(def.name)}`;
  $('#hud-content').innerHTML = '';
}

function beginCountdown() {
  if (app.state !== 'intro' || !app.cur) return;
  clearTimers();
  app.state = 'countdown';
  show('hud');
  const cur = app.cur;
  sfx.music(cur.def.music);
  const c = cur.def.controls;
  phoneAll({ stick: !!c.stick, a: c.a, b: c.b, msg: `${cur.def.icon} ${cur.def.name}` });
  const steps = ['3', '2', '1'];
  steps.forEach((s, i) => after(i * 0.85, () => { announce(s, { color: '#34beed', dur: 0.8, size: 'huge' }); sfx.play('count'); }));
  after(steps.length * 0.85, () => {
    if (app.cur !== cur) return;
    announce('¡YA!', { color: '#4cd07d', dur: 0.9, size: 'huge' });
    sfx.play('go');
    app.state = 'playing';
    cur.active = true;
    cur.inst.start();
  });
}

function finishGame(groups) {
  const cur = app.cur;
  if (!cur || cur.finished) return;
  cur.finished = true;
  // asegurar que todos aparecen una vez
  const seen = new Set();
  const clean = [];
  for (const g of groups) {
    const ids = g.filter((id) => app.players.some((p) => p.id === id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length) clean.push(ids);
  }
  const missing = app.players.filter((p) => !seen.has(p.id)).map((p) => p.id);
  if (missing.length) clean.push(missing);
  cur.results = placementsToResults(clean);
  app.played.push({ id: cur.def.id, time: Math.round(cur.inst.gt ?? cur.inst.t ?? 0), winners: clean[0].map((id) => app.players.find((p) => p.id === id).name) });
  if (app.mode === 'fiesta') {
    for (const r of cur.results) {
      const p = app.players.find((q) => q.id === r.id);
      p.score += r.pts;
      if (r.place === 1) p.wins++;
    }
  }
  app.state = 'finishing';
  announce('¡FIN!', { color: '#ff5a5a', dur: 1.6, size: 'huge' });
  sfx.play('whistle');
  sfx.music(null);
  for (const r of cur.results) {
    const p = app.players.find((q) => q.id === r.id);
    phoneUI(p, { stick: false, a: null, b: null, msg: r.place === 1 ? '🏆 ¡Has ganado!' : `Has quedado ${r.place}º` });
    if (r.place === 1) phoneSend(p, { t: 'vib', ms: 400 });
  }
  after(2.8, () => showResults());
  setTimeout(() => sfx.play('win'), 500);
}

// ---------------------------------------------------------------- RESULTADOS
function showResults() {
  const cur = app.cur;
  if (!cur) return;
  app.state = 'results';
  app.ready = new Set();
  show('scr-results');
  const res = cur.results;
  const fiesta = app.mode === 'fiesta';
  const medal = (pl) => (pl === 1 ? '🥇' : pl === 2 ? '🥈' : pl === 3 ? '🥉' : pl + 'º');
  const standings = app.players.slice().sort((a, b) => b.score - a.score || b.wins - a.wins);
  const maxScore = Math.max(1, ...standings.map((p) => p.score));
  $('#scr-results').innerHTML = `
    <div class="results-card">
      <div class="res-head" style="--c:${cur.def.color}">${cur.def.icon} ${esc(cur.def.name)} · Resultados</div>
      <div class="res-cols">
        <div class="res-list">${res.map((r, i) => {
          const p = app.players.find((q) => q.id === r.id);
          return `<div class="res-row" style="--c:${hexStr(p.color)};animation-delay:${i * 0.12}s">
            <span class="pl">${medal(r.place)}</span><img src="${faceURL(p, 44)}" alt=""><span class="nm">${esc(p.name)}</span>
            ${fiesta ? `<span class="pts">+${r.pts}</span>` : ''}</div>`;
        }).join('')}</div>
        ${fiesta ? `<div class="res-stand"><h3>Clasificación general</h3>${standings.map((p, i) => `
          <div class="st-row"><span class="pos">${i + 1}</span><img src="${faceURL(p, 32)}" alt=""><span class="nm">${esc(p.name)}</span>
          <span class="track"><i style="--w:${(p.score / maxScore) * 100}%;background:${hexStr(p.color)}"></i></span><b>${p.score}</b></div>`).join('')}</div>` : ''}
      </div>
      <div class="ready-row" id="res-ready"></div>
      <div class="row center"><button class="btn primary big" id="res-next">${fiesta ? (app.gameIndex + 1 >= app.queue.length ? '🏆 Ver el podio' : 'Siguiente minijuego ▶') : 'Continuar ▶'}</button>
      ${!fiesta ? '<button class="btn" id="res-again">🔁 Repetir</button>' : ''}</div>
      <div class="soft small center">o pulsad <b>A</b> todos</div>
    </div>`;
  $('#res-next').onclick = continueAfterResults;
  if ($('#res-again')) $('#res-again').onclick = () => showIntro(cur.def);
  phoneAll({ stick: false, a: 'Continuar', b: null, msg: 'Mira los resultados en la tele' });
  for (const p of app.players) if (p.bot) app.ready.add(p.id);
  renderResultsReady();
  const humans = app.players.filter((p) => !p.bot && p.online);
  after(humans.length ? 25 : 2.5, () => { if (app.state === 'results' && app.cur === cur) continueAfterResults(); });
}

function renderResultsReady() {
  const row = $('#res-ready');
  if (!row) return;
  const humans = app.players.filter((p) => !p.bot);
  row.innerHTML = humans.map((p) => `<span class="rd ${app.ready.has(p.id) ? 'on' : ''}" style="--c:${hexStr(p.color)}"><img src="${faceURL(p, 28)}" alt="">${esc(p.name)}${app.ready.has(p.id) ? ' ✓' : ''}</span>`).join('');
}

function continueAfterResults() {
  if (app.state !== 'results') return;
  clearTimers();
  const def = app.cur && app.cur.def;
  disposeGame();
  if (app.mode === 'fiesta') { app.gameIndex++; nextGame(); }
  else showPicker();
  return def;
}

function disposeGame() {
  const cur = app.cur;
  if (!cur) return;
  try { cur.inst.dispose && cur.inst.dispose(); } catch (e) { console.warn(e); }
  for (const av of cur.avatars) av.dispose();
  disposeScene(cur.scene);
  app.cur = null;
  $('#hud-content').innerHTML = '';
  net.broadcast({ t: 'sig', on: false });
  world.setScene(plaza.scene);
  app.view = 'plaza';
}

// ---------------------------------------------------------------- PODIO
function showPodium() {
  app.state = 'podium';
  const ranking = app.players.slice().sort((a, b) => b.score - a.score || b.wins - a.wins);
  app.podium = new Podium(world, ranking);
  world.setScene(app.podium.scene);
  setSky('linear-gradient(#ffd36b 0%, #ffe9b0 45%, #fff8e6 100%)');
  app.view = 'podium';
  show('scr-podium');
  sfx.music('podium');
  sfx.play('fanfare');
  const w = ranking[0];
  const ties = ranking.filter((p) => p.score === w.score && p.wins === w.wins);
  const title = ties.length > 1 ? `¡Empate entre ${ties.map((p) => esc(p.name)).join(' y ')}!` : `¡${esc(w.name)} gana la fiesta!`;
  $('#scr-podium').innerHTML = `
    <div class="podium-top"><div class="trophy">🏆</div><h1>${title}</h1></div>
    <div class="podium-card">
      ${ranking.map((p, i) => `<div class="st-row"><span class="pos">${i + 1}</span><img src="${faceURL(p, 32)}" alt=""><span class="nm">${esc(p.name)}</span><span class="soft">${p.wins} ${p.wins === 1 ? 'victoria' : 'victorias'}</span><b>${p.score} pts</b></div>`).join('')}
      <div class="row center"><button class="btn primary" id="pod-again">🔁 Otra fiesta</button><button class="btn" id="pod-menu">🏠 Menú</button></div>
    </div>
    <div class="signature">HECHO POR @BYALVARO__</div>`;
  $('#pod-again').onclick = () => { disposePodium(); startParty(); };
  $('#pod-menu').onclick = goMenu;
  for (const p of app.players) phoneUI(p, { stick: false, a: null, b: null, msg: p === w ? '🏆 ¡HAS GANADO LA FIESTA!' : `Has quedado ${ranking.indexOf(p) + 1}º en la fiesta` });
  window.__done = true;
}

function disposePodium() {
  if (!app.podium) return;
  disposeScene(app.podium.scene);
  for (const a of app.podium.avatars) a.av.dispose();
  app.podium = null;
  world.setScene(plaza.scene);
  app.view = 'plaza';
}

// ---------------------------------------------------------------- PAUSA
function togglePause(force) {
  const can = app.view === 'game' && ['playing', 'countdown', 'finishing'].includes(app.state);
  const on = force !== undefined ? force : !app.paused;
  if (on && !can) return;
  app.paused = on;
  $('#pause').classList.toggle('on', on);
  if (on) sfx.music(null); else if (app.cur) sfx.music(app.cur.def.music);
}

function buildPause() {
  $('#pause').innerHTML = `
    <div class="pause-card">
      <h2>⏸️ Pausa</h2>
      <button class="btn primary" id="p-cont">▶ Continuar</button>
      <button class="btn" id="p-skip">⏭️ Saltar este minijuego</button>
      <button class="btn" id="p-opt">⚙️ Opciones</button>
      <button class="btn danger" id="p-exit">🏠 Salir al menú</button>
    </div>`;
  $('#p-cont').onclick = () => togglePause(false);
  $('#p-opt').onclick = openOptions;
  $('#p-skip').onclick = () => {
    togglePause(false);
    clearTimers();
    disposeGame();
    toast('Minijuego saltado (sin puntos)');
    if (app.mode === 'fiesta') { app.gameIndex++; nextGame(); } else showPicker();
  };
  $('#p-exit').onclick = () => { togglePause(false); goMenu(); };
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if ($('#modal').classList.contains('on')) return closeModal();
    togglePause();
  }
  if (e.code === 'KeyF' && e.ctrlKey) { e.preventDefault(); toggleFullscreen(); }
});

// ---------------------------------------------------------------- MODALES
function openModal(html) {
  $('#modal-card').innerHTML = html;
  $('#modal').classList.add('on');
}
function closeModal() { $('#modal').classList.remove('on'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

function openOptions() {
  openModal(`
    <h2>⚙️ Opciones</h2>
    <label class="slider">🎵 Música <input type="range" id="o-mus" min="0" max="1" step="0.05" value="${sfx.musicVol}"></label>
    <label class="slider">🔊 Efectos <input type="range" id="o-sfx" min="0" max="1" step="0.05" value="${sfx.sfxVol}"></label>
    <div class="row"><button class="btn" id="o-full">⛶ Pantalla completa</button></div>
    <div class="row end"><button class="btn primary" id="o-ok">Hecho</button></div>`);
  const upd = () => { sfx.setVolumes(+$('#o-mus').value, +$('#o-sfx').value); };
  $('#o-mus').oninput = upd;
  $('#o-sfx').oninput = () => { upd(); sfx.play('coin'); };
  $('#o-full').onclick = toggleFullscreen;
  $('#o-ok').onclick = closeModal;
}

function openHelp() {
  openModal(`
    <h2>❓ Cómo se juega</h2>
    <div class="help">
      <p><b>1.</b> Abre el juego en el PC conectado a la tele y entra en <b>Modo fiesta</b> o <b>Juego libre</b>.</p>
      <p><b>2.</b> Cada jugador escanea el <b>QR</b> con su móvil: el móvil se convierte en su mando (joystick + botones A y B). En el móvil eliges nombre, color y cara.</p>
      <p><b>3.</b> ¿Faltan jugadores? Añade <b>bots</b> (fácil, normal o difícil) o juega con el <b>teclado</b> (hasta 2) y <b>mandos de consola</b>.</p>
      <p><b>4.</b> En el modo fiesta, una ruleta elige cada minijuego. Puntos: 1º = 5, 2º = 3, 3º = 2, resto = 1. Al final, ¡podio!</p>
      <p><b>Teclado:</b><br>${KEY_HELP.map(esc).join('<br>')}</p>
      <p><b>Esc</b> pausa la partida · <b>Ctrl+F</b> pantalla completa.</p>
      <p class="soft small">Para jugar con móviles, el juego tiene que estar en internet (por ejemplo, GitHub Pages) y los móviles necesitan conexión.</p>
    </div>
    <div class="row end"><button class="btn primary" id="h-ok">¡Entendido!</button></div>`);
  $('#h-ok').onclick = closeModal;
}

// ---------------------------------------------------------------- ARRANQUE
buildMenu();
buildLobby();
buildPause();
goMenu();
$('#loading').classList.add('hide');
requestAnimationFrame(frame);

if (AUTOPLAY) {
  // Modo de prueba: 4 bots juegan una fiesta completa solos
  app.settings.rounds = parseInt(params.get('rounds') || '5', 10);
  const lv = ['facil', 'normal', 'dificil', 'normal', 'dificil', 'facil', 'normal', 'dificil'];
  const n = parseInt(params.get('bots') || '4', 10);
  for (let i = 0; i < n; i++) addBot(lv[i]);
  app.mode = 'fiesta';
  setTimeout(() => startParty(), 300);
}
