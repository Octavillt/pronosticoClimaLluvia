import { describe, expect, test, vi } from 'vitest';
import {
  CHEQUEO_PERIODICO_MS,
  ejecutarAlCargar,
  MIN_CHEQUEO_MS,
  registrarServiceWorker,
  type DependenciasRegistro,
  type RegistroSw,
  type TrabajadorEspera,
} from '../../src/pwa/registro';

type TrabajadorPrueba = TrabajadorEspera & {
  mensajes: unknown[];
  dispararStateChange: () => void;
};

function crearTrabajador(): TrabajadorPrueba {
  const oyentes = new Set<() => void>();
  const mensajes: unknown[] = [];
  return {
    state: 'installed',
    mensajes,
    postMessage: (mensaje: unknown) => mensajes.push(mensaje),
    addEventListener: (_tipo, alDisparar) => oyentes.add(alDisparar),
    dispararStateChange: () => oyentes.forEach((cb) => cb()),
  };
}

type RegistroPrueba = RegistroSw & {
  update: ReturnType<typeof vi.fn>;
  dispararUpdateFound: (trabajador: TrabajadorPrueba) => void;
};

function crearRegistro(esperando: TrabajadorEspera | null = null): RegistroPrueba {
  const oyentes = new Set<() => void>();
  const registro: RegistroPrueba = {
    update: vi.fn<() => unknown>(),
    waiting: esperando,
    installing: null,
    addEventListener: (tipo, alDisparar) => {
      if (tipo === 'updatefound') oyentes.add(alDisparar);
    },
    dispararUpdateFound: (trabajador) => {
      registro.installing = trabajador;
      oyentes.forEach((cb) => cb());
    },
  };
  return registro;
}

function crearDeps(sobre: Partial<DependenciasRegistro> = {}) {
  let load: (() => void) | null = null;
  let visibilidad: (() => void) | null = null;
  let controllerChange: (() => void) | null = null;
  let hora = 0;
  const deps: DependenciasRegistro & {
    dispararLoad: () => void;
    dispararVisibilidad: () => void;
    dispararControllerChange: () => void;
    fijarHora: (ms: number) => void;
  } = {
    produccion: true,
    conServiceWorker: true,
    alLoad: (accion) => (load = accion),
    registrar: vi.fn(async () => crearRegistro()),
    controlador: () => null,
    alControllerChange: (accion) => (controllerChange = accion),
    alVisibilidad: (accion) => (visibilidad = accion),
    intervalo: vi.fn(),
    ahora: () => hora,
    recargar: vi.fn(),
    dispararLoad: () => load?.(),
    dispararVisibilidad: () => visibilidad?.(),
    dispararControllerChange: () => controllerChange?.(),
    fijarHora: (ms) => (hora = ms),
    ...sobre,
  };
  return deps;
}

const alFluir = () => new Promise((resuelta) => setTimeout(resuelta, 0));

describe('ejecutar al cargar la página', () => {
  test('con readyState complete ejecuta inmediatamente y no repite al recibir load', () => {
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const accion = vi.fn();

    ejecutarAlCargar(accion, doc, window);
    expect(accion).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('load'));
    expect(accion).toHaveBeenCalledOnce();
  });

  test('con readyState loading espera a load y ejecuta una sola vez', () => {
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'readyState', { value: 'loading' });
    const accion = vi.fn();

    ejecutarAlCargar(accion, doc, window);
    expect(accion).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(accion).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('load'));
    expect(accion).toHaveBeenCalledOnce();
  });
});

describe('registro del service worker', () => {
  test('no registra fuera de producción ni sin soporte', async () => {
    for (const sobre of [{ produccion: false }, { conServiceWorker: false }]) {
      const deps = crearDeps(sobre);
      registrarServiceWorker(deps);
      deps.dispararLoad();
      await alFluir();
      expect(deps.registrar).not.toHaveBeenCalled();
    }
  });

  test('registra tras load con la ruta y las opciones pedidas', async () => {
    const deps = crearDeps();
    registrarServiceWorker(deps);
    expect(deps.registrar).not.toHaveBeenCalled();
    deps.dispararLoad();
    await alFluir();
    expect(deps.registrar).toHaveBeenCalledWith('./sw.js', {
      scope: './',
      updateViaCache: 'none',
    });
  });

  test('la primera instalación no muestra aviso', async () => {
    const deps = crearDeps();
    const controlador = registrarServiceWorker(deps);
    const oyente = vi.fn();
    controlador.suscribirse(oyente);

    deps.dispararLoad();
    await alFluir();
    const registro = (deps.registrar as ReturnType<typeof vi.fn>).mock.results[0]
      .value as Promise<RegistroPrueba>;
    const registroResuelto = await registro;

    const trabajador = crearTrabajador();
    registroResuelto.dispararUpdateFound(trabajador);
    trabajador.dispararStateChange();

    expect(controlador.hayActualizacion()).toBe(false);
    expect(oyente).toHaveBeenCalledWith(false);
  });

  test('un waiting existente con página controlada activa el aviso', async () => {
    const esperando = crearTrabajador();
    const deps = crearDeps({ registrar: vi.fn(async () => crearRegistro(esperando)) });
    deps.controlador = () => ({});
    const controlador = registrarServiceWorker(deps);
    const oyente = vi.fn();
    controlador.suscribirse(oyente);

    deps.dispararLoad();
    await alFluir();

    expect(controlador.hayActualizacion()).toBe(true);
    expect(oyente).toHaveBeenCalledWith(true);
  });

  test('updatefound → installed con página controlada activa el aviso', async () => {
    const deps = crearDeps();
    deps.controlador = () => ({});
    const controlador = registrarServiceWorker(deps);

    deps.dispararLoad();
    await alFluir();
    const registro = await (deps.registrar as ReturnType<typeof vi.fn>).mock.results[0].value;
    const trabajador = crearTrabajador();
    registro.dispararUpdateFound(trabajador);
    trabajador.dispararStateChange();

    expect(controlador.hayActualizacion()).toBe(true);
  });

  test('activar manda SKIP_WAITING y recarga una sola vez aunque haya dos controllerchange', async () => {
    const esperando = crearTrabajador();
    const deps = crearDeps({ registrar: vi.fn(async () => crearRegistro(esperando)) });
    deps.controlador = () => ({});
    const controlador = registrarServiceWorker(deps);

    deps.dispararLoad();
    await alFluir();
    controlador.activar();

    expect(esperando.mensajes).toEqual([{ type: 'SKIP_WAITING' }]);
    deps.dispararControllerChange();
    deps.dispararControllerChange();
    expect(deps.recargar).toHaveBeenCalledOnce();
  });

  test('la primera instalación con controllerchange no recarga la página', async () => {
    const deps = crearDeps();
    registrarServiceWorker(deps);
    deps.dispararLoad();
    await alFluir();

    deps.dispararControllerChange();
    expect(deps.recargar).not.toHaveBeenCalled();
  });

  test('los chequeos respetan el mínimo de 5 minutos', async () => {
    const deps = crearDeps();
    registrarServiceWorker(deps);
    deps.dispararLoad();
    await alFluir();
    const registro = await (deps.registrar as ReturnType<typeof vi.fn>).mock.results[0].value;

    expect(deps.intervalo).toHaveBeenCalledWith(expect.any(Function), CHEQUEO_PERIODICO_MS);
    const periodico = (deps.intervalo as ReturnType<typeof vi.fn>).mock.calls[0][0] as () => void;

    deps.fijarHora(0);
    periodico();
    deps.dispararVisibilidad();
    expect(registro.update).toHaveBeenCalledOnce();

    deps.fijarHora(MIN_CHEQUEO_MS / 2);
    deps.dispararVisibilidad();
    expect(registro.update).toHaveBeenCalledOnce();

    deps.fijarHora(MIN_CHEQUEO_MS + 1);
    deps.dispararVisibilidad();
    expect(registro.update).toHaveBeenCalledTimes(2);
  });

  test('un fallo de register se degrada sin lanzar', async () => {
    const deps = crearDeps({ registrar: vi.fn(async () => Promise.reject(new Error('404'))) });
    registrarServiceWorker(deps);
    deps.dispararLoad();
    await alFluir();
    await alFluir();
    expect(deps.registrar).toHaveBeenCalledOnce();
  });
});
