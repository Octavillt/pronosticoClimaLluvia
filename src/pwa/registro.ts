// Registro del service worker, aviso de actualización y chequeos de nueva versión.
// Sin service worker (o si falla el registro) la app funciona exactamente igual.

export const RUTA_SW = './sw.js';
export const CHEQUEO_PERIODICO_MS = 60 * 60_000;
export const MIN_CHEQUEO_MS = 5 * 60_000;

export interface RegistroOpciones {
  scope: string;
  updateViaCache: 'none' | 'imports' | 'all';
}

export interface TrabajadorEspera {
  readonly state?: string;
  postMessage(mensaje: unknown): void;
  addEventListener(tipo: 'statechange', alDisparar: () => void): void;
}

export interface RegistroSw {
  update?: () => unknown;
  waiting: TrabajadorEspera | null;
  installing: TrabajadorEspera | null;
  addEventListener(tipo: 'updatefound', alDisparar: () => void): void;
}

export interface DependenciasRegistro {
  produccion: boolean;
  conServiceWorker: boolean;
  alLoad: (accion: () => void) => void;
  registrar: (ruta: string, opciones: RegistroOpciones) => Promise<RegistroSw>;
  controlador: () => unknown;
  alControllerChange: (accion: () => void) => void;
  alVisibilidad: (accion: () => void) => void;
  intervalo: (accion: () => void, ms: number) => void;
  ahora: () => number;
  recargar: () => void;
}

export interface ControladorPwa {
  hayActualizacion(): boolean;
  suscribirse(oyente: (hay: boolean) => void): () => void;
  activar(): void;
}

export function ejecutarAlCargar(accion: () => void, doc = document, ventana = window): void {
  if (doc.readyState === 'complete') {
    accion();
    return;
  }
  ventana.addEventListener('load', accion, { once: true });
}

const DEPENDENCIAS: DependenciasRegistro = {
  produccion: import.meta.env.PROD,
  conServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  alLoad: ejecutarAlCargar,
  registrar: (ruta, opciones) =>
    navigator.serviceWorker.register(ruta, opciones) as Promise<RegistroSw>,
  controlador: () => navigator.serviceWorker.controller,
  alControllerChange: (accion) =>
    navigator.serviceWorker.addEventListener('controllerchange', accion),
  alVisibilidad: (accion) =>
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') accion();
    }),
  intervalo: (accion, ms) => {
    setInterval(accion, ms);
  },
  ahora: () => Date.now(),
  recargar: () => window.location.reload(),
};

export function registrarServiceWorker(deps: DependenciasRegistro = DEPENDENCIAS): ControladorPwa {
  const oyentes = new Set<(hay: boolean) => void>();
  let esperando: TrabajadorEspera | null = null;
  let hayAviso = false;
  let recargoHecho = false;

  const notificar = (hay: boolean) => {
    hayAviso = hay;
    for (const oyente of oyentes) oyente(hay);
  };

  // Un trabajador en espera solo se anuncia si la página ya estaba controlada:
  // si no, es la primera instalación y el cambio de control es inminente sin aviso.
  const vigilar = (registro: RegistroSw) => {
    const avisarSiCorresponde = (trabajador: TrabajadorEspera | null) => {
      if (trabajador && deps.controlador()) {
        esperando = trabajador;
        notificar(true);
      }
    };
    avisarSiCorresponde(registro.waiting);
    registro.addEventListener('updatefound', () => {
      const instalando = registro.installing;
      if (!instalando) return;
      instalando.addEventListener('statechange', () => {
        if (instalando.state === 'installed') avisarSiCorresponde(instalando);
      });
    });
  };

  const controlador: ControladorPwa = {
    hayActualizacion: () => hayAviso,
    suscribirse: (oyente) => {
      oyentes.add(oyente);
      oyente(hayAviso);
      return () => oyentes.delete(oyente);
    },
    activar: () => {
      if (!esperando) return;
      esperando.postMessage({ type: 'SKIP_WAITING' });
      // El listener se registra solo aquí: el controllerchange de la primera
      // instalación (clients.claim del activate) no debe recargar la página.
      deps.alControllerChange(() => {
        if (recargoHecho) return;
        recargoHecho = true;
        deps.recargar();
      });
    },
  };

  if (!deps.produccion || !deps.conServiceWorker) {
    return controlador;
  }

  deps.alLoad(() => {
    deps
      .registrar(RUTA_SW, { scope: './', updateViaCache: 'none' })
      .then((registro) => {
        vigilar(registro);
        let ultimoChequeo = Number.NEGATIVE_INFINITY;
        const chequear = () => {
          const ahora = deps.ahora();
          // Visibilidad e intervalo pueden coincidir: se respeta un mínimo entre chequeos.
          if (ahora - ultimoChequeo < MIN_CHEQUEO_MS) return;
          ultimoChequeo = ahora;
          void Promise.resolve(registro.update?.()).catch(() => {});
        };
        deps.intervalo(chequear, CHEQUEO_PERIODICO_MS);
        deps.alVisibilidad(chequear);
      })
      .catch(() => {
        // Fallo de registro: se degrada en silencio.
      });
  });

  return controlador;
}
