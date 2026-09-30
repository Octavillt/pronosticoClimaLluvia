import { config } from '../config';
import type { GeoPoint, IndiceRadar, ResultadoNowcast, TileRgba } from '../domain/types';
import { calcularNowcast } from '../nowcast/nowcastPop';
import {
  decodificarCobertura,
  decodificarTile,
  ensamblarMosaico,
  SIN_ECO,
} from '../nowcast/radarDecode';
import { disposicionMosaico, LADO_TILE, type TileMosaico } from '../nowcast/tiles';
import {
  cargarTile,
  fetchIndiceRadar,
  urlTileCobertura,
  urlTileRadar,
} from '../providers/rainviewer';

export interface DependenciasNowcast {
  obtenerIndice: () => Promise<IndiceRadar>;
  cargarTile: (url: string) => Promise<TileRgba>;
}

const DEPENDENCIAS: DependenciasNowcast = { obtenerIndice: fetchIndiceRadar, cargarTile };

/** Un tile que falla no es "sin lluvia": se devuelve `null` y esa zona pierde cobertura. */
async function intentar<T>(operacion: () => Promise<T>): Promise<T | null> {
  try {
    return await operacion();
  } catch {
    return null;
  }
}

export async function obtenerNowcast(
  punto: GeoPoint,
  ahoraMs: number = Date.now(),
  deps: DependenciasNowcast = DEPENDENCIAS,
): Promise<ResultadoNowcast> {
  const { zoom, framesAnalisis, edadMaximaFrameMin } = config.radar;

  const indice = await deps.obtenerIndice();
  const frames = indice.frames.slice(-framesAnalisis);
  if (frames.length < 2) {
    return { tipo: 'sin-datos', motivo: 'RainViewer no devolvió al menos 2 frames' };
  }
  const edadMin = (ahoraMs - frames[frames.length - 1].tiempoS * 1000) / 60_000;
  if (edadMin > edadMaximaFrameMin) {
    return { tipo: 'desactualizado', edadMin };
  }

  const mosaico = disposicionMosaico(punto, zoom);
  const { central } = mosaico;

  // El tile central de cobertura decide primero, para no bajar todo si el punto no tiene radar.
  const coberturaCentral = decodificarCobertura(
    await deps.cargarTile(urlTileCobertura(indice.host, zoom, central.tx, central.ty)),
  );
  const localX = Math.floor(mosaico.puntoX - central.columna * LADO_TILE);
  const localY = Math.floor(mosaico.puntoY - central.fila * LADO_TILE);
  if (coberturaCentral[localY * LADO_TILE + localX] === 0) {
    return { tipo: 'sin-cobertura' };
  }

  const pedir = <T>(tile: TileMosaico, url: string, decodificar: (t: TileRgba) => T) =>
    tile.valido ? intentar(async () => decodificar(await deps.cargarTile(url))) : Promise.resolve(null);

  const [coberturaTiles, porFrame] = await Promise.all([
    Promise.all(
      mosaico.tiles.map((tile) =>
        tile === central
          ? Promise.resolve(coberturaCentral)
          : pedir(tile, urlTileCobertura(indice.host, zoom, tile.tx, tile.ty), decodificarCobertura),
      ),
    ),
    Promise.all(
      frames.map(async (frame) => ({
        frame,
        tiles: await Promise.all(
          mosaico.tiles.map((tile) =>
            pedir(tile, urlTileRadar(indice.host, frame.ruta, zoom, tile.tx, tile.ty), decodificarTile),
          ),
        ),
      })),
    ),
  ]);

  // Sin el tile central de un frame no se puede usar; los demás huecos solo restan cobertura.
  const usables = porFrame.filter((f) => f.tiles[4] !== null);
  if (usables.length < 2) {
    return { tipo: 'sin-datos', motivo: 'No se pudieron descargar los tiles de radar' };
  }
  const coberturaFinal = ensamblarMosaico(
    coberturaTiles.map((tile, i) => (usables.some((f) => f.tiles[i] === null) ? null : tile)),
    LADO_TILE,
    (n) => new Uint8Array(n),
    0,
  );

  const nowcast = calcularNowcast({
    campos: usables.map((f) => ({
      tMs: f.frame.tiempoS * 1000,
      dbz: ensamblarMosaico(f.tiles, LADO_TILE, (n) => new Float32Array(n), SIN_ECO),
    })),
    cobertura: coberturaFinal,
    lado: mosaico.lado,
    puntoX: mosaico.puntoX,
    puntoY: mosaico.puntoY,
    lat: punto.lat,
    zoom,
  });

  return { tipo: 'ok', nowcast, indice };
}
