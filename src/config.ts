export const config = {
  appName: 'SistemaClima',
  urls: {
    ensemble: 'https://ensemble-api.open-meteo.com/v1/ensemble',
    forecast: 'https://api.open-meteo.com/v1/forecast',
    geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
    rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
    mapaBase: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
  radar: {
    /** Zoom máximo que sirve RainViewer; con 256 px cada píxel mide ~1.15 km en México. */
    zoom: 7,
    tamanoTile: 256,
    /** Reflectividad mínima (dBZ) para contar un píxel como lluvia. */
    umbralDbz: 20,
    /** Frames (cada 10 min) que se descargan; los 2 últimos sirven para el movimiento. */
    framesAnalisis: 3,
    /** Con un frame más viejo que esto el radar se descarta. */
    edadMaximaFrameMin: 40,
    pasoMin: 10,
    horizonteMin: 180,
    /** Radio del disco de incertidumbre: base + crecimiento × horizonte. */
    radioBaseKm: 3,
    crecimientoRadioKmPorMin: 0.25,
    /** Cobertura mínima del disco para que un paso cuente en el máximo de la hora. */
    coberturaMinimaPaso: 0.5,
    movimiento: {
      /** Semilado (px) de la región donde se correlaciona: 128 → ventana de 256×256. */
      mitadRegion: 128,
      /** Desplazamiento máximo buscado entre frames, en px (≈ 100 km/h). */
      radioBusqueda: 14,
      correlacionMinima: 0.3,
      /** Píxeles con eco mínimos en la región para intentar estimar movimiento. */
      ecosMinimos: 150,
      /** Debajo de este dBZ el píxel no participa en la correlación. */
      umbralEcoDbz: 10,
    },
  },
  mezcla: {
    /** Peso del radar a horizonte 0; baja linealmente hasta 0 en `radar.horizonteMin`. */
    pesoRadarInicial: 0.9,
    /** Multiplicador del peso cuando hay ecos pero el movimiento no se pudo estimar. */
    factorMovimientoIncierto: 0.5,
  },
  verificacion: {
    /** Minutos de una ventana de observación: un frame de radar y un toque del botón en la misma ventana cuentan una vez. */
    ventanaMin: 10,
    /** Ventanas observadas que hacen falta en una hora para darla por resuelta, llueva o no. */
    ventanasMinimasPorHora: 3,
    /** Cotas superiores (horas de anticipación) de los horizontes en que se agrupa la PoP. */
    horizontesH: [1, 3, 6, 12, 24, 72],
    /** Pares verificados que hacen falta en un horizonte para calibrarlo. */
    paresMinimosCalibracion: 150,
    /** La isotónica nunca devuelve una certeza: se recorta a este rango. */
    popMinima: 0.01,
    popMaxima: 0.99,
    /** Cajas del diagrama de confiabilidad. */
    binsConfiabilidad: 10,
    /** Peso del radar desde el cual un par cuenta como "con radar" al medir su aporte. */
    pesoRadarSignificativo: 0.05,
    /** Días que se conservan predicciones y observaciones; lo más viejo se purga al abrir la app. */
    retencionDias: 90,
  },
  ui: {
    /** Porcentaje mostrado a partir del cual la lluvia se considera alta, media o baja. */
    umbralesPorcentaje: { alta: 60, media: 30, baja: 10 },
    /** Peso del radar a partir del cual se dice que interviene en la PoP mostrada. */
    pesoRadarVisible: 0.05,
    /** Horas que cubre la tira de píldoras de próximas horas de la pantalla principal. */
    horasPildoras: 24,
    /** Ventana de horas que examina la frase que busca lluvia en lo que viene. */
    horasBusquedaFrase: 24,
    /** Horas seguidas bajo el umbral bajo (10 %) exigidas para afirmar
     * que la lluvia "baja a menos de 10 %". */
    horasSostenidasParaBajar: 2,
  },
  googleWeatherKey: import.meta.env.VITE_GOOGLE_WEATHER_KEY ?? '',
} as const;
