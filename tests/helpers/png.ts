import { deflateSync, inflateSync } from 'node:zlib';

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = TABLA_CRC[(c ^ byte) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function bloque(tipo: string, datos: Uint8Array): Buffer {
  const salida = Buffer.alloc(12 + datos.length);
  salida.writeUInt32BE(datos.length, 0);
  salida.write(tipo, 4, 'ascii');
  salida.set(datos, 8);
  salida.writeUInt32BE(crc32(salida.subarray(4, 8 + datos.length)), 8 + datos.length);
  return salida;
}

/** Codifica RGBA de 8 bits por canal como PNG (sin filtro por fila). */
export function codificarPng(ancho: number, alto: number, rgba: Uint8Array): Buffer {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera[8] = 8;
  cabecera[9] = 6;
  const filas = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y += 1) {
    filas[y * (ancho * 4 + 1)] = 0;
    filas.set(rgba.subarray(y * ancho * 4, (y + 1) * ancho * 4), y * (ancho * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloque('IHDR', cabecera),
    bloque('IDAT', deflateSync(filas)),
    bloque('IEND', new Uint8Array(0)),
  ]);
}

export interface ImagenRgba {
  ancho: number;
  alto: number;
  rgba: Uint8Array;
}

/** Decodifica un PNG RGBA de 8 bits (el formato de los tiles de RainViewer). */
export function decodificarPng(archivo: Buffer): ImagenRgba {
  let ancho = 0;
  let alto = 0;
  const idat: Buffer[] = [];
  for (let o = 8; o < archivo.length; ) {
    const longitud = archivo.readUInt32BE(o);
    const tipo = archivo.toString('ascii', o + 4, o + 8);
    const datos = archivo.subarray(o + 8, o + 8 + longitud);
    if (tipo === 'IHDR') {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      if (datos[8] !== 8 || datos[9] !== 6) {
        throw new Error('Solo se decodifica PNG RGBA de 8 bits');
      }
    } else if (tipo === 'IDAT') {
      idat.push(datos);
    }
    o += 12 + longitud;
  }

  const crudo = inflateSync(Buffer.concat(idat));
  const zancada = ancho * 4;
  const rgba = new Uint8Array(alto * zancada);
  for (let y = 0; y < alto; y += 1) {
    const filtro = crudo[y * (zancada + 1)];
    for (let x = 0; x < zancada; x += 1) {
      const actual = crudo[y * (zancada + 1) + 1 + x];
      const izq = x >= 4 ? rgba[y * zancada + x - 4] : 0;
      const arriba = y > 0 ? rgba[(y - 1) * zancada + x] : 0;
      const diag = x >= 4 && y > 0 ? rgba[(y - 1) * zancada + x - 4] : 0;
      let valor: number;
      switch (filtro) {
        case 0:
          valor = actual;
          break;
        case 1:
          valor = actual + izq;
          break;
        case 2:
          valor = actual + arriba;
          break;
        case 3:
          valor = actual + ((izq + arriba) >> 1);
          break;
        case 4: {
          const p = izq + arriba - diag;
          const pa = Math.abs(p - izq);
          const pb = Math.abs(p - arriba);
          const pc = Math.abs(p - diag);
          valor = actual + (pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : diag);
          break;
        }
        default:
          throw new Error(`Filtro PNG desconocido: ${filtro}`);
      }
      rgba[y * zancada + x] = valor & 255;
    }
  }
  return { ancho, alto, rgba };
}
