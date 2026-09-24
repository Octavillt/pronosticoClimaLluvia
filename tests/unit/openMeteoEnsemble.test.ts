import { describe, expect, test } from 'vitest';
import { parseEnsembleResponse } from '../../src/providers/openMeteoEnsemble';
import { ensambleFixture, horasUtcPrueba } from '../helpers/ensamble';

describe('parseEnsembleResponse', () => {
  test('parsea los 5 modelos con control y miembros', () => {
    const fixture = ensambleFixture();
    const resultado = parseEnsembleResponse(fixture, [
      'ecmwf_ifs025',
      'ecmwf_aifs025',
      'ncep_gefs_seamless',
      'icon_global_eps',
      'gem_global_ensemble',
    ]);
    expect(resultado.porModelo).toHaveLength(5);
    expect(resultado.modelosFallidos).toEqual([]);
    const ecmwf = resultado.porModelo.find((m) => m.modelo === 'ecmwf_ifs025');
    expect(ecmwf?.miembros).toHaveLength(51);
    const gem = resultado.porModelo.find((m) => m.modelo === 'gem_global_ensemble');
    expect(gem?.miembros).toHaveLength(21);
    const total = resultado.porModelo.reduce((acc, m) => acc + m.miembros.length, 0);
    expect(total).toBe(194);
  });

  test('marca como fallido un modelo sin miembros', () => {
    const fixture = ensambleFixture({ modelos: ['ecmwf_ifs025'] });
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025', 'gem_global_ensemble']);
    expect(resultado.porModelo).toHaveLength(1);
    expect(resultado.modelosFallidos).toEqual(['gem_global_ensemble']);
  });

  test('agrega Z a las horas para tratarlas como UTC', () => {
    const fixture = ensambleFixture({ numHoras: 2 });
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025']);
    expect(resultado.horasUtc).toEqual(horasUtcPrueba(2).map((h) => `${h}Z`));
  });

  test('lanza error con payload inválido', () => {
    expect(() => parseEnsembleResponse(null, ['ecmwf_ifs025'])).toThrow();
    expect(() => parseEnsembleResponse({}, ['ecmwf_ifs025'])).toThrow();
    expect(() => parseEnsembleResponse({ hourly: { time: [] } }, ['ecmwf_ifs025'])).toThrow();
    expect(() =>
      parseEnsembleResponse(
        { hourly: { time: ['2026-09-24T00:00'], precipitation_otro: [1] } },
        ['ecmwf_ifs025'],
      ),
    ).toThrow();
  });

  test('convierte nulls de precipitación en 0', () => {
    const fixture = ensambleFixture({ modelos: ['ecmwf_ifs025'], numHoras: 2 });
    (fixture.hourly as Record<string, unknown>).precipitation_ecmwf_ifs025 = [null, null];
    const resultado = parseEnsembleResponse(fixture, ['ecmwf_ifs025']);
    expect(resultado.porModelo[0].miembros[0]).toEqual([0, 0]);
  });
});
