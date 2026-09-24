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
