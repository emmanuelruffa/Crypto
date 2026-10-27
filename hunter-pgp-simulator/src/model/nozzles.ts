import type { NozzleLookup, NozzleSpec, NozzleTablePoint } from './types';

/**
 * Catálogo de boquillas Hunter PGP Ultra.
 *
 * Fuentes (tablas de rendimiento publicadas por Hunter Industries):
 *  - PGP Ultra / I-20 Grey Low-Angle Nozzle Performance Data
 *    https://www.hunterirrigation.com/node/3936  (US)  y  /en-metric/node/3936
 *  - PGP Ultra / I-20 Black Short-Radius Nozzle Performance Data
 *    https://www.hunterirrigation.com/node/3941  (US)  y  /en-metric/node/3941
 *  - PGP Ultra / I-20 Blue Standard Nozzle Performance Data
 *    https://www.hunterirrigation.com/node/3931  (US)  y  /en-metric/node/50806
 *  - PGP Ultra / I-20 High-Flow Nozzle Performance Data (verde)
 *    https://www.hunterirrigation.com/en-metric/node/3951
 *  - Ficha métrica LIT-651: https://www.hunterirrigation.com/sites/default/files/ic_i20_em.pdf
 *
 * IMPORTANTE: los valores se transcribieron a partir de extractos de esas páginas
 * (no se pudo descargar el PDF original desde el entorno de desarrollo). Las filas
 * en unidades US de 1.0 SR, 2.0 SR y 3.5 LA se comprobaron por consistencia interna:
 * la precipitación que Hunter publica para cada fila coincide con
 * 96,3·GPM·2 / radio² (operación a 180°, marco cuadrado). Aun así deben contrastarse
 * con la tabla oficial impresa antes de tomar decisiones; ver README.
 *
 * Conversión: 1 psi = 0,0689476 bar · 1 ft = 0,3048 m · 1 GPM = 3,78541 l/min.
 */

const PSI_TO_BAR = 0.0689476;
const FT_TO_M = 0.3048;
const GPM_TO_LPM = 3.78541;

function us(psi: number, ft: number, gpm: number): NozzleTablePoint {
  return {
    pressureBar: psi * PSI_TO_BAR,
    radiusM: ft * FT_TO_M,
    flowLpm: gpm * GPM_TO_LPM,
    original: `${psi} psi · ${ft} ft · ${gpm} GPM`,
  };
}

function metric(bar: number, m: number, lpm: number): NozzleTablePoint {
  return { pressureBar: bar, radiusM: m, flowLpm: lpm, original: `${bar} bar · ${m} m · ${lpm} l/min (tabla métrica)` };
}

const REF_LA = 'Hunter, PGP Ultra / I-20 Grey Low-Angle Nozzle Performance Data (hunterirrigation.com/node/3936)';
const REF_SR = 'Hunter, PGP Ultra / I-20 Black Short-Radius Nozzle Performance Data (hunterirrigation.com/node/3941)';
const REF_BLUE = 'Hunter, PGP Ultra / I-20 Blue Standard Nozzle Performance Data (hunterirrigation.com/node/3931 y /en-metric/node/50806)';
const BLUE_ENDS = 'Sólo se dispone de los extremos (25 y 65 psi); intermedios interpolados linealmente.';
const BLUE_MIXED = 'Filas de 25 y 65 psi de la tabla US y de 2,5–4,0 bar de la tabla métrica.';
const TRANSCRIBED = 'Transcrito de la tabla publicada por Hunter; verificar contra la tabla oficial impresa (LIT-651).';
const METRIC_POINT = 'El punto de 1,7 bar procede de la tabla métrica; el resto de la tabla en unidades US convertida.';

export const NOZZLES: NozzleSpec[] = [
  {
    id: 'la-2.0',
    label: 'Gris 2.0 LA (ángulo bajo)',
    family: 'gris-angulo-bajo',
    color: '#8a8a8a',
    table: [us(30, 25, 1.6), us(40, 27, 1.9), us(50, 28, 2.1), us(60, 30, 2.3)],
    source: 'oficial',
    sourceRef: REF_LA,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'la-2.5',
    label: 'Gris 2.5 LA (ángulo bajo)',
    family: 'gris-angulo-bajo',
    color: '#8a8a8a',
    table: [us(30, 27, 2.1), us(40, 30, 2.5), us(50, 33, 2.8), us(60, 35, 3.0)],
    source: 'oficial',
    sourceRef: REF_LA,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'la-3.5',
    label: 'Gris 3.5 LA (ángulo bajo)',
    family: 'gris-angulo-bajo',
    color: '#8a8a8a',
    table: [metric(1.7, 8.5, 9.7), us(30, 29, 2.8), us(40, 32, 3.1), us(50, 35, 3.5), us(60, 37, 3.8)],
    source: 'oficial',
    sourceRef: REF_LA,
    caveats: [TRANSCRIBED, METRIC_POINT],
  },
  {
    id: 'la-4.5',
    label: 'Gris 4.5 LA (ángulo bajo)',
    family: 'gris-angulo-bajo',
    color: '#8a8a8a',
    table: [us(30, 29, 3.4), us(40, 32, 3.9), us(50, 35, 4.4), us(60, 37, 4.7)],
    source: 'oficial',
    sourceRef: REF_LA,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'sr-0.50',
    label: 'Negra 0.50 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [us(30, 17, 0.36), us(60, 19, 0.57)],
    source: 'oficial',
    sourceRef: REF_SR,
    caveats: [TRANSCRIBED, 'Sólo se dispone de los extremos (30 y 60 psi); intermedios interpolados linealmente.'],
  },
  {
    id: 'sr-0.75',
    label: 'Negra 0.75 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [us(30, 23, 0.58), us(60, 26, 0.83)],
    source: 'oficial',
    sourceRef: REF_SR,
    caveats: [TRANSCRIBED, 'Sólo se dispone de los extremos (30 y 60 psi); intermedios interpolados linealmente.'],
  },
  {
    id: 'sr-1.0',
    label: 'Negra 1.0 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [metric(1.7, 4.9, 2.7), us(30, 17, 0.78), us(40, 17, 0.9), us(50, 18, 1.0), us(60, 19, 1.1)],
    source: 'oficial',
    sourceRef: REF_SR,
    caveats: [TRANSCRIBED, METRIC_POINT],
  },
  {
    id: 'sr-1.5',
    label: 'Negra 1.5 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [us(30, 23, 1.1), us(60, 26, 1.6)],
    source: 'oficial',
    sourceRef: REF_SR,
    caveats: [TRANSCRIBED, 'Sólo se dispone de los extremos (30 y 60 psi); intermedios interpolados linealmente.'],
  },
  {
    id: 'sr-2.0',
    label: 'Negra 2.0 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [metric(1.7, 4.9, 4.7), us(30, 17, 1.4), us(40, 17, 1.7), us(50, 18, 2.0), us(60, 19, 2.2)],
    source: 'oficial',
    sourceRef: REF_SR,
    caveats: [TRANSCRIBED, METRIC_POINT],
  },
  {
    id: 'sr-3.0',
    label: 'Negra 3.0 SR (corto alcance)',
    family: 'negra-corto-alcance',
    color: '#222222',
    table: [metric(2.0, 7.0, 9.3), metric(2.5, 7.0, 10.0), metric(3.0, 7.3, 10.7)],
    source: 'oficial',
    sourceRef: `${REF_SR} (versión métrica)`,
    caveats: [TRANSCRIBED, 'Sólo filas de 2,0 a 3,0 bar disponibles; fuera de ese rango se extrapola.'],
  },
  {
    id: 'bl-1.5',
    label: 'Azul 1.5 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 29, 1.2), us(35, 31, 1.4), us(45, 31, 1.5), us(55, 32, 1.8), us(65, 32, 1.9)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'bl-2.0',
    label: 'Azul 2.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 33, 1.4), us(65, 34, 2.3)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED, BLUE_ENDS],
  },
  {
    id: 'bl-2.5',
    label: 'Azul 2.5 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 33, 1.7), us(65, 35, 2.9)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED, BLUE_ENDS],
  },
  {
    id: 'bl-3.0',
    label: 'Azul 3.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 35, 2.2), metric(2.5, 11.0, 10.2), metric(3.0, 11.6, 11.4), metric(4.0, 11.9, 13.2), us(65, 39, 3.7)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED, BLUE_MIXED],
  },
  {
    id: 'bl-4.0',
    label: 'Azul 4.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 37, 3.0), metric(2.5, 11.9, 13.6), metric(3.0, 12.2, 15.0), metric(4.0, 12.5, 17.3), us(65, 41, 4.8)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED, BLUE_MIXED],
  },
  {
    id: 'bl-5.0',
    label: 'Azul 5.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 37, 3.7), us(35, 39, 4.5), us(45, 42, 5.0), us(55, 42, 5.7), us(65, 42, 6.2)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'bl-6.0',
    label: 'Azul 6.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 38, 4.3), us(35, 40, 5.6), us(45, 43, 6.0), us(55, 44, 6.7), us(65, 44, 7.3)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED],
  },
  {
    id: 'bl-8.0',
    label: 'Azul 8.0 (estándar)',
    family: 'azul-estandar',
    color: '#2a78d6',
    table: [us(25, 37, 6.0), us(35, 41, 7.0), us(45, 44, 8.0), us(55, 46, 9.0), us(65, 46, 9.8)],
    source: 'oficial',
    sourceRef: REF_BLUE,
    caveats: [TRANSCRIBED, 'Gran caudal: con la bomba actual la presión puede caer por debajo del mínimo recomendado (1,7 bar).'],
  },
  {
    id: 'gr-6.0',
    label: 'Verde 6.0 (alto caudal)',
    family: 'verde-alto-caudal',
    color: '#1baf7a',
    table: [metric(1.7, 9.1, 14.3), metric(2.0, 9.4, 15.6), metric(2.5, 10.1, 17.8), metric(3.0, 10.7, 20.0), metric(3.5, 11.3, 21.9), metric(4.0, 11.6, 23.6), metric(4.5, 11.9, 25.3)],
    source: 'oficial',
    sourceRef: 'Hunter, PGP Ultra / I-20 High-Flow Nozzle Performance Data (hunterirrigation.com/en-metric/node/3951)',
    caveats: [TRANSCRIBED, 'La fuente la nombra también como «6.0 LA»: confirmar en la ficha que es la boquilla verde que se piensa comprar.'],
  },
  {
    id: 'custom',
    label: 'Personalizada (sin tabla)',
    family: 'personalizada',
    color: '#b05cc8',
    table: [],
    source: 'faltante',
    sourceRef: 'Sin tabla: introducir caudal y radio manualmente.',
    caveats: ['Requiere caudal y radio introducidos por el usuario.'],
  },
];

/**
 * Catálogo de un proyecto guardado: las boquillas incorporadas se toman siempre de
 * la versión actual de NOZZLES (así un proyecto antiguo recibe las nuevas y las
 * correcciones), y se conservan las que el usuario haya añadido con otro id.
 */
export function mergeNozzleCatalog(saved: NozzleSpec[] | undefined): NozzleSpec[] {
  const builtIn = structuredClone(NOZZLES);
  const ids = new Set(builtIn.map((n) => n.id));
  return [...builtIn, ...(saved ?? []).filter((n) => !ids.has(n.id))];
}

export function findNozzle(nozzles: NozzleSpec[], id: string): NozzleSpec | undefined {
  return nozzles.find((n) => n.id === id);
}

/**
 * Caudal y radio a una presión dada.
 *  - Dentro del rango de la tabla: interpolación lineal entre filas adyacentes.
 *  - Fuera del rango: el caudal se extrapola con la ley de orificio Q ∝ √P a partir
 *    de la fila más cercana y el radio se mantiene en el valor extremo. Se marca
 *    como 'extrapolado' para que la interfaz lo muestre como estimación.
 */
export function lookupNozzle(spec: NozzleSpec, pressureBar: number): NozzleLookup {
  const t = spec.table;
  if (t.length === 0) return { radiusM: 0, flowLpm: 0, status: 'sin-datos' };
  const first = t[0];
  const last = t[t.length - 1];
  const eps = 1e-9;
  if (pressureBar < first.pressureBar - eps || pressureBar > last.pressureBar + eps) {
    const ref = pressureBar < first.pressureBar ? first : last;
    const p = Math.max(pressureBar, 0);
    return {
      radiusM: ref.radiusM,
      flowLpm: ref.flowLpm * Math.sqrt(p / ref.pressureBar),
      status: 'extrapolado',
    };
  }
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (pressureBar <= b.pressureBar + eps) {
      const k = b.pressureBar === a.pressureBar ? 0 : (pressureBar - a.pressureBar) / (b.pressureBar - a.pressureBar);
      return {
        radiusM: a.radiusM + k * (b.radiusM - a.radiusM),
        flowLpm: a.flowLpm + k * (b.flowLpm - a.flowLpm),
        status: 'tabla',
      };
    }
  }
  return { radiusM: last.radiusM, flowLpm: last.flowLpm, status: 'tabla' };
}

export const BAR_TO_PSI = 1 / PSI_TO_BAR;
