import { useState } from 'react';
import {
  BAR_TO_PSI,
  M_PER_BAR,
  calibrateFriction,
  operatingPoint,
  pumpHead,
  pumpShutoffHead,
  systemFlowLph,
  systemLossM,
  type Project,
  type Pump,
} from '../model';
import { Field, NumberInput, SourceSelect, fmt, signed } from './common';

const SERIES = ['#2a78d6', '#eb6834'];

export function PumpEditor({ project, onChange }: { project: Project; onChange: (p: Pump) => void }) {
  const pump = project.pump;
  const [measured, setMeasured] = useState(2.0);
  const [calScenario, setCalScenario] = useState(project.scenarios[0].id);
  const [calMsg, setCalMsg] = useState<string | null>(null);
  const ops = project.scenarios.slice(0, 2).map((s) => operatingPoint(project, s));
  const set = (p: Partial<Pump>) => onChange({ ...pump, ...p });

  return (
    <div className="pump-editor">
      <label className="check">
        <input type="checkbox" checked={pump.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <b>Calcular la presión con la curva de la bomba</b>
      </label>
      {pump.enabled && (
        <>
          <Field label="Bomba">
            <input type="text" value={pump.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nombre de la bomba" />
          </Field>
          <div className="field-label row">
            Curva caudal–altura <SourceSelect value={pump.pointsSource} onChange={(s) => set({ pointsSource: s })} allow={['oficial', 'medido', 'estimado']} />
          </div>
          <table className="results small">
            <thead>
              <tr>
                <th className="num">Caudal (l/h)</th>
                <th className="num">Altura (m)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pump.points.map((pt, i) => (
                <tr key={i}>
                  <td className="num">
                    <NumberInput value={pt.flowLph} step={100} min={0} width={5.5} label="Caudal" onChange={(v) => set({ points: pump.points.map((x, k) => (k === i ? { ...x, flowLph: Math.max(0, v) } : x)) })} />
                  </td>
                  <td className="num">
                    <NumberInput value={pt.headM} step={0.5} min={0} width={4.5} label="Altura" onChange={(v) => set({ points: pump.points.map((x, k) => (k === i ? { ...x, headM: Math.max(0, v) } : x)) })} />
                  </td>
                  <td>
                    {pump.points.length > 2 && (
                      <button className="link danger" onClick={() => set({ points: pump.points.filter((_, k) => k !== i) })}>
                        quitar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link" onClick={() => set({ points: [...pump.points, { flowLph: 0, headM: 0 }] })}>
            + punto de la curva
          </button>
          <p className="field-hint">
            {pump.points.length === 2
              ? 'Con sólo los máximos de placa (caudal a altura 0 y altura a caudal 0) la curva intermedia se supone parabólica: es una estimación. Si la ficha trae la curva, añadir sus puntos.'
              : 'Curva por puntos, interpolada linealmente.'}{' '}
            {pump.pointsNote}
          </p>

          <Field label="Desnivel geométrico" hint="Del nivel del agua (pozo, cisterna) a los aspersores, incluida la aspiración. Positivo si los aspersores están más altos.">
            <NumberInput value={pump.staticHeadM.value} step={0.5} unit="m" onChange={(v) => set({ staticHeadM: { ...pump.staticHeadM, value: v, source: pump.staticHeadM.source === 'faltante' ? 'estimado' : pump.staticHeadM.source } })} />
            <SourceSelect value={pump.staticHeadM.source} onChange={(s) => set({ staticHeadM: { ...pump.staticHeadM, source: s } })} allow={['medido', 'estimado', 'faltante']} />
          </Field>
          <Field label="Pérdidas de carga en tuberías y accesorios" hint="Varían con el cuadrado del caudal. Mejor obtenerlas con «Calibrar» a partir de una presión medida.">
            <NumberInput value={pump.frictionM.value} step={0.5} min={0} unit="m" width={4} onChange={(v) => set({ calibration: null, frictionM: { ...pump.frictionM, value: Math.max(0, v), source: pump.frictionM.source === 'faltante' ? 'estimado' : pump.frictionM.source } })} />
            a <NumberInput value={pump.frictionRefLph} step={100} min={1} unit="l/h" width={5} onChange={(v) => set({ frictionRefLph: Math.max(1, v) })} />
            <SourceSelect value={pump.frictionM.source} onChange={(s) => set({ frictionM: { ...pump.frictionM, source: s } })} allow={['medido', 'estimado', 'faltante']} />
          </Field>

          <div className="card">
            <div className="field-label">Punto de funcionamiento (estimado)</div>
            {ops.map((o, i) => (
              <div key={i}>
                <span className="sw" style={{ background: SERIES[i] }} /> Esc. {i + 1}:{' '}
                {o.feasible ? (
                  <>
                    <b>{fmt(o.pressureBar, 2)} bar</b> ({fmt(o.pressureBar * BAR_TO_PSI, 0)} psi) · {fmt(o.flowLph, 0)} l/h · bomba {fmt(o.pumpHeadM, 1)} m
                  </>
                ) : (
                  <span className="warn">la bomba no vence el desnivel y las pérdidas</span>
                )}
              </div>
            ))}
            {ops.length === 2 && ops[0].feasible && ops[1].feasible && (
              <div className="muted">
                Cambio al pasar al escenario 2: {signed(ops[1].pressureBar - ops[0].pressureBar, 2)} bar, {signed(ops[1].flowLph - ops[0].flowLph, 0)} l/h.
              </div>
            )}
            {pump.staticHeadM.source === 'faltante' && pump.frictionM.source === 'faltante' && (
              <div className="warn">Sin desnivel ni pérdidas: estas presiones son un máximo; la real será menor.</div>
            )}
            <PumpChart project={project} />
          </div>

          <div className="card">
            <div className="field-label">Calibrar con una presión medida</div>
            <p className="field-hint">
              Manómetro a la salida de la bomba o en un aspersor, con los cuatro funcionando. Se ajustan las pérdidas para que el modelo dé esa
              presión; el otro escenario se recalcula con la curva.
            </p>
            <div className="row">
              <NumberInput value={measured} step={0.05} min={0.1} unit="bar" onChange={setMeasured} label="Presión medida" />
              con
              <select value={calScenario} onChange={(e) => setCalScenario(e.target.value)} aria-label="Escenario medido">
                {project.scenarios.slice(0, 2).map((s, i) => (
                  <option key={s.id} value={s.id}>
                    escenario {i + 1}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const sc = project.scenarios.find((s) => s.id === calScenario)!;
                  const f = calibrateFriction(project, sc, measured);
                  if (f === null) {
                    setCalMsg(
                      `Con la curva y el desnivel actuales la bomba no puede dar ${fmt(measured, 2)} bar a ese caudal. Revisar la curva (añadir puntos de la ficha), el desnivel o la medición.`,
                    );
                    return;
                  }
                  setCalMsg(`Pérdidas calibradas: ${fmt(f, 2)} m a ${fmt(pump.frictionRefLph, 0)} l/h.`);
                  set({ frictionM: { value: +f.toFixed(3), source: 'medido', note: 'Calibrada con presión medida.' }, calibration: { scenarioId: sc.id, measuredBar: measured } });
                }}
              >
                Calibrar
              </button>
            </div>
            {pump.calibration && (
              <div className="muted">
                Calibrado con {fmt(pump.calibration.measuredBar, 2)} bar medidos en el escenario{' '}
                {project.scenarios.findIndex((s) => s.id === pump.calibration!.scenarioId) + 1}.
              </div>
            )}
            {calMsg && <div className="muted">{calMsg}</div>}
          </div>
        </>
      )}
    </div>
  );
}

/** Curva de la bomba y curvas de demanda de los dos escenarios (altura en m frente a caudal en l/h). */
function PumpChart({ project }: { project: Project }) {
  const pump = project.pump;
  const W = 300;
  const H = 170;
  const m = { l: 34, r: 8, t: 8, b: 30 };
  const qMax = Math.max(...pump.points.map((p) => p.flowLph), 1);
  const hMax = Math.max(pumpShutoffHead(pump), 1) * 1.05;
  const sx = (q: number) => m.l + (q / qMax) * (W - m.l - m.r);
  const sy = (h: number) => H - m.b - (h / hMax) * (H - m.t - m.b);
  const n = 40;
  const pumpPath = Array.from({ length: n + 1 }, (_, i) => {
    const q = (i / n) * qMax;
    return `${i ? 'L' : 'M'} ${sx(q).toFixed(1)} ${sy(Math.max(0, pumpHead(pump, q))).toFixed(1)}`;
  }).join(' ');
  const demand = project.scenarios.slice(0, 2).map((sc) => {
    const pts: string[] = [];
    const pTop = hMax / M_PER_BAR;
    for (let i = 0; i <= n; i++) {
      const p = (i / n) * pTop;
      const q = systemFlowLph(project, sc, p);
      const h = systemLossM(pump, q) + p * M_PER_BAR;
      if (h > hMax || q > qMax) break;
      pts.push(`${pts.length ? 'L' : 'M'} ${sx(q).toFixed(1)} ${sy(h).toFixed(1)}`);
    }
    return { d: pts.join(' '), op: operatingPoint(project, sc) };
  });
  const xt = [0, 0.25, 0.5, 0.75, 1].map((t) => t * qMax);
  const yt = [0, 10, 20, 30].filter((h) => h <= hMax);
  return (
    <figure className="pump-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de la bomba y punto de funcionamiento de cada escenario">
        {yt.map((h) => (
          <g key={h}>
            <line x1={m.l} x2={W - m.r} y1={sy(h)} y2={sy(h)} className="chart-grid" />
            <text x={m.l - 4} y={sy(h) + 3} textAnchor="end" className="chart-tick">
              {h}
            </text>
          </g>
        ))}
        {xt.map((q) => (
          <text key={q} x={sx(q)} y={H - m.b + 12} textAnchor="middle" className="chart-tick">
            {fmt(q / 1000, 1)}
          </text>
        ))}
        <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} className="chart-axis" />
        <text x={W - m.r} y={H - 3} textAnchor="end" className="chart-tick">
          caudal (m³/h)
        </text>
        <text x={4} y={m.t + 2} className="chart-tick" dominantBaseline="hanging">
          m
        </text>
        <path d={pumpPath} className="chart-pump" />
        {demand.map((d, i) => (
          <g key={i}>
            <path d={d.d} fill="none" stroke={SERIES[i]} strokeWidth={2} strokeDasharray={i ? '5 3' : undefined} />
            {d.op.feasible && <circle cx={sx(d.op.flowLph)} cy={sy(d.op.pumpHeadM)} r={4} fill={SERIES[i]} className="chart-dot" />}
          </g>
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="line-key pump-key" /> bomba
        </span>
        <span>
          <i className="line-key" style={{ background: SERIES[0] }} /> demanda esc. 1
        </span>
        <span>
          <i className="line-key" style={{ background: SERIES[1] }} /> demanda esc. 2
        </span>
      </figcaption>
    </figure>
  );
}
