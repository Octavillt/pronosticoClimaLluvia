const ALFABETO = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(lat: number, lon: number, precision = 5): string {
  let rangoLat: [number, number] = [-90, 90];
  let rangoLon: [number, number] = [-180, 180];
  let hash = '';
  let bit = 0;
  let indice = 0;
  let usaLon = true;

  while (hash.length < precision) {
    if (usaLon) {
      const medio = (rangoLon[0] + rangoLon[1]) / 2;
      if (lon >= medio) {
        indice = indice * 2 + 1;
        rangoLon = [medio, rangoLon[1]];
      } else {
        indice = indice * 2;
        rangoLon = [rangoLon[0], medio];
      }
    } else {
      const medio = (rangoLat[0] + rangoLat[1]) / 2;
      if (lat >= medio) {
        indice = indice * 2 + 1;
        rangoLat = [medio, rangoLat[1]];
      } else {
        indice = indice * 2;
        rangoLat = [rangoLat[0], medio];
      }
    }
    usaLon = !usaLon;
    bit += 1;
    if (bit === 5) {
      hash += ALFABETO[indice];
      bit = 0;
      indice = 0;
    }
  }
  return hash;
}

export function corridaModelo(fecha: Date = new Date()): string {
  const hora = Math.floor(fecha.getUTCHours() / 6) * 6;
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const d = String(fecha.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}${String(hora).padStart(2, '0')}`;
}
