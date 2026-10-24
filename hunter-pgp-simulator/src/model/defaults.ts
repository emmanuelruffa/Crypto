import { normalizedToMeters, snapToLawn } from './geometry';
import { NOZZLES } from './nozzles';
import { defaultProfile } from './profiles';
import type { Geometry, NormalizedFrame, Project, Scenario, Sprinkler, SprinklerSetting } from './types';

/**
 * Datos de ejemplo editables.
 *
 * Hipótesis de partida (todas marcadas como «estimado» en la interfaz):
 *  - El plano normalizado 0–100 abarca la caja envolvente de la L: 15 m (x) × 10 m (y),
 *    con y creciendo hacia abajo. Con esa hipótesis las coordenadas normalizadas son
 *    coherentes con la descripción (A y B en esquinas opuestas del 10×10, D junto a
 *    la unión de los sectores, E en la esquina junto a la construcción).
 *  - Sector principal 10×10 en (0,0); sector secundario 5×5 adosado a la derecha,
 *    en la mitad inferior; construcción 5×5 encima del sector secundario.
 *  - Los aspersores que caen fuera del césped (A y E) se desplazan al punto de
 *    césped más cercano.
 */

export const DEFAULT_FRAME: NormalizedFrame = { originX: 0, originY: 0, widthM: 15, heightM: 10, flipY: false };

export const DEFAULT_GEOMETRY: Geometry = {
  sectors: [
    { id: 'principal', name: 'Sector principal 10×10', x: 0, y: 0, w: 10, h: 10 },
    { id: 'secundario', name: 'Sector secundario 5×5', x: 10, y: 5, w: 5, h: 5 },
  ],
  obstacles: [{ id: 'construccion', name: 'Construcción', x: 10, y: 0, w: 5, h: 5 }],
  sectorsSource: 'estimado',
  obstaclesSource: 'estimado',
};

const RAW: { id: string; n: { x: number; y: number }; dirDeg: number; arcDeg: number }[] = [
  { id: 'A', n: { x: 67, y: 3 }, dirDeg: 135, arcDeg: 90 },
  { id: 'B', n: { x: 3, y: 96 }, dirDeg: 315, arcDeg: 90 },
  { id: 'D', n: { x: 73, y: 97 }, dirDeg: 270, arcDeg: 180 },
  { id: 'E', n: { x: 100, y: 49 }, dirDeg: 135, arcDeg: 90 },
];

export function sprinklersFromNormalized(g: Geometry, f: NormalizedFrame): Sprinkler[] {
  return RAW.map((r) => {
    const m = normalizedToMeters(f, r.n);
    const snapped = snapToLawn(g, m);
    return {
      id: r.id,
      label: r.id,
      x: snapped.x,
      y: snapped.y,
      positionSource: 'estimado',
      normalized: r.n,
      dirDeg: r.dirDeg,
      arcDeg: r.arcDeg,
      orientationSource: 'estimado',
      pressureBar: null,
      profile: defaultProfile(),
    } satisfies Sprinkler;
  });
}

function setting(nozzleId: string): SprinklerSetting {
  return { active: true, nozzleId, flowOverride: null, radiusOverride: null };
}

export const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: 'esc1',
    name: 'Escenario 1 · E con 1.0 SR',
    settings: { A: setting('la-3.5'), B: setting('la-3.5'), D: setting('sr-2.0'), E: setting('sr-1.0') },
  },
  {
    id: 'esc2',
    name: 'Escenario 2 · E con 2.0 SR',
    settings: { A: setting('la-3.5'), B: setting('la-3.5'), D: setting('sr-2.0'), E: setting('sr-2.0') },
  },
];

export function defaultProject(): Project {
  const geometry = structuredClone(DEFAULT_GEOMETRY);
  const frame = { ...DEFAULT_FRAME };
  return {
    geometry,
    frame,
    sprinklers: sprinklersFromNormalized(geometry, frame),
    pressureBar: {
      value: 2.76,
      source: 'estimado',
      note: 'Valor provisional. Medir la presión real con los cuatro aspersores funcionando.',
    },
    nozzles: structuredClone(NOZZLES),
    nozzleTablesVerified: false,
    scenarios: structuredClone(DEFAULT_SCENARIOS),
    options: { cellM: 0.1, obstacleShadow: true, cornerZoneRadiusM: 2.5, targetDepthMm: 10 },
    focusSprinklerId: 'E',
  };
}
