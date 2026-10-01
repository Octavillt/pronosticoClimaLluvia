// Genera los íconos PWA de public/icons/ (una gota de lluvia blanca sobre verde #009966).
// Los PNG se commitean al repo: Hostinger solo corre el build, no este script.
// Para regenerarlos tras cambiar el dibujo: `node scripts/generar-iconos.mjs`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERDE = [0, 153, 102];
const BLANCO = [255, 255, 255];
const SALIDA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function geometria(escala) {
  const pico = 0.5 + (0.18 - 0.5) * escala;
  const cx = 0.5;
  const cy = 0.5 + (0.62 - 0.5) * escala;
  const radio = 0.23 * escala;
  const distancia = cy - pico;
  const angulo = Math.asin(radio / distancia);
  const tangenteX = radio * Math.cos(angulo);
  const tangenteY = cy - radio * Math.sin(angulo);
  return { pico, cx, cy, radio, tangenteX, tangenteY };
}

// Una homotecia conserva la misma gota y deja el maskable dentro del círculo seguro de radio 0.4.
const GOTAS = {
  normal: geometria(1),
  maskable: geometria(0.75),
};

function dentroDeGota(u, v, forma) {
  const dx = u - forma.cx;
  const dy = v - forma.cy;
  if (dx * dx + dy * dy <= forma.radio * forma.radio) return true;
  if (v < forma.pico || v > forma.tangenteY) return false;
  const progreso = (v - forma.pico) / (forma.tangenteY - forma.pico);
  return Math.abs(dx) <= progreso * forma.tangenteX;
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = TABLA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pedazo(tipo, datos) {
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  const longitud = Buffer.alloc(4);
  longitud.writeUInt32BE(datos.length, 0);
  return Buffer.concat([longitud, cuerpo, crc]);
}

function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // color RGB
  const crudo = Buffer.alloc(alto * (1 + ancho * 3));
  for (let y = 0; y < alto; y++) {
    const fila = y * (1 + ancho * 3);
    crudo[fila] = 0; // filtro "ninguno" en cada scanline
    pixeles.copy(crudo, fila + 1, y * ancho * 3, (y + 1) * ancho * 3);
  }
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    firma,
    pedazo('IHDR', ihdr),
    pedazo('IDAT', deflateSync(crudo)),
    pedazo('IEND', Buffer.alloc(0)),
  ]);
}

// 2x2 supersampling para bordes menos escalonados.
function dibujar(lado, forma) {
  const pixeles = Buffer.alloc(lado * lado * 3);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let blanco = 0;
      for (const [fx, fy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const u = (x + fx) / lado;
        const v = (y + fy) / lado;
        if (dentroDeGota(u, v, forma)) blanco++;
      }
      const color = blanco >= 2 ? BLANCO : VERDE;
      const i = (y * lado + x) * 3;
      pixeles[i] = color[0];
      pixeles[i + 1] = color[1];
      pixeles[i + 2] = color[2];
    }
  }
  return pixeles;
}

function escribirPng(nombre, lado, forma) {
  writeFileSync(join(SALIDA, nombre), png(lado, lado, dibujar(lado, forma)));
  console.log(`generado public/icons/${nombre} (${lado}x${lado})`);
}

const coordenada = (valor) => Number((valor * 512).toFixed(6));
const { pico, cx, radio, tangenteX, tangenteY } = GOTAS.normal;
const TRAZO = [
  `M${coordenada(cx)} ${coordenada(pico)}`,
  `L${coordenada(cx + tangenteX)} ${coordenada(tangenteY)}`,
  `A${coordenada(radio)} ${coordenada(radio)} 0 1 1`,
  `${coordenada(cx - tangenteX)} ${coordenada(tangenteY)}`,
  `L${coordenada(cx)} ${coordenada(pico)} Z`,
].join('\n    ');
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#009966"/>
  <path fill="#ffffff" d="${TRAZO}"/>
</svg>
`;

mkdirSync(SALIDA, { recursive: true });
escribirPng('icon-192.png', 192, GOTAS.normal);
escribirPng('icon-512.png', 512, GOTAS.normal);
escribirPng('icon-512-maskable.png', 512, GOTAS.maskable);
escribirPng('apple-touch-icon.png', 180, GOTAS.normal);
writeFileSync(join(SALIDA, 'icon.svg'), SVG);
console.log('generado public/icons/icon.svg');
