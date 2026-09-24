import { describe, expect, test } from 'vitest';
import { isInMexico } from '../../src/domain/mexico';

describe('isInMexico', () => {
  test.each([
    ['CDMX', 19.43, -99.13],
    ['Guadalajara', 20.67, -103.35],
    ['Monterrey', 25.69, -100.32],
    ['Mérida', 20.97, -89.62],
    ['Cancún', 21.16, -86.87],
    ['Tijuana', 32.5, -117.02],
    ['Tapachula', 14.91, -92.26],
    ['Oaxaca', 17.07, -96.72],
  ])('%s está dentro', (_nombre, lat, lon) => {
    expect(isInMexico({ lat, lon })).toBe(true);
  });

  test.each([
    ['Madrid', 40.42, -3.7],
    ['El Paso', 31.76, -106.48],
    ['Ciudad de Guatemala', 14.6, -90.5],
    ['Bogotá', 4.71, -74.07],
    ['océano Pacífico', 10.0, -120.0],
  ])('%s está fuera', (_nombre, lat, lon) => {
    expect(isInMexico({ lat, lon })).toBe(false);
  });
});
