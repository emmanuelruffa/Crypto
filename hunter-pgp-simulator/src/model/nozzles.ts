import type { NozzleLookup, NozzleSpec, NozzleTablePoint } from './types';

/**
 * Catálogo de boquillas Hunter PGP Ultra.
 *
 * Fuentes (tablas de rendimiento publicadas por Hunter Industries):
 *  - PGP Ultra / I-20 Grey Low-Angle Nozzle Performance Data
 *    https://www.hunterirrigation.com/node/3936  (US)  y  /en-metric/node/3936
 *  - PGP Ultra / I-20 Black Short-Radius Nozzle Performance Data
 *    https://www.hunterirrigation.com/node/3941  (US)  y  /en-metric/node/3941
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
