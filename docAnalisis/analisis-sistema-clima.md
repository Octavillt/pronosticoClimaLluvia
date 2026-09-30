# Análisis: SistemaClima — probabilidad de lluvia calibrada

> Derivado de `docAnalisis/plan-sistema-clima.md` (aprobado el 2026-09-24). Fecha de redacción: 2026-09-24.

## 1. Meta

Una probabilidad no puede ser "exacta", pero sí **calibrada**: si dice 70%, que llueva 7 de cada 10 veces.

- **Definición canónica:** `PoP = P(≥ 0.2 mm en la hora, en el punto)`.
- **Medición:** Brier score y diagrama de confiabilidad.
- **Principio:** no se reenvía la PoP de una API ajena; **se calcula** a partir de miembros de ensamble.

## 2. Motor en el navegador (en capas)

1. **Ensamble (0–72 h):** Open-Meteo Ensemble, en **una sola llamada** con 5 modelos:
   - `ecmwf_ifs025` (51 miembros)
   - `ecmwf_aifs025` (51)
   - `ncep_gefs_seamless` (31)
   - `icon_global_eps` (40)
   - `gem_global_ensemble` (21)
   - ≈ 194 miembros en total.
   - PoP por modelo = `(miembros ≥ 0.2 mm + 0.5) / (N + 1)` (suavizado de Laplace).
   - Combinación ponderada por número de miembros.
   - Si falla la llamada conjunta, se reintenta modelo por modelo y se reporta `failedModels`.
2. **Nowcast con radar (0–2 h), solo con cobertura:** últimos frames de RainViewer (cada 10 min, zoom 7, 3×3 tiles alrededor del punto), decodificados a dBZ en canvas. El vector de movimiento sale de la correlación cruzada entre frames consecutivos. Advección: **PoP_radar = fracción de píxeles ≥ 20 dBZ** en un disco aguas arriba cuyo radio crece con el horizonte. La cobertura se detecta con los tiles `coverage`.
3. **Mezcla:** `PoP = w(t)·PoP_radar + (1−w(t))·PoP_ensamble`, con `w` bajando de ~0.9 a 0 entre 0 y 3 h. Pesos configurables. Sin cobertura, `w = 0`.
4. **Calibración local:** en IndexedDB se guardan la PoP emitida por horizonte y lo observado (pixel de radar en el punto o botón "¿Está lloviendo?"). Con ≥150 pares por horizonte se aplica regresión isotónica (PAV); con menos, la identidad.
5. **Datos complementarios:** Open-Meteo Forecast (`timezone=auto`) para temperatura, código de clima y mm por hora. Open-Meteo Geocoding (`countryCode=MX`) para búsqueda de ciudad.

## 3. Presupuesto de llamadas

Open-Meteo gratis permite 10k/día (uso no comercial). La llamada de ensamble es pesada y podría contar como varias. Aun así, la caché por **geohash-5 (~4.9 km) + corrida de modelo** (~4 refrescos/día por dispositivo) alcanza para decenas de dispositivos diarios. El peso real se mide en la Fase 1.

## 4. Costo

**$0:** Hostinger ya está pagado y las fuentes son gratuitas. Google Weather tiene 10k llamadas/mes gratis y luego $0.15 por cada 1,000; solo se activará si la Fase 5 demuestra una mejora de Brier medible. Otras fuentes de pago (Tomorrow.io, AccuWeather MinuteCast) no se justifican: sus llaves quedarían expuestas en un sitio estático y sus términos restringen mezclar datos.

## 5. Riesgos

- **RainViewer sin SLA** (anunció cierre en ene-2026, sigue activo): va detrás de un adapter con degradación suave.
- **Cobertura de radar parcial:** CDMX, GDL, MTY, Yucatán y parte del Golfo; no Oaxaca, Guerrero ni Chiapas.
- **Safari/iOS borra IndexedDB** tras ~7 días sin uso: se mitiga con export/import JSON del historial.
- **Calibración por dispositivo** junta pocos datos.
- **Geolocalización exige HTTPS** (Hostinger ya da SSL).
- **Versión de pnpm en Hostinger desconocida:** se valida en el deploy de la Fase 0.

## 6. Fuera de alcance (por ser estático)

Notificaciones push, ingesta del SMN, verificación compartida entre dispositivos y blend logístico por región. Todo necesita servidor y podría sumarse después con un Worker gratuito.

## 7. Fuentes verificadas (2026-09-24, con curl)

| Fuente | Estado | ¿Usable desde el navegador? |
|---|---|---|
| Open-Meteo Forecast + Ensemble | 200, `Access-Control-Allow-Origin: *`, sin llave | **Sí**: es el núcleo |
| RainViewer (radar) | Activo (13 frames pasados, nowcast = 0). Tiles con CORS `*` | **Sí**, el nowcast lo calculamos nosotros |
| Cobertura de radar en México | Parcial | Nowcast solo donde haya cobertura |
| SMN/CONAGUA `method=3` | 200, pero sin CORS y 7.5 MB comprimido | **No**: queda fuera |
| Google Weather API | CORS OK; exige llave (403 sin ella) | Sí, en la fase opcional |

## 8. Fase 2: nowcast con radar — hallazgos verificados (2026-09-29)

### 8.1 Paleta del radar: el esquema 0 en grises no existe

El plan pedía verificar al empezar si el esquema de color 0 (dBZ en grises) servía. **No sirve**: la API pública de RainViewer ignora el parámetro de color y sirve siempre la paleta "Universal Blue" (esquema 2). Los nueve esquemas devolvieron el mismo archivo (mismos bytes y mismo hash).

- Se decodifica con la tabla oficial (`rainviewer_api_colors_table.csv`, columna Universal Blue, bloque de lluvia), embebida en `src/nowcast/paleta.ts`.
- En un tile real de CDMX, todos los píxeles con eco (7,999) tenían un color de la tabla.
- 15–64 dBZ tienen un color único cada uno. 65–74 dBZ (blanco) y 75–95 dBZ (verde) son tramos de un solo color: se toma el dBZ más bajo del tramo, que ya supera cualquier umbral usado.
- Los ecos tenues (−10 a 14 dBZ) son semitransparentes y solo se distinguen por el alfa. Bajo el umbral de lluvia (20 dBZ) no importan.
- Si un color no está en la tabla (por ejemplo tras un remuestreo del navegador), se toma el más cercano.
- El E2E `@vivo` baja un tile real y falla si aparece un color fuera de la paleta, así que un cambio de RainViewer se detecta antes que en producción.

### 8.2 Cobertura

El tile `coverage` (`/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`) es transparente donde hay radar y negro donde no; los bordes son semitransparentes. Se verificó en 16 ciudades:

| Con cobertura | Sin cobertura |
|---|---|
| CDMX, Puebla, Querétaro, Guadalajara, Monterrey, Mérida, Chihuahua, Hermosillo, Culiacán, Tijuana, La Paz, Tuxtla Gutiérrez | Oaxaca, Acapulco, Veracruz, Cancún |

El servicio consulta primero el tile central de cobertura: si el punto no tiene radar termina con una sola petición.

### 8.3 Costo por consulta

- 36 peticiones: 9 tiles de cobertura y 27 de radar (3 frames × 3×3 tiles), en paralelo. Unos 26 KB de radar y ~1.4 s en la prueba.
- Los tiles llevan `cache-control: max-age=172800` y CORS `*`. Cada frame nuevo (cada 10 min) solo trae 9 tiles nuevos; el resto sale de la caché HTTP del navegador.
- La página consulta cada 5 min mientras está abierta.

### 8.4 Alineación horaria (corrige dos defectos de la Fase 1)

En Open-Meteo `precipitation` es la **suma de la hora anterior**: la etiqueta `T` cubre `(T − 1 h, T]`. La mezcla con el radar exige alinear bien las ventanas, y eso destapó dos errores de la Fase 1:

1. "Probabilidad ahora" tomaba la etiqueta de la hora en punto ya transcurrida (a las 21:36 mostraba la de 21:00, que cubre 20–21). Ahora usa la hora en curso (etiqueta 22:00) y muestra su intervalo ("de 21:00 a 22:00 h").
2. "Próximas horas" dibujaba desde el inicio de la serie (00:00 UTC del día), no desde ahora. Ahora arranca en la hora en curso, y cada barra se rotula con la hora en que empieza.

### 8.5 Algoritmo

1. **Frames y mosaico:** últimos 3 frames (cada 10 min), mosaico de 3×3 tiles a zoom 7 (~1.15 km/px en México) centrado en el punto. Se descartan si el último tiene más de 40 min.
2. **Movimiento:** correlación cruzada normalizada entre frames consecutivos, en una ventana de 256×256 px alrededor del punto y con búsqueda de ±14 px (≈100 km/h), con refinamiento subpíxel. Solo se recorren los píxeles con eco; las sumas de la ventana desplazada salen de imágenes integrales. Cada par aporta un vector ponderado por su correlación.
   - Sin ecos que seguir: se asume quieto sin penalizar (un cielo despejado en el radar también es información).
   - Con ecos pero correlación pobre (< 0.3) o pico en el borde de la búsqueda: se asume quieto y el peso del radar se reduce a la mitad.
3. **PoP del radar:** en pasos de 10 min hasta 180 min, fracción de píxeles ≥ 20 dBZ en un disco aguas arriba (el punto desplazado contra el movimiento). El radio crece de 3 km a 0.25 km por minuto de horizonte. Se suaviza como `(k + 0.5)/(n + 1)` para no llegar a 0 ni a 1.
4. **Cobertura por píxel:** un píxel sin cobertura, fuera del mosaico o de un tile que falló no cuenta como "seco": baja la cobertura del disco y, con ella, el peso del radar. Un tile de radar que falla nunca se interpreta como "sin lluvia".
5. **Hora:** en la hora con etiqueta `T` se toma el **máximo** de los pasos del radar que caen en `(T − 1 h, T]`, incluidos los frames ya observados en esa hora.
6. **Mezcla:** `PoP = w·PoP_radar + (1 − w)·PoP_ensamble`, con `w = 0.9·(1 − h/180 min)·cobertura·(0.5 si el movimiento es incierto)`. El horizonte `h` se mide desde el último frame hasta el punto medio del tramo de la hora que aún no ocurre. Las horas ya terminadas conservan el ensamble.

Todos los parámetros están en `src/config.ts`.

### 8.6 Validación con radar real y límites conocidos

Se corrió el pipeline completo con datos reales en 9 ciudades: la cobertura salió como se esperaba y cada consulta tardó entre 0.7 y 1.4 s.

Además se hizo un hindcast sobre las 2 h de frames disponibles: se estimó el movimiento con 3 frames, se avanzó el campo y se comparó con el frame real, con el índice CSI a 20 dBZ frente a persistencia (sin movimiento) y a un "oráculo" que conoce el desplazamiento real.

| Zona | Situación | Resultado |
|---|---|---|
| CDMX | sistema estratiforme grande y lento | La estimación iguala al oráculo y a la persistencia (CSI 0.589 vs 0.603 a 30 min): casi no hay traslación que capturar. |
| Monterrey | sistema que crece de ~3,200 a ~11,400 píxeles en 2 h | Ni siquiera el oráculo mejora la persistencia: el error dominante es crecimiento, no movimiento. |

Este hindcast **no demuestra mejora sobre la persistencia**: en las dos situaciones disponibles la traslación pesaba poco. Descarta un error grave en la estimación, pero la ganancia del movimiento solo se podrá medir cuando haya sistemas rápidos, y la ganancia general en la Fase 3 con el log de verificación.

Límites del método:
- Solo modela traslación: no prevé crecimiento, decaimiento ni nacimiento de celdas.
- Con celdas pequeñas y horizontes largos la PoP del radar baja, porque el disco de incertidumbre ya es mucho mayor que la celda. Es lo esperado, y por eso `w` cae con el horizonte.
- Los pesos y el umbral de 20 dBZ no están calibrados; la Fase 3 los ajustará con datos propios.

## 9. Fase 3: verificación y calibración local

### 9.1 Registro de pronósticos y observaciones

La aplicación conserva en IndexedDB las probabilidades emitidas y las observaciones de cada
ubicación, agrupadas por geohash-5. No necesita un servidor de verificación. El radar aporta una
observación automática por frame con cobertura en el píxel del punto: se considera lluvia cuando
la reflectividad es ≥20 dBZ. Se usa el píxel puntual, no la fracción de lluvia en el disco del
nowcast, porque se quiere contrastar lo observado en el lugar. Un frame sin cobertura no genera
una observación seca. El botón «¿Está lloviendo?» añade observaciones del usuario con el instante
actual; radar y usuario conservan fuentes e identificadores distintos y se deduplican por id.

Las etiquetas horarias mantienen la alineación de §8.4: `T` es el final del intervalo `(T − 1 h, T]`.
Una hora solo se da por resuelta cuando terminó y tiene al menos **3 ventanas distintas de 10 min**
observadas. Varias observaciones de una misma ventana cuentan una sola vez; si alguna vio lluvia,
esa ventana se considera mojada. Una hora resuelta tuvo lluvia si alguna de sus ventanas la vio.
Se exige el mismo número de ventanas para horas secas y mojadas: resolver una hora mojada con un
solo «sí», pero exigir varios «no» para la seca, inflaría artificialmente la frecuencia de lluvia.

Se registran las bandas de anticipación **0–1, 1–3, 3–6, 6–12, 12–24 y 24–72 h**, según el tiempo
que faltaba para el final de la hora al emitir la PoP. Por cada `(celda, fin de hora, horizonte)`
**la primera emisión gana**: las actualizaciones posteriores no reemplazan ese pronóstico.
El reloj reintenta el registro cuando una hora entra en otra banda; un conjunto de ids en memoria
evita escrituras repetidas cada minuto. Cada registro contiene la **PoP sin calibrar**, salida
de la mezcla, además de la PoP del ensamble solo y el peso del radar. Guardar la PoP calibrada
contaminaría el ajuste futuro con su propia salida.

### 9.2 Calibración y evaluación

Las horas resueltas se emparejan con sus predicciones por celda y fin de hora. Se ajusta una
regresión **isotónica por horizonte**, con PAV (pool adjacent violators) y al menos **150 pares**
en ese horizonte. Los valores de PoP repetidos se promedian antes de agrupar las violaciones de
monotonicidad; los bloques finales aportan puntos de la curva. Se interpola linealmente entre
puntos y se mantiene el valor del extremo fuera del rango observado. La salida se recorta a
**[0.01, 0.99]**, para no afirmar certeza absoluta. Sin modelo para una banda, la PoP se conserva.
El `n` del modelo equivale a horas verificadas de ese horizonte: una predicción por celda, hora y
banda. El ajuste se aplica a la probabilidad actual y a la serie mostrada; una leyenda discreta
indica las horas verificadas utilizadas para calibrar la hora en curso.

El **Panel de Exactitud** muestra observaciones, horas verificadas, horas insuficientes y pares;
una misma hora puede aportar pares a varias bandas. Evalúa las probabilidades emitidas sin
calibrar, no las corregidas retrospectivamente. El **Brier** es el error cuadrático medio entre
probabilidad y resultado observado (menor es mejor; 0 es perfecto). Se compara la mezcla con el
ensamble solo y con una climatología definida como la frecuencia de lluvia de la muestra local.
El **skill** es `1 − Brier_mezcla / Brier_climatología`: positivo mejora esa referencia, negativo
la empeora y cero no mejora; no es calculable si la muestra solo tiene resultados de un tipo.
Esta climatología no es una normal climática externa y se calcula con la misma muestra evaluada.

Para medir el **aporte del radar** pendiente en §8.6, se comparan el Brier de la mezcla y el del
ensamble en los mismos pares donde el peso del radar era >0.05. La tabla por horizonte indica
frecuencia, Brier y cuántos pares faltan para calibrar; el diagrama de confiabilidad enfrenta PoP
media con frecuencia observada por caja, con tabla equivalente accesible. Las muestras de menos
de 30 pares, tanto globales como del radar, se presentan como aún no concluyentes. **La magnitud
de la mejora real y del aporte del radar sigue pendiente de medición**; los historiales sintéticos
de las pruebas solo verifican el funcionamiento, no demuestran ganancia meteorológica.

### 9.3 Conservación y portabilidad

Se conservan **90 días**: al abrir la app se purgan predicciones por fin de hora y observaciones
por instante. Exportar descarga `sistemaclima-verificacion-AAAA-MM-DD.json`, con formato y versión
explícitos, fecha de exportación, predicciones y observaciones. Importar valida el archivo completo
antes de escribir, incluidos tipos, números finitos, probabilidades, horizontes, fuentes y un
tope de 200 000 registros; mezcla sin sobrescribir las primeras emisiones y une observaciones
por id. Un archivo inválido muestra el motivo y no cambia el historial. El borrado requiere dos
pasos dentro de la página, con opción de cancelar.

Exportar periódicamente permite respaldar y trasladar datos entre navegadores: **Safari/iOS
puede eliminar IndexedDB tras unos 7 días sin uso**, y otros navegadores también pueden expulsar
datos por cuota. El historial es local al dispositivo y navegador, sin sincronización automática.
Si IndexedDB falla, se desactivan el registro y la calibración local; el pronóstico sigue
disponible consultando los proveedores sin depender de la caché.

### 9.4 Límites conocidos

- **Proxy ≠ precipitación ≥0.2 mm/h:** el píxel con ≥20 dBZ o el toque del usuario indican lluvia
  en un instante, no una acumulación horaria medida por pluviómetro.
- **Tres ventanas no cubren la hora completa.** Cada consulta de radar incorpora los últimos
  tres frames (unos 30 min de historia). Una hora puede darse por seca antes de observar lluvia
  posterior de esa misma hora; por ello la frecuencia observada tiende a subestimar la lluvia
  real. La magnitud de ese sesgo no está cuantificada.
- La muestra favorece las horas y lugares con radar utilizable y las sesiones en que se abre
  la app. Sin cobertura no hay observación automática; los reportes voluntarios del usuario
  también pueden introducir sesgo de selección.
- Los datos y modelos pertenecen a cada dispositivo/navegador. Importar amplía esa muestra,
  pero no elimina sus sesgos ni verifica externamente las observaciones.
- Al inicio hay poca muestra; una banda con menos de 150 pares no se calibra. Alcanzar ese
  mínimo permite ajustar la curva, pero no demuestra por sí solo mejora fuera de la muestra.
- La isotónica corrige la confiabilidad observada, no los límites físicos del nowcast de §8.6
  ni el crecimiento, decaimiento o nacimiento de tormentas.
