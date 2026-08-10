# Battle City 3D

Juego web 3D multijugador P2P inspirado en Battle City.

## Tecnología
- Three.js
- Trystero / WebRTC P2P
- GitHub Pages
- HTML + CSS + JavaScript ES modules

## Controles
### PC
- WASD / flechas: mover
- Mouse: apuntar la torreta
- Click izquierdo: disparar

### Móvil
- Horizontal obligatorio
- Joystick izquierdo: mover
- Tap sobre el mapa: apuntar y disparar

## Lobby
- Crear sala / entrar por código
- Nombre de jugador
- Color exclusivo por jugador, sin repetir
- Clase de tanque: Scout, Assault, Hunter o Heavy
- El admin elige el modo y comienza la partida

## Modos
- Deathmatch: 10 bajas o mayor puntuación al terminar 5 minutos
- Team Deathmatch: 20 bajas o mayor puntuación al terminar 5 minutos
- Captura la bandera: 3 capturas o mayor puntuación al terminar 7 minutos

## Juego
- Cámara ortográfica casi cenital con ligera inclinación
- Tanques al 50% del tamaño inicial
- Siluetas visualmente distintas para Scout, Assault, Hunter y Heavy
- El color identifica al jugador, independientemente de la clase
- Nombre del jugador sobre el tanque
- Cuerpo y torreta independientes
- Clases con velocidad, cadencia, daño y escudos distintos
- Colisión entre tanques
- Respawn con protección temporal y pulso visual
- Fuego amigo de equipo: paraliza brevemente en vez de hacer daño
- Ladrillos destruibles con escombros físicos simples
- Acero, agua, árboles e hielo
- Con 3 estrellas los proyectiles pueden destruir acero
- Los proyectiles enemigos pueden anularse entre sí al chocar
- Hielo con deslizamiento
- Power-ups ocultos en algunos ladrillos y apariciones temporales en pasillos
- Power-ups con iconos y avisos al recogerlos
- Mejoras, escudo, disparo rápido, daño, velocidad, invulnerabilidad y reparación
- Banderas 3D con animación de tela en CTF
- Bases de CTF resaltadas visualmente
- Temporizador de partida con alerta en los últimos 30 segundos
- Sonidos arcade procedurales para disparos, explosiones y power-ups
- Killfeed, HUD, puntuación y pantalla de fin de partida

El proyecto no utiliza backend tradicional: las partidas se sincronizan entre navegadores mediante WebRTC.
