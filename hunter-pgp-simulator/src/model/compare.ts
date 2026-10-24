import { GENERIC_ROTOR_POINTS, PROFILE_LABELS } from './profiles';
import { simulate, type SimResult } from './simulate';
import type { Project, RadialProfile, Scenario } from './types';

export interface ScenarioDelta {
  cu: number;
  dulq: number;
  cv: number;
  mean: number;
  pctBelow80: number;
  pctAbove120: number;
  cornerMean: number | null;
  totalFlowLpm: number;
}

/** Diferencias B − A de los indicadores principales. */
export function deltas(a: SimResult, b: SimResult): ScenarioDelta {
  return {
    cu: b.lawn.cu - a.lawn.cu,
    dulq: b.lawn.dulq - a.lawn.dulq,
    cv: b.lawn.cv - a.lawn.cv,
    mean: b.lawn.mean - a.lawn.mean,
    pctBelow80: b.lawn.pctBelow80 - a.lawn.pctBelow80,
    pctAbove120: b.lawn.pctAbove120 - a.lawn.pctAbove120,
    cornerMean: a.corner && b.corner ? b.corner.mean - a.corner.mean : null,
    totalFlowLpm: b.balance.totalFlowLpm - a.balance.totalFlowLpm,
  };
}

export interface SensitivityRow {
  label: string;
  group: 'perfil' | 'presión';
  a: { cu: number; dulq: number; mean: number };
  b: { cu: number; dulq: number; mean: number };
  /** Signo de la mejora de DUlq de B respecto de A: 1 mejora, -1 empeora, 0 ≈ igual. */
  verdict: -1 | 0 | 1;
}

/** Umbral por debajo del cual una diferencia de DUlq se considera indistinguible. */
export const DU_TIE = 0.02;

/**
 * Repite la comparación A/B variando los supuestos no verificados (forma del perfil
 * radial y presión de trabajo). Si el signo de la diferencia cambia según el
 * supuesto, la conclusión no es fiable hasta medir ese dato.
 */
export function sensitivity(project: Project, a: Scenario, b: Scenario, cellM = 0.2): SensitivityRow[] {
  const rows: SensitivityRow[] = [];
  const opts = { cellM };
  const profiles: { label: string; p: RadialProfile }[] = [
    { label: PROFILE_LABELS.uniforme, p: { kind: 'uniforme', plateau: 0.6, points: [], source: 'estimado' } },
    { label: PROFILE_LABELS.triangular, p: { kind: 'triangular', plateau: 0.6, points: [], source: 'estimado' } },
    { label: 'Trapezoidal, meseta 60 %', p: { kind: 'trapezoidal', plateau: 0.6, points: [], source: 'estimado' } },
    { label: 'Rotor genérico (tabla por defecto)', p: { kind: 'tabla', plateau: 0.6, points: [...GENERIC_ROTOR_POINTS], source: 'estimado' } },
  ];
  const push = (label: string, group: SensitivityRow['group'], ra: SimResult, rb: SimResult) => {
    const d = rb.lawn.dulq - ra.lawn.dulq;
    rows.push({
      label,
      group,
      a: { cu: ra.lawn.cu, dulq: ra.lawn.dulq, mean: ra.lawn.mean },
      b: { cu: rb.lawn.cu, dulq: rb.lawn.dulq, mean: rb.lawn.mean },
      verdict: Math.abs(d) < DU_TIE ? 0 : d > 0 ? 1 : -1,
    });
  };
  for (const { label, p } of profiles) {
    push(label, 'perfil', simulate(project, a, opts, p), simulate(project, b, opts, p));
  }
  if (project.pump.enabled) {
    // Con bomba, lo desconocido son las pérdidas de la instalación: se varían y la
    // presión de cada escenario se recalcula con la curva de la bomba.
    for (const m of [0, 3, 6, 10]) {
      const proj: Project = { ...project, pump: { ...project.pump, frictionM: { value: m, source: 'estimado' } } };
      push(`Bomba con ${m} m de pérdidas a ${project.pump.frictionRefLph} l/h (perfil actual)`, 'presión', simulate(proj, a, opts), simulate(proj, b, opts));
    }
  } else {
    for (const bar of [2.0, 2.5, 3.0, 3.5]) {
      // Sólo varía la presión general; las presiones propias de cada aspersor se respetan.
      const proj: Project = { ...project, pressureBar: { ...project.pressureBar, value: bar } };
      push(`Presión general ${bar.toFixed(1)} bar (perfil actual)`, 'presión', simulate(proj, a, opts), simulate(proj, b, opts));
    }
  }
  return rows;
}

/**
 * - 'mejora' / 'empeora': ningún supuesto da el signo contrario (puede haber empates).
 * - 'empate': la diferencia es indistinguible en todos los supuestos.
 * - 'depende': unos supuestos dan mejora y otros empeora → hace falta medir.
 */
export type Robustness = 'mejora' | 'empeora' | 'empate' | 'depende';

export function robustness(rows: SensitivityRow[]): Robustness {
  const up = rows.some((r) => r.verdict === 1);
  const down = rows.some((r) => r.verdict === -1);
  if (up && down) return 'depende';
  if (up) return 'mejora';
  if (down) return 'empeora';
  return 'empate';
}
