# Battle City 3D

Juego multijugador web 3D inspirado en Battle City.

## Dirección actual
- Cámara ortográfica casi cenital, con una leve inclinación para conservar volumen 3D.
- El mapa completo permanece visible; la cámara no sigue al tanque.
- PC: WASD/flechas + mouse para apuntar + click para disparar.
- Móvil horizontal: joystick izquierdo para moverse + tap en el mapa para apuntar y disparar.
- Multijugador P2P mediante Trystero/WebRTC; sin IA por ahora.
- Deathmatch, Team Deathmatch y Captura la bandera.
- Cada jugador tiene su propio color; la clase de tanque no define el color.

## Stack
- Three.js
- Trystero / WebRTC
- HTML + CSS + JavaScript ES modules
- GitHub Pages

## Primera vertical slice
Lobby por nombre/código, selección de modo por el admin, mapa 3D, tanque provisional con cuerpo y torreta independientes, movimiento, apuntado, disparos, paredes de ladrillo destructibles y escombros simples.
