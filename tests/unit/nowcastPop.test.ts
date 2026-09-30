import { describe, expect, test } from 'vitest';
import { config } from '../../src/config';
import { calcularNowcast, evaluarDisco } from '../../src/nowcast/nowcastPop';
import { metrosPorPixel } from '../../src/nowcast/tiles';
import { campoConDisco, coberturaTotal } from '../helpers/radar';

const LADO = 768;
const PUNTO = 384;
const LAT = 19.43;
const ZOOM = 7;
const T0 = Date.parse('2026-09-30T03:30:00Z');
const DIEZ_MIN = 600_000;

describe('evaluarDisco', () => {
  const cobertura = coberturaTotal(LADO);

  test('un disco completamente lloviendo da una probabilidad cercana a 1', () => {
    const dbz = campoConDisco(LADO, PUNTO, PUNTO, 50, 35);
    const { pop, cobertura: c } = evaluarDisco(dbz, cobertura, LADO, PUNTO, PUNTO, 10);
    expect(pop).toBeGreaterThan(0.99);
    expect(pop).toBeLessThan(1);
    expect(c).toBe(1);
  });

  test('sin lluvia da una probabilidad cercana a 0, pero no cero', () => {
    const dbz = campoConDisco(LADO, PUNTO, PUNTO, 1, 35, -32);
    const { pop } = evaluarDisco(dbz, cobertura, LADO, 100, 100, 10);
    expect(pop).toBeGreaterThan(0);
    expect(pop).toBeLessThan(0.01);
  });

  test('la lluvia justo bajo el umbral no cuenta', () => {
    const dbz = campoConDisco(LADO, PUNTO, PUNTO, 50, 19);
    expect(evaluarDisco(dbz, cobertura, LADO, PUNTO, PUNTO, 10, 20).pop).toBeLessThan(0.01);
    expect(evaluarDisco(dbz, cobertura, LADO, PUNTO, PUNTO, 10, 19).pop).toBeGreaterThan(0.99);
  });

  test('el borde de una tormenta da una probabilidad intermedia', () => {
    const dbz = campoConDisco(LADO, PUNTO - 30, PUNTO, 30, 35);
    const { pop } = evaluarDisco(dbz, cobertura, LADO, PUNTO, PUNTO, 10);
    expect(pop).toBeGreaterThan(0.1);
    expect(pop).toBeLessThan(0.6);
  });

  test('los píxeles sin cobertura no cuentan como secos: bajan la cobertura', () => {
    const dbz = campoConDisco(LADO, PUNTO, PUNTO, 50, 35);
    const mitad = coberturaTotal(LADO);
    for (let y = 0; y < LADO; y += 1) {
      for (let x = PUNTO; x < LADO; x += 1) {
        mitad[y * LADO + x] = 0;
      }
    }
    const resultado = evaluarDisco(dbz, mitad, LADO, PUNTO, PUNTO, 10);
    expect(resultado.cobertura).toBeGreaterThan(0.4);
    expect(resultado.cobertura).toBeLessThan(0.6);
    // Entre los píxeles observados llueve en todos.
    expect(resultado.pop).toBeGreaterThan(0.98);
  });

  test('sin ningún píxel cubierto devuelve 0 y cobertura 0', () => {
    const dbz = campoConDisco(LADO, PUNTO, PUNTO, 50, 35);
    expect(evaluarDisco(dbz, coberturaTotal(LADO, 0), LADO, PUNTO, PUNTO, 10)).toEqual({
      pop: 0,
      cobertura: 0,
    });
  });

  test('un disco que se sale del mosaico pierde cobertura', () => {
    const dbz = campoConDisco(LADO, 5, 5, 50, 35);
    const { cobertura: c } = evaluarDisco(dbz, cobertura, LADO, 0, 0, 10);
    expect(c).toBeGreaterThan(0.2);
    expect(c).toBeLessThan(0.3);
  });
});

/** Tres frames (−20, −10, 0 min) de un disco que avanza (vx, vy) px/min. */
function camposQueAvanzan(cx0: number, cy0: number, vx: number, vy: number, radio = 14, dbz = 35) {
  return [-20, -10, 0].map((minutos) => ({
    tMs: T0 + minutos * 60_000,
    dbz: campoConDisco(LADO, cx0 + vx * minutos, cy0 + vy * minutos, radio, dbz),
  }));
}

function nowcastDe(campos: ReturnType<typeof camposQueAvanzan>, cobertura = coberturaTotal(LADO)) {
  return calcularNowcast({ campos, cobertura, lado: LADO, puntoX: PUNTO, puntoY: PUNTO, lat: LAT, zoom: ZOOM });
}

describe('calcularNowcast', () => {
  test('una banda de lluvia que se acerca sube la probabilidad con el horizonte', () => {
    // Banda de 40 px de radio (~46 km) a 60 px al oeste, avanzando 0.5 px/min hacia el este:
    // el borde llega al punto en ~40 min y el centro en ~120 min.
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO - 60, PUNTO, 0.5, 0, 40));
    expect(nowcast.movimiento.estado).toBe('estimado');
    const en = (minutos: number) => nowcast.pronostico.find((p) => p.tMs === T0 + minutos * 60_000)!.pop;
    expect(en(0)).toBeLessThan(0.05);
    expect(en(120)).toBeGreaterThan(0.9);
    expect(en(120)).toBeGreaterThan(en(60));
    expect(en(60)).toBeGreaterThan(en(0));
  });

  test('una celda pequeña que se acerca da menos probabilidad que una banda ancha', () => {
    // Con el mismo camino, la celda de 14 px llena solo parte del disco de incertidumbre.
    const celda = nowcastDe(camposQueAvanzan(PUNTO - 60, PUNTO, 0.5, 0, 14));
    const banda = nowcastDe(camposQueAvanzan(PUNTO - 60, PUNTO, 0.5, 0, 40));
    const en = (n: ReturnType<typeof nowcastDe>) => n.pronostico.find((p) => p.tMs === T0 + 120 * 60_000)!.pop;
    expect(en(celda)).toBeGreaterThan(0.1);
    expect(en(celda)).toBeLessThan(0.5);
    expect(en(banda)).toBeGreaterThan(en(celda));
  });

  test('una tormenta que se aleja baja la probabilidad con el horizonte', () => {
    // Encima del punto y avanzando 0.5 px/min hacia el este: se va.
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO, PUNTO, 0.5, 0));
    const en = (minutos: number) => nowcast.pronostico.find((p) => p.tMs === T0 + minutos * 60_000)!.pop;
    expect(en(0)).toBeGreaterThan(0.9);
    expect(en(120)).toBeLessThan(0.3);
    expect(en(180)).toBeLessThan(en(0));
  });

  test('el pronóstico va de 0 a 180 min en pasos de 10 desde el frame más reciente', () => {
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO - 60, PUNTO, 0.5, 0));
    expect(nowcast.tFrameMs).toBe(T0);
    expect(nowcast.pronostico).toHaveLength(config.radar.horizonteMin / config.radar.pasoMin + 1);
    expect(nowcast.pronostico[0].tMs).toBe(T0);
    expect(nowcast.pronostico.at(-1)!.tMs).toBe(T0 + 180 * 60_000);
    nowcast.pronostico.forEach((p, i) => i > 0 && expect(p.tMs - nowcast.pronostico[i - 1].tMs).toBe(DIEZ_MIN));
  });

  test('los frames anteriores al último quedan como observados en el punto', () => {
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO, PUNTO, 0, 0));
    expect(nowcast.observados.map((o) => o.tMs)).toEqual([T0 - 20 * 60_000, T0 - 10 * 60_000]);
    expect(nowcast.observados.every((o) => o.pop > 0.9)).toBe(true);
  });

  test.each([
    ['este', 0.5, 0, 90],
    ['sur', 0, 0.5, 180],
    ['oeste', -0.5, 0, 270],
    ['norte', 0, -0.5, 0],
  ])('el avance hacia el %s da el rumbo correcto', (_nombre, vx, vy, rumbo) => {
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO, PUNTO, vx, vy));
    expect(nowcast.avance).not.toBeNull();
    const diferencia = Math.abs(((nowcast.avance!.haciaGrados - rumbo + 540) % 360) - 180);
    expect(diferencia).toBeLessThan(3);
  });

  test('la velocidad se convierte a km/h con la escala del mapa en esa latitud', () => {
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO, PUNTO, 0.5, 0));
    const esperado = (0.5 * metrosPorPixel(LAT, ZOOM) * 60) / 1000;
    expect(nowcast.avance!.kmh).toBeCloseTo(esperado, 0);
    expect(esperado).toBeGreaterThan(30);
    expect(esperado).toBeLessThan(40);
  });

  test('sin ecos: se asume quieto, sin avance y con probabilidad casi nula', () => {
    const vacio = new Float32Array(LADO * LADO).fill(-32);
    const nowcast = nowcastDe([-20, -10, 0].map((m) => ({ tMs: T0 + m * 60_000, dbz: vacio })));
    expect(nowcast.movimiento).toEqual({ estado: 'sin-ecos' });
    expect(nowcast.avance).toBeNull();
    // El suavizado (k + 0.5)/(n + 1) deja un piso de ~2 % con el disco inicial de ~21 píxeles.
    expect(nowcast.pronostico.every((p) => p.pop > 0 && p.pop < 0.03)).toBe(true);
  });

  test('el radio del disco crece con el horizonte y suaviza el pronóstico lejano', () => {
    // Celda fija de 6 px justo sobre el punto: al crecer el disco, la fracción cubierta baja.
    const campos = [-20, -10, 0].map((m) => ({
      tMs: T0 + m * 60_000,
      dbz: campoConDisco(LADO, PUNTO, PUNTO, 6, 35),
    }));
    const nowcast = nowcastDe(campos);
    expect(nowcast.pronostico[0].pop).toBeGreaterThan(0.9);
    expect(nowcast.pronostico.at(-1)!.pop).toBeLessThan(0.1);
  });

  test('propaga la cobertura del disco a cada paso', () => {
    const sinCobertura = coberturaTotal(LADO, 0);
    const nowcast = nowcastDe(camposQueAvanzan(PUNTO, PUNTO, 0, 0), sinCobertura);
    expect(nowcast.pronostico.every((p) => p.cobertura === 0 && p.pop === 0)).toBe(true);
    expect(nowcast.observados.every((p) => p.cobertura === 0)).toBe(true);
  });

  test('exige al menos un frame', () => {
    expect(() => nowcastDe([])).toThrow(/al menos un frame/);
  });
});

describe('calcularNowcast con opciones propias', () => {
  const opciones = { ...config.radar, horizonteMin: 60, pasoMin: 20, umbralDbz: 40 };

  test('respeta horizonte y paso configurados', () => {
    const nowcast = calcularNowcast(
      { campos: camposQueAvanzan(PUNTO, PUNTO, 0, 0), cobertura: coberturaTotal(LADO), lado: LADO, puntoX: PUNTO, puntoY: PUNTO, lat: LAT, zoom: ZOOM },
      opciones,
    );
    expect(nowcast.pronostico.map((p) => (p.tMs - T0) / 60_000)).toEqual([0, 20, 40, 60]);
  });

  test('un umbral más alto ignora ecos que el de 20 dBZ sí contaría', () => {
    const entrada = { campos: camposQueAvanzan(PUNTO, PUNTO, 0, 0, 30, 35), cobertura: coberturaTotal(LADO), lado: LADO, puntoX: PUNTO, puntoY: PUNTO, lat: LAT, zoom: ZOOM };
    expect(calcularNowcast(entrada).pronostico[0].pop).toBeGreaterThan(0.9);
    expect(calcularNowcast(entrada, opciones).pronostico[0].pop).toBeLessThan(0.05);
  });
});
