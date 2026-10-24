# Simulador de riego Hunter PGP Ultra · jardín en L

Aplicación web (React + TypeScript + Vite) que representa el jardín en L a escala
métrica y simula la precipitación de cuatro rotores Hunter PGP Ultra (A, B, D, E)
funcionando a la vez. Su objetivo es ayudar a responder:

> ¿Mantener la boquilla negra 1.0 en el aspersor E o cambiarla por una 2.0 mejora
> la uniformidad de precipitación de todo el jardín?

La aplicación **no responde por sí sola**: compara dos escenarios con los datos
introducidos, muestra la procedencia de cada dato y enumera lo que falta medir para
que la comparación sea fiable.

## Ejecutar en local

```bash
cd hunter-pgp-simulator
npm install
npm run dev        # servidor de desarrollo → http://localhost:5173
npm test           # pruebas del modelo hidráulico (vitest)
npm run build      # compilación estática en dist/
```

Requiere Node 18 o posterior. Los cambios se guardan en el navegador
(`localStorage`); con **Exportar JSON / Importar** se guarda y comparte un proyecto
completo y reproducible.

## Estructura

```
src/model/          modelo hidráulico, sin dependencias de la interfaz
  types.ts          tipos y unidades
  nozzles.ts        tablas de boquillas (con fuente y advertencias) e interpolación
  profiles.ts       perfiles radiales de reparto y su normalización
  geometry.ts       sectores, construcción, sombra del chorro, plano normalizado, giros
  simulate.ts       cuadrícula de cálculo, precipitación local, indicadores, balance de agua
  compare.ts        diferencias entre escenarios y análisis de sensibilidad
  readiness.ts      lista de datos pendientes y fiabilidad
  pump.ts           curva de la bomba, punto de funcionamiento y calibración
  defaults.ts       datos de ejemplo editables
  model.test.ts     pruebas (conservación del volumen, CU/DUlq, tablas, geometría)
src/ui/             interfaz React (plano SVG + mapa de calor en canvas, editores, tablas)
```

## Procedencia de los datos

Cada valor lleva una etiqueta visible:

| Etiqueta | Significado |
|---|---|
| **oficial** | Tomado de la tabla de Hunter, dentro de su rango, con una presión medida |
| **medido** | Introducido por el usuario a partir de una medición en campo |
| **estimación** | Supuesto, extrapolado, o leído de la tabla con una presión que no se ha medido |
| **falta dato** | No hay dato (p. ej. boquilla personalizada sin caudal) |

Un caudal de tabla leído con la presión provisional se muestra como **estimación**
hasta que la presión se marque como medida.

## Datos de boquillas y fuentes

Tablas de rendimiento publicadas por Hunter Industries para PGP Ultra / I-20:

- Gris de ángulo bajo (LA): <https://www.hunterirrigation.com/node/3936> (US) y
  `/en-metric/node/3936` (métrico).
- Negra de corto alcance (SR): <https://www.hunterirrigation.com/node/3941> (US) y
  `/en-metric/node/3941` (métrico).
- Ficha métrica LIT-651: <https://www.hunterirrigation.com/sites/default/files/ic_i20_em.pdf>.
- Rangos generales de la ficha de producto: presión recomendada 25–70 psi
  (1,7–4,8 bar), arco ajustable 50°–360°.

Valores usados por defecto (originales en unidades US, convertidos con
1 psi = 0,0689476 bar, 1 ft = 0,3048 m, 1 GPM = 3,78541 l/min):

| Boquilla | 30 psi | 40 psi | 50 psi | 60 psi |
|---|---|---|---|---|
| Gris 3.5 LA | 29 ft · 2,8 GPM | 32 ft · 3,1 GPM | 35 ft · 3,5 GPM | 37 ft · 3,8 GPM |
| Negra 1.0 SR | 17 ft · 0,78 GPM | 17 ft · 0,90 GPM | 18 ft · 1,0 GPM | 19 ft · 1,1 GPM |
| Negra 2.0 SR | 17 ft · 1,4 GPM | 17 ft · 1,7 GPM | 18 ft · 2,0 GPM | 19 ft · 2,2 GPM |

Se añade además el punto de 1,7 bar de la tabla métrica de cada una.

**Advertencia:** estas cifras se transcribieron de extractos de las páginas de Hunter;
desde el entorno de desarrollo no se pudo descargar el documento original. Las filas
anteriores se comprobaron por consistencia interna (la precipitación que publica
Hunter para cada fila coincide con 96,3·GPM·2 / radio², operación a 180° en marco
cuadrado; hay una prueba que lo verifica), pero **deben contrastarse con la ficha
impresa** y con el código grabado en las boquillas instaladas. La pestaña
*Boquillas* tiene una casilla para registrar esa verificación. El catálogo incluye
otras boquillas LA y SR; algunas sólo con los extremos de presión (se indica en cada
una).

Hunter **no publica perfiles radiales** de distribución en esas tablas. El perfil por
defecto es una forma genérica de rotor, marcada como estimación.

## Modelo de cálculo

### Precipitación media idealizada de un aspersor

    Pᵢ = 60 · Qᵢ / Aᵢ        Aᵢ = (θᵢ / 360°) · π · Rᵢ²

con P en mm/h, Q en l/min, A en m² (1 l/m² = 1 mm; el 60 pasa de l/min a l/h).
Se muestra en la tabla de aspersores para comprobar si las precipitaciones de rotores
con distinto arco están equilibradas. No representa la distribución real.

### Distribución espacial

La precipitación en cada celda de la cuadrícula es la suma de los aspersores activos:

    P(x,y) = Σᵢ Pᵢ(x,y)
    Pᵢ(x,y) = kᵢ · f(r/Rᵢ)    si r ≤ Rᵢ, el punto está dentro del arco
                               y (opcional) el chorro no atraviesa la construcción
    kᵢ = 60 · Qᵢ / (θᵢ · Rᵢ² · I),    I = ∫₀¹ f(u) · u du,   θ en radianes

`f` es el perfil radial relativo (uniforme, triangular, trapezoidal o una tabla de
11 puntos editable). La constante `kᵢ` garantiza que el volumen aplicado por cada
aspersor es exactamente su caudal, sea cual sea la forma del perfil. Con f ≡ 1 se
recupera Pᵢ = 60·Qᵢ/Aᵢ.

### Caudal y radio en función de la presión

Interpolación lineal entre filas de la tabla. Fuera del rango tabulado: caudal
proporcional a √P (ley de orificio) a partir de la fila más cercana y radio
constante; el resultado se marca como estimación. Los valores medidos introducidos
por el usuario sustituyen a la tabla.

### Presión de trabajo con la bomba

Los cuatro aspersores se alimentan juntos con una bomba (por defecto: Pektra 1 HP,
5700 l/h de caudal máximo y 28 m de altura máxima, datos de placa). Si la bomba está
activa, la presión de cada escenario se calcula como punto de funcionamiento:

    H_bomba(Q) = desnivel + pérdidas · (Q / Q_ref)² + P · 10,197
    Q = Σ caudal de cada boquilla a la presión P (tablas o valores medidos)

y se resuelve por bisección. Con sólo los dos máximos de placa la curva se supone
parabólica, H = Hmáx · (1 − (Q/Qmáx)²), forma típica de una bomba centrífuga pero
**estimada**; si la ficha de la bomba trae la curva, se pueden introducir sus puntos.
Desnivel y pérdidas son desconocidos (0 m por defecto), así que la presión calculada
es un **máximo**. Lo más simple es medir la presión con los cuatro en marcha y usar
**Calibrar**: el modelo ajusta las pérdidas para reproducir esa medición y recalcula
el otro escenario con la curva.

Así se incluye un efecto que la presión fija ignora: al poner la 2.0 en E sube el
caudal total, baja la presión y los demás aspersores pierden algo de caudal y radio.

### Indicadores (sobre las celdas de césped; la construcción queda excluida)

| Indicador | Fórmula |
|---|---|
| Media | P̄ = Σ Pⱼ / n |
| Desviación estándar | σ = √(Σ (Pⱼ − P̄)² / n) |
| Coeficiente de variación | CV = σ / P̄ |
| Uniformidad de Christiansen | CU = 1 − Σ \|Pⱼ − P̄\| / (n · P̄) |
| Uniformidad del cuarto inferior | DUlq = media del 25 % de celdas con menos agua / P̄ |
| Déficit / exceso | % de superficie con P < 0,8·P̄ y con P > 1,2·P̄ |

También se calculan: estadísticas por sector, zona alrededor de E (radio
configurable) para detectar exceso en la esquina junto a la construcción, balance
de agua (césped / construcción o interceptada / fuera del césped), y el tiempo de
riego necesario para que el cuarto más seco reciba una lámina objetivo.

Todos son **resultados simulados**.

### Análisis de sensibilidad

La comparación entre escenarios se repite cambiando los supuestos no verificados:
cuatro formas de perfil radial y cuatro presiones (2,0–3,5 bar). Si en unos supuestos
el escenario 2 mejora el DUlq y en otros empeora, la aplicación lo indica: la
conclusión depende de datos que hay que medir. Diferencias de DUlq menores de
2 puntos se consideran empate.

### Supuestos no modelados

- Velocidad de giro uniforme en todo el arco (en la realidad hay algo más de agua en
  los extremos de giro).
- Sin viento, evaporación ni deriva; terreno plano.
- Con la bomba activa, la misma presión en los cuatro aspersores (no se modelan las
  diferencias de pérdida entre ramales); con la bomba desactivada, la presión no
  cambia al cambiar la boquilla de E.
- El tornillo reductor de radio no se modela; si se ha usado, introducir el radio
  medido (y, si es posible, el caudal medido).
- El agua que cae fuera del césped se considera perdida.

## Geometría y plano normalizado

Las coordenadas iniciales de los aspersores (A 67/3, B 3/96, D 73/97, E 100/49)
proceden de un plano normalizado 0–100 que **no** está en metros. La aplicación
guarda la posición en metros y una correspondencia editable entre ambos sistemas.
Hipótesis por defecto (todo marcado como estimación):

- El plano normalizado cubre la caja envolvente de la L: 15 m en x × 10 m en y,
  con y hacia abajo.
- Sector 10×10 en (0,0); sector 5×5 adosado a la derecha en la mitad inferior,
  (10,5); construcción 5×5 encima del sector pequeño, (10,0).
- A y E caen fuera del césped con esa escala (dentro de la construcción); se
  colocan en el punto de césped más cercano.

Con esa hipótesis las posiciones coinciden con la descripción: A y B en esquinas
opuestas del 10×10, D junto a la unión entre sectores, E en la esquina junto a la
construcción. La L se puede girar o reflejar, y los sectores y la construcción se
pueden mover y redimensionar en la pestaña *Terreno* o arrastrándolos en el plano.

## Qué medir para que la comparación sea fiable

La sección «Qué falta…» de la aplicación se actualiza con los datos introducidos.
En orden de importancia:

1. **Presión con los cuatro funcionando** (manómetro a la salida de la bomba, o con
   tubo de pitot en la boquilla). Es crítica: fija el caudal y el radio de la tabla,
   y con ella se calibran las pérdidas de la instalación. Si se dispone de la curva
   completa de la bomba (ficha del fabricante), introducirla también.
2. **Caudal real** de cada boquilla: con el contador, abriendo un único aspersor si
   es posible, o recogiendo el agua en un recipiente con una manguera sobre la
   boquilla durante un tiempo medido.
3. **Perfil radial**: prueba de vasos o pluviómetros en línea recta desde el
   aspersor (por ejemplo cada 0,5 m), con ese aspersor solo, durante un tiempo
   conocido. Introducir la lámina de cada vaso en la tabla de 11 puntos y marcar
   «medido».
4. **Posición métrica** de los cuatro aspersores y **orientación** de los bordes
   del arco.
5. **Radio de alcance** observado.
6. **Geometría** definitiva de los sectores y de la construcción.
7. **Verificación** de las tablas con la ficha oficial y del código de cada
   boquilla instalada.

Una prueba de vasos en cuadrícula sobre todo el jardín, con los cuatro aspersores
funcionando, permitiría además medir directamente la CU y la DUlq reales y
contrastar la simulación.
