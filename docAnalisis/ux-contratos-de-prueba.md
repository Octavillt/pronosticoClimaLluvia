# Contratos de prueba de la interfaz (Fase 5: UX/UI)

> Lista de lo que las pruebas existentes esperan de la interfaz. El rediseño puede cambiar el aspecto, pero **no** estos contratos, salvo los cambios deliberados de la última sección. Si una prueba falla por algo que no está en esa sección, es una regresión: se corrige el código, no la prueba.
>
> Se obtuvo leyendo `tests/` y `e2e/` el 2026-09-30 y se actualizó al cerrar la entrega B (2026-10-01). Si una prueba nueva añade un contrato, se agrega aquí en la misma tarea.

## 1. Testids y atributos

| Contrato | Dónde se verifica | Detalle |
|---|---|---|
| `data-testid="pop-ahora"` | 8 archivos (App, AppRadar, AppVerificacion, pwaUi, y los E2E pronostico, verificacion, pwa y radar) | `textContent` exacto `"72%"` o `"1%"`: sin espacio, sin unidades extra. Hay `toBe`, `toHaveText` y `parseInt`. Si el número y el `%` van en `<span>` distintos, el contenedor con el testid debe envolverlos a ambos sin texto adicional. |
| `data-testid="origen-pop"` | AppRadar, radar.spec | Su texto debe contener `/radar/i` (con radar) o `/ensamble/`. Textos actuales: "Combina el radar con el ensamble de modelos." y "Basada en el ensamble de modelos.". |
| `data-testid="aviso-calibracion"` | AppVerificacion, verificacion.spec | Texto exacto `Calibrada con tu historial local (150 horas verificadas)`. Debe aparecer **una sola vez** en pantalla (`getByText`). |
| `data-testid="exactitud-observaciones"`, `exactitud-horas`, `exactitud-insuficientes`, `exactitud-pares` | PanelExactitud, AppVerificacion, verificacion.spec | Contienen solo el número (`'0'`, `'30'`, `'150'`). |
| `data-testid="mapa-radar"` | AppRadar (en su propio mock), pwa.spec, radar.spec | En `radar.spec` debe tener la clase `leaflet-container`: el testid va en el **mismo `div`** que recibe Leaflet. |
| `data-testid="hora-fotograma"` | MapaRadar.test, radar.spec | `textContent` exacto `"21:26 h"`. |
| `data-testid="barra-pop-${i}"` y `data-radar="si"/"no"` | AppRadar, radar.spec | `i` es relativo a la primera hora mostrada. `data-radar` es `si` cuando el peso del radar es mayor que 0.05. |
| Hijo `<title>` dentro de cada `barra-pop-*` | radar.spec:146 | `[data-testid^="barra-pop-"] title` con `/(\d+) %/` (espacio normal antes de `%`) y, en AppRadar, `textContent` con `/21:00 a 22:00 h/`. |

## 2. Consultas únicas y estrictas

Estas consultas fallan si hay **más de un** elemento que coincida (modo estricto de Playwright o `getBy*` de Testing Library):

- `getByRole('status')`: en BotonLluvia.test, `verificacion.spec` y pwaUi. No puede haber otro `role="status"` visible mientras se hace una importación de historial.
- `getByRole('alert')`: en App.test y `pronostico.spec`.
- `getByText('Guadalajara', { exact: true })`: el nombre de un lugar buscado debe aparecer como texto exacto **una sola vez**.
- `getByText(/Tu ubicación/)`: una sola vez.
- `getByRole('list').filter({ hasText: 'Ensamble Open-Meteo' })` (`pronostico.spec:46`): debe existir una lista (`ul`/`ol`) con esas líneas y no puede anidarse en otra lista.
- `getByLabelText('Probabilidad de lluvia actual')` y `getByLabelText('Estado de fuentes')` (AppRadar): una sola sección con cada etiqueta.

## 3. Textos literales

- **Encabezados:** `SistemaClima` (siempre presente, incluso mientras carga o en error), `Busca tu ciudad`, `¿Está lloviendo?` y `¿Está lloviendo en {lugar}?` (con `textContent` exacto).
- **Botones:** `Sí, está lloviendo`, `No está lloviendo`, `Usar mi ubicación`, `Buscar`, `Reintentar`, `Actualizar`, `Animar`, `Pausar` (con `aria-pressed`), `Exportar historial`, `Borrar historial`, `Confirmar borrado`, `Cancelar`.
- **Etiquetas:** `Nombre de la ciudad`, `Importar historial` (un `<label>` asociado a un `input[type=file]` real), `Fotograma del radar`, `Probabilidad de lluvia actual`, `Estado de fuentes`.
- **Mensajes:** `Gracias, registrado.`; el mensaje completo de "No se registró: …"; `Historial exportado.`; `Historial borrado.`; `Se agregaron N predicciones y M observaciones.`; los avisos PWA `Hay una versión nueva de SistemaClima.` y `Sin conexión. Puede que el pronóstico no esté actualizado.`
- **Aviso de lugar:** en una ciudad buscada, `Reporta solo lo que ves donde estás: estos reportes calibran el pronóstico de este lugar.` (y en la ubicación geolocalizada **no** debe aparecer esa frase).
- **Fuentes** (cada línea en **un solo** elemento de texto, sin envolver la etiqueta aparte): `Ensamble Open-Meteo: ✓`, `Radar RainViewer: ✓ (imagen de las 21:26 h; la lluvia avanza a 35 km/h hacia el este)`, `Radar RainViewer: consultando…`, `Radar RainViewer: sin cobertura en esta zona (solo ensamble)`, `… hace 55 min y se ignora …`, `Radar RainViewer: no disponible (solo ensamble)`, `Caché: consultado` / `Caché: reutilizado`.
- **Radar:** `(más reciente)` visible solo en el último fotograma.
- **Panel de exactitud:** los textos completos que verifican PanelExactitud.test y `verificacion.spec` (por ejemplo `Calibrado`, `Faltan 140 pares`, `La muestra es pequeña`, los `<caption>` `Resultados por horizonte` y `Datos de confiabilidad`).

Los textos **nuevos** de la fase 5 (mensaje principal, frase, chip de radar, aprendizaje) **no pueden contener** ninguna de estas cadenas: `Tu ubicación`, `Calibrada con tu historial local (`, `sin cobertura en esta zona`, `Radar RainViewer:`, `Caché:`, `hacia el este`, ni el nombre exacto de un lugar buscado.

## 4. Estructura y comportamiento

- `AppRadar.test.tsx` mockea el módulo `../../src/ui/MapaRadar` (ruta y `export default`): no mover ni renombrar ese archivo ni su export.
- `MapaRadar` devuelve `null` sin fotogramas y no puede renderizar ningún `<section>` en ese caso.
- Las tablas del panel de exactitud son `<table>` con `<caption>`; la celda `Calibrado` debe ser única con ese nombre exacto; el diagrama de confiabilidad conserva `circle` con un `<title>` hijo.
- `smoke.spec.ts` exige **cero** `console.error` y `pageerror`: ninguna fuente, imagen o CSS puede dar 404.
- `verificacion.spec.ts` comprueba `scrollWidth <= innerWidth` a 320 px de ancho.
- `pwa.spec.ts` compara el contenido del caché del service worker con la lista `PRECACHE` de `sw.js`: todo archivo nuevo (fuentes, CSS) entra solo si sale del build.
- Ningún test fija niveles de encabezado ni usa capturas o snapshots.
- `getByRole('img', …)`, `getByRole('table', …)` y `getByRole('cell', …)` se usan en el panel y en la gráfica de horas.

## 5. Cambios deliberados de pruebas en esta fase

| Prueba | Tarea | Motivo |
|---|---|---|
| `tests/helpers/ensamble.ts`, `tests/unit/openMeteoEnsemble.test.ts` | T0a (hecha) | La petición pasó a `timezone=auto` + `timeformat=unixtime` |
| `e2e/pronostico.spec.ts` (sección `@vivo`) | T0b (hecha) | Usa `PARAMETROS_TIEMPO` y comprueba la zona real |
| `tests/unit/pwaArchivos.test.ts`, `e2e/pwa.spec.ts` (colores y metas) | T5 (hecha) | `theme_color` y `background_color` aprobados; ahora amarrados a los tokens |
| `e2e/pronostico.spec.ts` (`getByRole('img', {name:/próximas horas/})` → `getByRole('list', …)`) | T8 (hecha) | El carrusel de horas deja de ser una imagen SVG |
| `tests/integration/Cielo.test.tsx` (3 → 4 SVG decorativos) | T7 (hecha) | La ilustración del cielo es el cuarto SVG `aria-hidden` |
| `e2e/verificacion.spec.ts` (celda `Calibrado`) | T12b (hecha) | El panel de exactitud pasó a un detalle que hay que abrir (`Ver detalle de exactitud`) |
| `tests/unit/contrasteAvisos.test.ts` (borrada) | T15 (hecha) | Reemplazada por `contrasteTokens.test.ts` (ambos temas) |
| `tests/integration/AppVerificacion.test.tsx` (historial sesgado) | cierre | Espera con `waitFor` el registro asíncrono en vez de leerlo de inmediato (una carrera latente que fallaba bajo carga) |

## 6. Contratos que agregó la Fase 5 (entrega B)

- **Siempre un solo `<h1>SistemaClima</h1>`**: en el cielo cuando hay pronóstico; en `Encabezado` o `EsqueletoCielo` en las demás fases.
- **`aria-label`s únicos:** `Probabilidad de lluvia actual` (dentro del cielo), `Mapa de radar` (tarjeta del mapa y su esqueleto, nunca juntas), `Estado del radar` (tarjeta sin imagen), `Aprendizaje del pronóstico`, `Tus datos`, `Estado de fuentes`, `Observación de lluvia`, `Panel de Exactitud`, `Buscar ciudad`.
- **`origen-pop`** existe siempre, visible solo para lectores de pantalla (`Basada en el ensamble de modelos.` / `Combina el radar con el ensamble de modelos.`).
- **Gotas del carrusel:** `barra-pop-${i}` y `data-radar` van en el `<svg>` de cada gota (con `<title>` como primer hijo); `i` no cuenta los separadores de día. La lista es un `ul` con nombre `Probabilidad de lluvia de las próximas horas` y `tabindex="0"`.
- **Botones con nombre accesible fijo aunque el texto visible sea corto:** `Exportar historial`, `Borrar historial` (visibles `Exportar`, `Borrar`); `Animar`/`Pausar` (solo ícono, con `aria-pressed`); `Importar historial` es un `<label>` de un `input[type=file]` real.
- **Detalle de exactitud:** `#detalle-exactitud` es hermano de la tarjeta de aprendizaje, siempre montado con `hidden`; los `exactitud-*` siempre están en el DOM. El botón `Ver detalle de exactitud` lleva `aria-expanded` y `aria-controls`.
- **Un solo `role="status"`** en todo momento (carga, resultado de «¿Está lloviendo?», gestión del historial, avisos de la PWA); `role="alert"` para errores y fuera de México.
- **Textos nuevos que no deben chocar** con `Tu ubicación`, `Calibrada con tu historial local (`, `sin cobertura en esta zona`, `Radar RainViewer:`, `Caché:` ni `hacia el este`: el mensaje principal, la frase, el chip, la insignia de avance (`28 km/h al este`), los textos de aprendizaje y las explicaciones de la tarjeta del radar sin imagen.
- **Diseño:** a 320 px `scrollWidth <= innerWidth` en todos los estados y ambos temas; en escritorio la columna mide ≤ 560 px y está centrada; cero `console.error`.
