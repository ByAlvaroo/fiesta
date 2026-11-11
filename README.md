# 🎉 Fiesta en el Salón

Party game 3D para el navegador, estilo Wii, para jugar con amigos y familia en la tele.
El PC muestra el juego y **cada móvil es un mando** (se entra escaneando un QR).

**HECHO POR @BYALVARO__**

---

## Minijuegos (v1.0)

| | Minijuego | De qué va | Controles |
|---|---|---|---|
| ⬡ | **¡El Suelo Se Cae!** | 4 pisos de hexágonos que caen al pisarlos. Último en pie gana. Baldosa dorada = cae todo un color. | Mover · A saltar · B andar despacio |
| 🌀 | **La Barredora** | Una barra gira cada vez más rápido: salta. Luego llega la barra alta: agáchate. | Mover · A saltar · B agacharse |
| 🎨 | **Pintapisos** | 60 s para pintar más suelo que nadie. Cubo, rayo, bomba de pintura, rodillos y lavado final. | Mover · B acelerón |
| 💣 | **Patata Bomba** | Pásala tocando a otro. La mecha es secreta y el pitido a veces miente. | Mover · B acelerón |
| 🤠 | **Duelo al Sol** | Torneo de duelos: dispara al ver **¡YA!**. Si te adelantas, pierdes. Señales trampa. | A disparar |

Todos funcionan con **bots** (fácil, normal y difícil).

## Cómo se juega

1. Abre el juego en el PC (mejor conectado a la tele) → **Modo fiesta** o **Juego libre**.
2. Cada jugador escanea el **QR** con el móvil, elige nombre, color y cara, y ya tiene mando.
3. También se puede jugar con **teclado** (hasta 2 en el mismo PC), **mandos de consola** (pulsa A para unirte) y **bots**.
4. Modo fiesta: una ruleta elige cada minijuego. Puntos: 1º = 5, 2º = 3, 3º = 2, resto = 1. Al final, podio.

**Teclado**
- Jugador 1: WASD para moverse · Espacio = A · Shift izquierdo o E = B
- Jugador 2: Flechas · Enter = A · Shift derecho = B
- **Esc** = pausa (continuar, saltar minijuego, salir) · **Ctrl+F** = pantalla completa

## Publicarlo en GitHub Pages (para usar los móviles)

Los móviles necesitan abrir el juego desde internet con **https**. GitHub Pages es gratis:

1. Crea un repositorio nuevo en GitHub (por ejemplo `fiesta-en-el-salon`).
2. Sube **todo el contenido de esta carpeta** (que `index.html` quede en la raíz del repositorio).
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En un minuto estará en `https://TU-USUARIO.github.io/fiesta-en-el-salon/`.
5. Abre esa dirección en el PC y escanea el QR con los móviles. Los móviles no tienen que estar en el mismo Wi-Fi, pero sí con internet.

## Probarlo en tu PC sin subirlo

Abre una terminal en esta carpeta y ejecuta:

```
python -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador. Así funciona con teclado, mandos y bots.
(Si abres `index.html` con doble clic, los módulos de JavaScript no cargan: hace falta el servidor.)

## Cómo está hecho

- **Three.js** (3D) y **PeerJS** (conexión WebRTC PC ⇄ móviles) se cargan desde CDN. No hace falta instalar nada ni tener servidor propio.
- Todo el arte son formas simples (cápsulas, esferas, cajas) con sombreado tipo dibujo animado y contorno negro.
- La música y los efectos están **sintetizados** con Web Audio: no hay archivos de sonido.
- El PC es el que manda (física, puntos, ganadores). Los móviles solo envían el joystick y los botones.
- En el Duelo al Sol, el tiempo de reacción se mide en el propio móvil para que el lag no influya.

```
index.html          ← pantalla del PC (la tele)
mando.html          ← lo que abre el móvil con el QR
css/                ← estilos (style.css = tele, mando.css = móvil)
js/main.js          ← menú, sala, ruleta, intro, resultados, podio, pausa
js/players.js       ← jugadores, bots, teclado y mandos de consola
js/net.js           ← conexión con los móviles (PeerJS)
js/mando.js         ← lógica del mando del móvil
js/avatar.js        ← personaje 3D tipo Mii
js/face.js          ← caras (ojos y bocas) en 2D
js/world.js         ← cámara, materiales toon, partículas
js/mover.js         ← física de personajes (correr, saltar, dash, empujones)
js/audio.js         ← música y efectos sintetizados
js/plaza.js         ← isla del menú y de la sala
js/podium.js        ← podio final
js/games/           ← un archivo por minijuego + index.js con la lista
```

### Añadir un minijuego nuevo

1. Copia uno parecido de `js/games/` (por ejemplo `bomba.js`) y cámbialo.
2. Cada minijuego exporta `{ id, name, short, tag, icon, color, music, desc, controls, create(ctx) }`.
3. La clase del juego tiene `start()`, `update(dt, active)` y `dispose()`, y cuando termina llama a `ctx.finish(grupos)` con los ids de los jugadores ordenados del 1º al último (los empatados van en el mismo grupo).
4. Añádelo a la lista de `js/games/index.js`. La ruleta, la intro, los puntos y el podio lo incluyen solos.

## Créditos

Idea, diseño y dirección: **@byalvaro__**
Librerías: [three.js](https://threejs.org) (MIT) · [PeerJS](https://peerjs.com) (MIT) · Fuente Poppins (Google Fonts, OFL)
