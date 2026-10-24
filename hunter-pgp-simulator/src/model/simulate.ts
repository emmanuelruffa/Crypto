import { boundsOf, inArc, inRect, isLawn, isObstacle, segmentHitsRect } from './geometry';
import { findNozzle, lookupNozzle } from './nozzles';
import { profileMoment, profileValue } from './profiles';
import type { DataSource, Geometry, NozzleLookup, Project, RadialProfile, Rect, Scenario, SimOptions, Sprinkler } from './types';

// ------------------------------------------------ parámetros efectivos

/** Aspersor con todos sus parámetros resueltos para un escenario concreto. */
export interface EffectiveSprinkler {
  id: string;
  label: string;
  x: number;
  y: number;
  dirDeg: number;
  arcDeg: number;
  active: boolean;
  nozzleId: string;
  nozzleLabel: string;
  pressureBar: number;
  pressureSource: DataSource;
  radiusM: number;
  radiusSource: DataSource;
  flowLpm: number;
  flowSource: DataSource;
  /** Estado de la consulta a la tabla (tabla / extrapolado / sin-datos). */
  tableStatus: NozzleLookup['status'];
  profile: RadialProfile;
  /** Área del sector circular regado, θ/2·R² (m²). */
  areaM2: number;
  /** Precipitación media idealizada Pᵢ = 60·Qᵢ/Aᵢ (mm/h). */
  idealPrecipMmH: number;
  /** Coeficiente k de P(r) = k·f(r/R). */
  k: number;
}

/**
 * Procedencia de un valor tomado de la tabla: es "oficial" sólo si la consulta
 * cae dentro de la tabla y la presión usada es a su vez oficial o medida.
 */
function tableDerivedSource(status: NozzleLookup['status'], pressureSource: DataSource): DataSource {
  if (status === 'sin-datos') return 'faltante';
  if (status === 'extrapolado') return 'estimado';
  return pressureSource === 'medido' || pressureSource === 'oficial' ? 'oficial' : 'estimado';
}

export function resolveSprinkler(project: Project, s: Sprinkler, scenario: Scenario): EffectiveSprinkler {
  const set = scenario.settings[s.id];
  const nozzle = findNozzle(project.nozzles, set?.nozzleId ?? '');
  const pressure = s.pressureBar ?? project.pressureBar;
  const look: NozzleLookup = nozzle ? lookupNozzle(nozzle, pressure.value) : { radiusM: 0, flowLpm: 0, status: 'sin-datos' };
  const derived = tableDerivedSource(look.status, pressure.source);

  const radiusM = set?.radiusOverride ? set.radiusOverride.value : look.radiusM;
  const radiusSource = set?.radiusOverride ? set.radiusOverride.source : derived;
  const flowLpm = set?.flowOverride ? set.flowOverride.value : look.flowLpm;
  const flowSource = set?.flowOverride ? set.flowOverride.source : derived;

  const theta = (Math.min(Math.max(s.arcDeg, 1), 360) * Math.PI) / 180;
  const areaM2 = 0.5 * theta * radiusM * radiusM;
  const I = profileMoment(s.profile);
  const valid = radiusM > 0 && flowLpm > 0 && I > 0;
  return {
    id: s.id,
    label: s.label,
    x: s.x,
    y: s.y,
    dirDeg: s.dirDeg,
    arcDeg: s.arcDeg,
    active: !!set?.active && valid,
    nozzleId: set?.nozzleId ?? '',
    nozzleLabel: nozzle?.label ?? '—',
    pressureBar: pressure.value,
    pressureSource: pressure.source,
    radiusM,
    radiusSource,
    flowLpm,
    flowSource,
    tableStatus: look.status,
    profile: s.profile,
    areaM2,
    idealPrecipMmH: areaM2 > 0 ? (60 * flowLpm) / areaM2 : 0,
    k: valid ? (60 * flowLpm) / (theta * radiusM * radiusM * I) : 0,
  };
}

/** Contribución (mm/h) de un aspersor en el punto (x, y). */
export function contributionAt(e: EffectiveSprinkler, g: Geometry, opts: Pick<SimOptions, 'obstacleShadow'>, x: number, y: number): number {
  if (!e.active) return 0;
  const r = Math.hypot(x - e.x, y - e.y);
  if (r > e.radiusM) return 0;
  if (!inArc(e, x, y)) return 0;
  if (opts.obstacleShadow && g.obstacles.some((o) => segmentHitsRect(e, { x, y }, o))) return 0;
  return e.k * profileValue(e.profile, r / e.radiusM);
}

// ------------------------------------------------------------- simulación

export const MASK_OUTSIDE = 0;
export const MASK_LAWN = 1;
export const MASK_OBSTACLE = 2;

export interface SimGrid {
  x0: number;
  y0: number;
  nx: number;
  ny: number;
  cell: number;
  /** Precipitación total por celda (mm/h), fila mayor: idx = j·nx + i. */
  precip: Float32Array;
  mask: Uint8Array;
  /** Índice del sector de cada celda de césped (-1 si no es césped). */
  sectorIdx: Int8Array;
}

export interface Stats {
  n: number;
  areaM2: number;
  mean: number;
  sd: number;
  cv: number;
  cu: number;
  dulq: number;
  min: number;
  max: number;
  minAt: { x: number; y: number } | null;
  maxAt: { x: number; y: number } | null;
  pctBelow80: number;
  pctAbove120: number;
  pctDry: number;
}

export interface WaterBalance {
  /** Caudal nominal total de los aspersores activos (l/min). */
  totalFlowLpm: number;
  /** Fracciones del agua aplicada (suma = 1). */
  onLawn: number;
  onObstacle: number;
  outside: number;
  /** Fracción interceptada por la construcción (sombra) — incluida en onObstacle. */
  blocked: number;
}

export interface SimResult {
  scenarioId: string;
  effective: EffectiveSprinkler[];
  grid: SimGrid;
  lawn: Stats;
  bySector: { id: string; name: string; stats: Stats }[];
  corner: Stats | null;
  cornerCenter: { x: number; y: number } | null;
  balance: WaterBalance;
  /** Minutos de riego para que el cuarto inferior reciba la lámina objetivo. */
  runtimeMinForTarget: number;
  /** Volumen por ciclo con ese tiempo (litros). */
  volumePerCycleL: number;
}

function simDomain(g: Geometry, eff: EffectiveSprinkler[]): Rect {
  const rects: Rect[] = [...g.sectors, ...g.obstacles];
  for (const e of eff) if (e.active) rects.push({ x: e.x - e.radiusM, y: e.y - e.radiusM, w: 2 * e.radiusM, h: 2 * e.radiusM });
  const b = boundsOf(rects);
  return { x: b.x - 0.5, y: b.y - 0.5, w: b.w + 1, h: b.h + 1 };
}

export function computeStats(values: number[], coords?: { x: number; y: number }[], cellArea = 0): Stats {
  const n = values.length;
  const empty: Stats = {
    n: 0, areaM2: 0, mean: 0, sd: 0, cv: 0, cu: 0, dulq: 0, min: 0, max: 0,
    minAt: null, maxAt: null, pctBelow80: 0, pctAbove120: 0, pctDry: 0,
  };
  if (n === 0) return empty;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let minI = 0;
  let maxI = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    sum += v;
    if (v < min) { min = v; minI = i; }
    if (v > max) { max = v; maxI = i; }
  }
  const mean = sum / n;
  let sq = 0;
  let absDev = 0;
  let below = 0;
  let above = 0;
  let dry = 0;
  for (const v of values) {
    sq += (v - mean) ** 2;
    absDev += Math.abs(v - mean);
    if (v < 0.8 * mean) below++;
    if (v > 1.2 * mean) above++;
    if (v <= 1e-9) dry++;
  }
  const sd = Math.sqrt(sq / n);
  const sorted = Float64Array.from(values).sort();
  const q = Math.max(1, Math.floor(n / 4));
  let lq = 0;
  for (let i = 0; i < q; i++) lq += sorted[i];
  lq /= q;
  return {
    n,
    areaM2: n * cellArea,
    mean,
    sd,
    cv: mean > 0 ? sd / mean : 0,
    cu: mean > 0 ? 1 - absDev / (n * mean) : 0,
    dulq: mean > 0 ? lq / mean : 0,
    min,
    max,
    minAt: coords ? coords[minI] : null,
    maxAt: coords ? coords[maxI] : null,
    pctBelow80: below / n,
    pctAbove120: above / n,
    pctDry: dry / n,
  };
}

export function simulate(project: Project, scenario: Scenario, optsOverride?: Partial<SimOptions>, profileOverride?: RadialProfile): SimResult {
  const opts = { ...project.options, ...optsOverride };
  const g = project.geometry;
  const sprinklers = profileOverride ? project.sprinklers.map((s) => ({ ...s, profile: profileOverride })) : project.sprinklers;
  const eff = sprinklers.map((s) => resolveSprinkler(project, s, scenario));
  const active = eff.filter((e) => e.active);

  const cell = Math.min(Math.max(opts.cellM, 0.02), 1);
  const dom = simDomain(g, eff);
  const nx = Math.max(1, Math.ceil(dom.w / cell));
  const ny = Math.max(1, Math.ceil(dom.h / cell));
  const precip = new Float32Array(nx * ny);
  const mask = new Uint8Array(nx * ny);
  const sectorIdx = new Int8Array(nx * ny).fill(-1);

  let wLawn = 0;
  let wObst = 0;
  let wOut = 0;
  let wBlocked = 0;

  for (let j = 0; j < ny; j++) {
    const y = dom.y + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) {
      const x = dom.x + (i + 0.5) * cell;
      const idx = j * nx + i;
      const lawn = isLawn(g, x, y);
      const obst = !lawn && isObstacle(g, x, y);
      mask[idx] = lawn ? MASK_LAWN : obst ? MASK_OBSTACLE : MASK_OUTSIDE;
      if (lawn) sectorIdx[idx] = g.sectors.findIndex((s) => inRect(s, x, y));
      let p = 0;
      for (const e of active) {
        const r = Math.hypot(x - e.x, y - e.y);
        if (r > e.radiusM || !inArc(e, x, y)) continue;
        const v = e.k * profileValue(e.profile, r / e.radiusM);
        if (opts.obstacleShadow && !obst && g.obstacles.some((o) => segmentHitsRect(e, { x, y }, o))) {
          wBlocked += v;
          continue;
        }
        p += v;
      }
      precip[idx] = p;
      if (lawn) wLawn += p;
      else if (obst) wObst += p;
      else wOut += p;
    }
  }

  const grid: SimGrid = { x0: dom.x, y0: dom.y, nx, ny, cell, precip, mask, sectorIdx };
  const cellArea = cell * cell;

  const lawnVals: number[] = [];
  const lawnXY: { x: number; y: number }[] = [];
  const perSector: number[][] = g.sectors.map(() => []);
  const cornerVals: number[] = [];
  const focus = eff.find((e) => e.id === project.focusSprinklerId) ?? null;
  const cornerCenter = focus ? { x: focus.x, y: focus.y } : null;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      if (mask[idx] !== MASK_LAWN) continue;
      const x = dom.x + (i + 0.5) * cell;
      const y = dom.y + (j + 0.5) * cell;
      const v = precip[idx];
      lawnVals.push(v);
      lawnXY.push({ x, y });
      if (sectorIdx[idx] >= 0) perSector[sectorIdx[idx]].push(v);
      if (cornerCenter && Math.hypot(x - cornerCenter.x, y - cornerCenter.y) <= opts.cornerZoneRadiusM) cornerVals.push(v);
    }
  }
  // Las celdas que caen en dos sectores solapados se asignan al primero.
  const lawn = computeStats(lawnVals, lawnXY, cellArea);
  const total = wLawn + wObst + wOut + wBlocked;
  const lq = lawn.mean * lawn.dulq;
  const runtimeMinForTarget = lq > 0 ? (opts.targetDepthMm / lq) * 60 : Infinity;
  const totalFlowLpm = active.reduce((a, e) => a + e.flowLpm, 0);

  return {
    scenarioId: scenario.id,
    effective: eff,
    grid,
    lawn,
    bySector: g.sectors.map((s, k) => ({ id: s.id, name: s.name, stats: computeStats(perSector[k], undefined, cellArea) })),
    corner: cornerCenter ? computeStats(cornerVals, undefined, cellArea) : null,
    cornerCenter,
    balance: {
      totalFlowLpm,
      onLawn: total > 0 ? wLawn / total : 0,
      onObstacle: total > 0 ? (wObst + wBlocked) / total : 0,
      outside: total > 0 ? wOut / total : 0,
      blocked: total > 0 ? wBlocked / total : 0,
    },
    runtimeMinForTarget,
    volumePerCycleL: Number.isFinite(runtimeMinForTarget) ? totalFlowLpm * runtimeMinForTarget : Infinity,
  };
}

/** Valor de la cuadrícula más cercano a (x, y), o null fuera del dominio. */
export function sampleGrid(g: SimGrid, x: number, y: number): { value: number; mask: number } | null {
  const i = Math.floor((x - g.x0) / g.cell);
  const j = Math.floor((y - g.y0) / g.cell);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
  const idx = j * g.nx + i;
  return { value: g.precip[idx], mask: g.mask[idx] };
}
