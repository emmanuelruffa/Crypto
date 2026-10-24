import { findNozzle, lookupNozzle } from './nozzles';
import type { Project, Pump, Scenario, Sourced } from './types';

/** 1 bar = 10,197 m de columna de agua. */
export const M_PER_BAR = 10.197;

/**
 * Altura de la bomba (m) para un caudal (l/h).
 *  - Con dos puntos (0, Hmáx) y (Qmáx, 0): parábola H = Hmáx·(1 − (Q/Qmáx)²), forma
 *    típica de una bomba centrífuga. Es una estimación: la curva real está en la ficha.
 *  - Con más puntos: interpolación lineal (extrapolación lineal fuera de rango).
 */
export function pumpHead(pump: Pump, qLph: number): number {
  const pts = [...pump.points].sort((a, b) => a.flowLph - b.flowLph);
  if (pts.length < 2) return 0;
  if (pts.length === 2 && pts[0].flowLph === 0 && pts[1].headM === 0 && pts[1].flowLph > 0) {
    const r = qLph / pts[1].flowLph;
    return pts[0].headM * (1 - r * r);
  }
  let i = 0;
  while (i < pts.length - 2 && qLph > pts[i + 1].flowLph) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const k = b.flowLph === a.flowLph ? 0 : (qLph - a.flowLph) / (b.flowLph - a.flowLph);
  return a.headM + k * (b.headM - a.headM);
}

export function pumpShutoffHead(pump: Pump): number {
  return Math.max(0, ...pump.points.map((p) => p.headM));
}

/** Pérdidas totales (m) de la instalación a un caudal dado. */
export function systemLossM(pump: Pump, qLph: number): number {
  const ref = pump.frictionRefLph > 0 ? pump.frictionRefLph : 1;
  return pump.staticHeadM.value + pump.frictionM.value * (qLph / ref) ** 2;
}

/** Caudal total (l/h) de los aspersores activos de un escenario si la presión general es p. */
export function systemFlowLph(project: Project, scenario: Scenario, pBar: number): number {
  let lpm = 0;
  for (const s of project.sprinklers) {
    const set = scenario.settings[s.id];
    if (!set?.active) continue;
    if (set.flowOverride) {
      lpm += set.flowOverride.value;
      continue;
    }
    const n = findNozzle(project.nozzles, set.nozzleId);
    if (n) lpm += lookupNozzle(n, s.pressureBar?.value ?? pBar).flowLpm;
  }
  return lpm * 60;
}

export interface OperatingPoint {
  pressureBar: number;
  flowLph: number;
  pumpHeadM: number;
  lossM: number;
  /** false si la bomba no llega a vencer el desnivel y las pérdidas. */
  feasible: boolean;
}

/** Punto de funcionamiento por bisección (la diferencia es monótona decreciente en P). */
export function operatingPoint(project: Project, scenario: Scenario, pumpOverride?: Partial<Pump>): OperatingPoint {
  const pump = { ...project.pump, ...pumpOverride };
  const f = (p: number) => {
    const q = systemFlowLph(project, scenario, p);
    return pumpHead(pump, q) - systemLossM(pump, q) - p * M_PER_BAR;
  };
  let lo = 0.01;
  let hi = Math.max(pumpShutoffHead(pump) / M_PER_BAR, 0.02);
  if (f(lo) <= 0) {
    const q = systemFlowLph(project, scenario, lo);
    return { pressureBar: 0, flowLph: q, pumpHeadM: pumpHead(pump, q), lossM: systemLossM(pump, q), feasible: false };
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const p = (lo + hi) / 2;
  const q = systemFlowLph(project, scenario, p);
  return { pressureBar: p, flowLph: q, pumpHeadM: pumpHead(pump, q), lossM: systemLossM(pump, q), feasible: true };
}

/**
 * Pérdida de carga (m, al caudal de referencia) que hace coincidir el modelo con una
 * presión medida en un escenario. Devuelve null si la medición es incompatible con la
 * curva de la bomba (la curva supuesta no da tanta altura a ese caudal).
 */
export function calibrateFriction(project: Project, scenario: Scenario, measuredBar: number): number | null {
  const pump = project.pump;
  const q = systemFlowLph(project, scenario, measuredBar);
  if (q <= 0) return null;
  const h = pumpHead(pump, q) - pump.staticHeadM.value - measuredBar * M_PER_BAR;
  if (h < 0) return null;
  return h * (pump.frictionRefLph / q) ** 2;
}

/** Presión general que se usa en un escenario: la de la bomba si está activa. */
export function scenarioPressure(project: Project, scenario: Scenario): Sourced<number> {
  if (!project.pump?.enabled) return project.pressureBar;
  const op = operatingPoint(project, scenario);
  const calibratedHere = project.pump.calibration?.scenarioId === scenario.id && project.pump.frictionM.source === 'medido';
  return {
    value: op.pressureBar,
    source: calibratedHere ? 'medido' : 'estimado',
    note: calibratedHere ? 'Presión medida (modelo calibrado).' : 'Calculada con la curva de la bomba.',
  };
}
