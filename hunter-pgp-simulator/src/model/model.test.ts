import { describe, expect, it } from 'vitest';
import {
  defaultProject,
  findNozzle,
  lookupNozzle,
  profileMoment,
  resolveSprinkler,
  segmentHitsRect,
  simulate,
  transformLayout,
  normalizedToMeters,
  computeStats,
  operatingPoint,
  pumpHead,
  systemFlowLph,
  systemLossM,
  calibrateFriction,
  M_PER_BAR,
  type Project,
  type RadialProfile,
} from './index';

const uniform: RadialProfile = { kind: 'uniforme', plateau: 0.6, points: [], source: 'estimado' };

describe('tablas de boquillas', () => {
  it('reproduce las filas originales al convertirlas', () => {
    const sr1 = findNozzle(defaultProject().nozzles, 'sr-1.0')!;
    const at40 = lookupNozzle(sr1, 40 * 0.0689476);
    expect(at40.status).toBe('tabla');
    expect(at40.flowLpm).toBeCloseTo(0.9 * 3.78541, 6);
    expect(at40.radiusM).toBeCloseTo(17 * 0.3048, 6);
  });

  it('la precipitación publicada por Hunter es coherente con 96,3·GPM·2/R² (180°, cuadrado)', () => {
    // Comprobación de transcripción: in/h de la tabla US de 1.0 SR y 2.0 SR
    const rows: [number, number, number][] = [
      [0.78, 17, 0.52], [0.9, 17, 0.6], [1.0, 18, 0.59], [1.1, 19, 0.59],
      [1.4, 17, 0.93], [1.7, 17, 1.13], [2.0, 18, 1.19], [2.2, 19, 1.17],
      [2.8, 29, 0.64], [3.8, 37, 0.53],
    ];
    for (const [gpm, ft, inh] of rows) expect((96.3 * gpm * 2) / (ft * ft)).toBeCloseTo(inh, 1);
  });

  it('interpola linealmente y marca la extrapolación', () => {
    const la = findNozzle(defaultProject().nozzles, 'la-3.5')!;
    const lo = la.table[1];
    const hi = la.table[2];
    const mid = lookupNozzle(la, (lo.pressureBar + hi.pressureBar) / 2);
    expect(mid.flowLpm).toBeCloseTo((lo.flowLpm + hi.flowLpm) / 2, 6);
    const ext = lookupNozzle(la, 6);
    expect(ext.status).toBe('extrapolado');
    const last = la.table[la.table.length - 1];
    expect(ext.flowLpm).toBeCloseTo(last.flowLpm * Math.sqrt(6 / last.pressureBar), 6);
  });
});

describe('perfil radial', () => {
  it('momento del perfil uniforme = 1/2 y triangular = 1/6', () => {
    expect(profileMoment(uniform)).toBeCloseTo(0.5, 6);
    expect(profileMoment({ ...uniform, kind: 'triangular' })).toBeCloseTo(1 / 6, 6);
  });

  it('con perfil uniforme la intensidad es 60·Q/A', () => {
    const p = defaultProject();
    const s = { ...p.sprinklers[0], profile: uniform };
    const e = resolveSprinkler(p, s, p.scenarios[0]);
    expect(e.k).toBeCloseTo((60 * e.flowLpm) / e.areaM2, 6);
    expect(e.idealPrecipMmH).toBeCloseTo(e.k, 6);
  });
});

describe('simulación', () => {
  function single(profile: RadialProfile): Project {
    const p = defaultProject();
    p.geometry = {
      sectors: [{ id: 's', name: 's', x: -20, y: -20, w: 40, h: 40 }],
      obstacles: [],
      sectorsSource: 'estimado',
      obstaclesSource: 'estimado',
    };
    p.sprinklers = [{ ...p.sprinklers[0], x: 0, y: 0, dirDeg: 0, arcDeg: 360, profile }];
    p.scenarios = [{ id: 'x', name: 'x', settings: { A: { active: true, nozzleId: 'sr-2.0', flowOverride: null, radiusOverride: null } } }];
    p.options = { ...p.options, cellM: 0.05, obstacleShadow: false };
    return p;
  }

  it('conserva el volumen: ∬P dA ≈ 60·Q para cualquier perfil', () => {
    for (const prof of [uniform, { ...uniform, kind: 'triangular' as const }, defaultProject().sprinklers[0].profile]) {
      const p = single(prof);
      const r = simulate(p, p.scenarios[0]);
      let vol = 0;
      for (const v of r.grid.precip) vol += v * r.grid.cell * r.grid.cell;
      const q = r.effective[0].flowLpm;
      expect(vol / (60 * q)).toBeGreaterThan(0.98);
      expect(vol / (60 * q)).toBeLessThan(1.02);
    }
  });

  it('la construcción no cuenta como césped y recibe 0 en la estadística', () => {
    const p = defaultProject();
    const r = simulate(p, p.scenarios[0], { cellM: 0.25 });
    // 100 m² + 25 m² de césped, sin la construcción
    expect(r.lawn.areaM2).toBeCloseTo(125, 0);
    const fr = r.balance.onLawn + r.balance.onObstacle + r.balance.outside;
    expect(fr).toBeCloseTo(1, 6);
  });

  it('con presión fija, el escenario 2 sólo difiere en el caudal de E', () => {
    const p = defaultProject();
    p.pump.enabled = false;
    const r1 = simulate(p, p.scenarios[0], { cellM: 0.25 });
    const r2 = simulate(p, p.scenarios[1], { cellM: 0.25 });
    const e1 = r1.effective.find((e) => e.id === 'E')!;
    const e2 = r2.effective.find((e) => e.id === 'E')!;
    expect(e2.flowLpm).toBeGreaterThan(e1.flowLpm);
    expect(r2.balance.totalFlowLpm - r1.balance.totalFlowLpm).toBeCloseTo(e2.flowLpm - e1.flowLpm, 6);
  });
});

describe('geometría', () => {
  it('detecta segmentos que cruzan un rectángulo', () => {
    const r = { x: 0, y: 0, w: 1, h: 1 };
    expect(segmentHitsRect({ x: -1, y: 0.5 }, { x: 2, y: 0.5 }, r)).toBe(true);
    expect(segmentHitsRect({ x: -1, y: 2 }, { x: 2, y: 2 }, r)).toBe(false);
    // a lo largo de la arista no bloquea
    expect(segmentHitsRect({ x: -1, y: 0 }, { x: 2, y: 0 }, r)).toBe(false);
  });

  it('cuatro rotaciones de 90° devuelven el trazado original', () => {
    const p = defaultProject();
    let g = p.geometry;
    let s = p.sprinklers;
    for (let i = 0; i < 4; i++) ({ geometry: g, sprinklers: s } = transformLayout(g, s, 'rotar90'));
    expect(g.sectors[1]).toMatchObject({ x: 10, y: 5, w: 5, h: 5 });
    expect(s[3].x).toBeCloseTo(p.sprinklers[3].x, 6);
    expect(s[3].dirDeg).toBeCloseTo(p.sprinklers[3].dirDeg, 6);
  });

  it('mapea el plano normalizado con la hipótesis 15×10 m', () => {
    const p = defaultProject();
    expect(normalizedToMeters(p.frame, { x: 100, y: 49 })).toEqual({ x: 15, y: 4.9 });
  });
});

describe('indicadores', () => {
  it('CU y DUlq de un reparto uniforme valen 1', () => {
    const s = computeStats([5, 5, 5, 5]);
    expect(s.cu).toBe(1);
    expect(s.dulq).toBe(1);
  });
  it('CU de Christiansen y DUlq de un caso conocido', () => {
    const s = computeStats([2, 4, 6, 8]);
    // media 5, Σ|x−m| = 8 → CU = 1 − 8/20 = 0,6 ; cuarto inferior = 2 → DU = 0,4
    expect(s.cu).toBeCloseTo(0.6, 9);
    expect(s.dulq).toBeCloseTo(0.4, 9);
    expect(s.pctBelow80).toBeCloseTo(0.25, 9); // sólo 2 < 4
    expect(s.pctAbove120).toBeCloseTo(0.25, 9); // sólo 8 > 6
  });
});

describe('bomba', () => {
  it('curva parabólica entre los máximos de placa', () => {
    const p = defaultProject();
    expect(pumpHead(p.pump, 0)).toBe(28);
    expect(pumpHead(p.pump, 5700)).toBeCloseTo(0, 9);
    expect(pumpHead(p.pump, 2850)).toBeCloseTo(21, 9);
  });

  it('el punto de funcionamiento cumple H_bomba(Q) = pérdidas + P', () => {
    const p = defaultProject();
    p.pump.staticHeadM.value = 2;
    p.pump.frictionM.value = 4;
    for (const sc of p.scenarios) {
      const op = operatingPoint(p, sc);
      expect(op.feasible).toBe(true);
      const q = systemFlowLph(p, sc, op.pressureBar);
      expect(pumpHead(p.pump, q)).toBeCloseTo(systemLossM(p.pump, q) + op.pressureBar * M_PER_BAR, 4);
    }
  });

  it('más caudal en E baja la presión de todos', () => {
    const p = defaultProject();
    const p1 = operatingPoint(p, p.scenarios[0]);
    const p2 = operatingPoint(p, p.scenarios[1]);
    expect(p2.flowLph).toBeGreaterThan(p1.flowLph);
    expect(p2.pressureBar).toBeLessThan(p1.pressureBar);
  });

  it('calibrar con una presión medida reproduce esa presión', () => {
    const p = defaultProject();
    const f = calibrateFriction(p, p.scenarios[0], 2.0)!;
    expect(f).toBeGreaterThan(0);
    p.pump.frictionM = { value: f, source: 'medido' };
    expect(operatingPoint(p, p.scenarios[0]).pressureBar).toBeCloseTo(2.0, 4);
  });

  it('una medición imposible para la curva no se calibra', () => {
    const p = defaultProject();
    expect(calibrateFriction(p, p.scenarios[0], 2.9)).toBeNull();
  });
});
