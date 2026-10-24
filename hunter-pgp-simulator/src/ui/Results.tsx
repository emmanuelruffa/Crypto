import { DU_TIE, deltas, robustness, type ReadinessItem, type SensitivityRow, type SimResult, type Stats } from '../model';
import { SourceBadge, fmt, pct, signed } from './common';
import { sprinklerColor } from './GardenView';

type Better = 'up' | 'down' | 'none';

interface Row {
  label: string;
  get: (r: SimResult) => number | null;
  fmt: (v: number) => string;
  dfmt?: (v: number) => string;
  better: Better;
  hint?: string;
}

const cornerRatio = (r: SimResult) => (r.corner && r.lawn.mean > 0 ? r.corner.mean / r.lawn.mean : null);

function sectorStat(i: number, k: keyof Stats) {
  return (r: SimResult) => (r.bySector[i] ? (r.bySector[i].stats[k] as number) : null);
}

export function ResultsTable({ results, targetMm, cornerR }: { results: SimResult[]; targetMm: number; cornerR: number }) {
  const [a, b] = results;
  const names = a.bySector.map((s) => s.name);
  const rows: Row[] = [
    { label: 'Presión general de trabajo', get: (r) => r.pressure.value, fmt: (v) => `${fmt(v, 2)} bar`, dfmt: (v) => `${signed(v, 2)} bar`, better: 'none', hint: 'Fija, o calculada con la curva de la bomba si está activa' },
    { label: 'Caudal total del sistema', get: (r) => r.balance.totalFlowLpm, fmt: (v) => `${fmt(v, 2)} l/min (${fmt(v * 0.06, 2)} m³/h)`, dfmt: (v) => `${signed(v, 2)} l/min`, better: 'none' },
    { label: 'Precipitación media en el césped', get: (r) => r.lawn.mean, fmt: (v) => `${fmt(v)} mm/h`, better: 'none' },
    { label: 'Precipitación mínima', get: (r) => r.lawn.min, fmt: (v) => `${fmt(v)} mm/h`, better: 'up' },
    { label: 'Precipitación máxima', get: (r) => r.lawn.max, fmt: (v) => `${fmt(v)} mm/h`, better: 'down' },
    { label: 'Desviación estándar', get: (r) => r.lawn.sd, fmt: (v) => `${fmt(v)} mm/h`, better: 'down' },
    { label: 'Coeficiente de variación (CV)', get: (r) => r.lawn.cv, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    { label: 'Uniformidad de Christiansen (CU)', get: (r) => r.lawn.cu, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'up', hint: 'CU = 1 − Σ|Pᵢ − P̄| / (n·P̄)' },
    { label: 'Uniformidad del cuarto inferior (DUlq)', get: (r) => r.lawn.dulq, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'up', hint: 'DUlq = media del 25 % más seco / media' },
    { label: 'Césped con < 80 % de la media', get: (r) => r.lawn.pctBelow80, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    { label: 'Césped con > 120 % de la media', get: (r) => r.lawn.pctAbove120, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    { label: 'Césped sin riego (0 mm/h)', get: (r) => r.lawn.pctDry, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    ...names.flatMap((n, i): Row[] => [
      { label: `${n}: media`, get: sectorStat(i, 'mean'), fmt: (v) => `${fmt(v)} mm/h`, better: 'none' },
      { label: `${n}: DUlq`, get: sectorStat(i, 'dulq'), fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'up' },
    ]),
    { label: `Zona de E (r ≤ ${fmt(cornerR)} m): media`, get: (r) => r.corner?.mean ?? null, fmt: (v) => `${fmt(v)} mm/h`, better: 'none' },
    { label: `Zona de E: media / media del césped`, get: cornerRatio, fmt: (v) => `${fmt(v, 2)}×`, dfmt: (v) => signed(v, 2), better: 'none', hint: 'Valores > 1,2 indican exceso local en la esquina junto a la construcción' },
    { label: 'Zona de E: máxima', get: (r) => r.corner?.max ?? null, fmt: (v) => `${fmt(v)} mm/h`, better: 'down' },
    { label: 'Agua que cae sobre el césped', get: (r) => r.balance.onLawn, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'up' },
    { label: 'Agua sobre la construcción o interceptada', get: (r) => r.balance.onObstacle, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    { label: 'Agua fuera del césped (caminos, muros…)', get: (r) => r.balance.outside, fmt: (v) => pct(v, 1), dfmt: (v) => `${signed(v * 100, 1)} pt`, better: 'down' },
    { label: `Tiempo para aplicar ${fmt(targetMm, 0)} mm al cuarto más seco`, get: (r) => r.runtimeMinForTarget, fmt: (v) => `${fmt(v, 0)} min`, dfmt: (v) => `${signed(v, 0)} min`, better: 'none' },
    { label: 'Volumen por riego con ese tiempo', get: (r) => r.volumePerCycleL, fmt: (v) => `${fmt(v, 0)} l`, dfmt: (v) => `${signed(v, 0)} l`, better: 'none' },
  ];

  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            <th>Indicador (resultado simulado)</th>
            {results.map((r, i) => (
              <th key={r.scenarioId} className="num">
                Esc. {i + 1}
              </th>
            ))}
            {b && <th className="num">Δ (2 − 1)</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const va = row.get(a);
            const vb = b ? row.get(b) : null;
            const d = va !== null && vb !== null ? vb - va : null;
            let cls = '';
            let word = '';
            const dText = d === null ? '—' : (row.dfmt ?? ((v: number) => signed(v)))(d);
            // sin calificativo si la diferencia redondeada es nula
            if (d !== null && row.better !== 'none' && !/^[±+−]0(,0+)?( |$)/.test(dText)) {
              const good = row.better === 'up' ? d > 0 : d < 0;
              cls = good ? 'better' : 'worse';
              word = good ? 'mejor' : 'peor';
            }
            return (
              <tr key={row.label}>
                <td title={row.hint}>
                  {row.label}
                  {row.hint && <span className="hint-dot"> ⓘ</span>}
                </td>
                <td className="num">{va === null ? '—' : row.fmt(va)}</td>
                {b && <td className="num">{vb === null ? '—' : row.fmt(vb)}</td>}
                {b && (
                  <td className={`num ${cls}`}>
                    {dText}
                    {word && <span className="delta-word"> {word}</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SprinklerTable({ results, names }: { results: SimResult[]; names: string[] }) {
  return (
    <div className="table-wrap">
      <table className="results">
        <thead>
          <tr>
            <th>Esc.</th>
            <th>Aspersor</th>
            <th>Boquilla</th>
            <th className="num">Presión</th>
            <th className="num">Caudal Q</th>
            <th className="num">Radio R</th>
            <th className="num">Arco</th>
            <th className="num">Área A</th>
            <th className="num" title="Precipitación media idealizada sobre su propio sector: Pᵢ = 60·Q/A">
              Pᵢ = 60·Q/A ⓘ
            </th>
          </tr>
        </thead>
        <tbody>
          {results.flatMap((r, i) =>
            r.effective.map((e) => (
              <tr key={`${r.scenarioId}-${e.id}`} className={e.active ? '' : 'inactive'}>
                <td>{i + 1}</td>
                <td>
                  <span className="sw" style={{ background: sprinklerColor(e.id) }} /> {e.label}
                  {!e.active && <span className="muted"> (inactivo)</span>}
                </td>
                <td>{e.nozzleLabel}</td>
                <td className="num">
                  {fmt(e.pressureBar, 2)} bar <SourceBadge source={e.pressureSource} />
                </td>
                <td className="num">
                  {fmt(e.flowLpm, 2)} l/min <SourceBadge source={e.flowSource} title={e.tableStatus === 'extrapolado' ? 'Fuera del rango de la tabla: extrapolado' : undefined} />
                </td>
                <td className="num">
                  {fmt(e.radiusM, 2)} m <SourceBadge source={e.radiusSource} />
                </td>
                <td className="num">{fmt(e.arcDeg, 0)}°</td>
                <td className="num">{fmt(e.areaM2, 1)} m²</td>
                <td className="num">
                  <b>{fmt(e.idealPrecipMmH, 1)}</b> mm/h
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p className="note">
        Pᵢ es la precipitación media idealizada de cada aspersor sobre su propio sector circular (reparto uniforme), útil para comprobar el
        equilibrio de precipitaciones entre rotores de distinto arco. No es la distribución real; el mapa usa el perfil radial configurado.{' '}
        {names.length > 1 && 'Las filas se agrupan por escenario.'}
      </p>
    </div>
  );
}

const VERDICT: Record<-1 | 0 | 1, string> = { 1: 'Esc. 2 más uniforme', 0: 'sin diferencia apreciable', [-1]: 'Esc. 1 más uniforme' };

export function SensitivityPanel({ rows, busy }: { rows: SensitivityRow[] | null; busy: boolean }) {
  if (!rows) return <p className="muted">{busy ? 'Calculando…' : 'Sin calcular.'}</p>;
  const rob = robustness(rows);
  const msg = {
    mejora: 'En todos los supuestos ensayados el escenario 2 iguala o mejora el DUlq del escenario 1.',
    empeora: 'En todos los supuestos ensayados el escenario 2 iguala o empeora el DUlq del escenario 1.',
    empate: 'En ningún supuesto la diferencia de DUlq supera el umbral de empate.',
    depende: 'El signo de la diferencia cambia según el supuesto: la comparación depende de datos que aún no se han medido.',
  }[rob];
  return (
    <div>
      <p className={`robust robust-${rob}`}>{msg}</p>
      <div className="table-wrap">
        <table className="results">
          <thead>
            <tr>
              <th>Supuesto (aplicado a todos los aspersores)</th>
              <th className="num">DUlq 1</th>
              <th className="num">DUlq 2</th>
              <th className="num">CU 1</th>
              <th className="num">CU 2</th>
              <th>Lectura</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{pct(r.a.dulq, 1)}</td>
                <td className="num">{pct(r.b.dulq, 1)}</td>
                <td className="num">{pct(r.a.cu, 1)}</td>
                <td className="num">{pct(r.b.cu, 1)}</td>
                <td>{VERDICT[r.verdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Cuadrícula de 20 cm: los valores absolutos pueden diferir algo del cálculo principal; lo relevante es la diferencia entre escenarios. Diferencias de DUlq menores de {fmt(DU_TIE * 100, 0)} puntos se consideran empate. Las filas de presión o de pérdidas de la
        bomba usan el perfil configurado; las de perfil usan la presión configurada.
      </p>
    </div>
  );
}

const STATUS_ICON = { ok: '✔', parcial: '◐', falta: '✖' } as const;
const STATUS_TXT = { ok: 'disponible', parcial: 'parcial', falta: 'falta' } as const;

export function ReadinessPanel({ items, score }: { items: ReadinessItem[]; score: number }) {
  return (
    <div>
      <div className="score">
        <div className="score-bar">
          <div style={{ width: `${score * 100}%` }} />
        </div>
        <span>
          Datos verificados: <b>{pct(score)}</b> (ponderado por su influencia en la comparación)
        </span>
      </div>
      <ul className="readiness">
        {items.map((it) => (
          <li key={it.id} className={`st-${it.status}`}>
            <span className="st-icon" aria-hidden>
              {STATUS_ICON[it.status]}
            </span>
            <div>
              <div>
                <b>{it.label}</b> <span className={`st-tag st-tag-${it.status}`}>{STATUS_TXT[it.status]}</span>
                {it.weight === 3 && <span className="crit"> crítico</span>}
              </div>
              <div className="muted">{it.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lectura factual de la comparación. No emite una recomendación automática. */
export function Interpretation({
  a,
  b,
  rows,
  score,
  focusId,
  pumpName,
}: {
  a: SimResult;
  b: SimResult;
  rows: SensitivityRow[] | null;
  score: number;
  focusId: string;
  pumpName?: string;
}) {
  const d = deltas(a, b);
  const ea = a.effective.find((e) => e.id === focusId);
  const eb = b.effective.find((e) => e.id === focusId);
  const others = a.effective.filter((e) => e.id !== focusId && e.active);
  const pMin = Math.min(...others.map((e) => e.idealPrecipMmH));
  const pMax = Math.max(...others.map((e) => e.idealPrecipMmH));
  const rob = rows ? robustness(rows) : null;
  const ratioA = a.corner && a.lawn.mean > 0 ? a.corner.mean / a.lawn.mean : null;
  const ratioB = b.corner && b.lawn.mean > 0 ? b.corner.mean / b.lawn.mean : null;
  const duWord = Math.abs(d.dulq) < DU_TIE ? 'prácticamente no cambia' : d.dulq > 0 ? 'mejora' : 'empeora';
  return (
    <div className="interpretation">
      <p className="sim-warning">
        Todo lo que sigue son <b>resultados simulados</b> con los datos y supuestos actuales, no mediciones. Con un {pct(score)} de datos
        verificados, deben leerse como hipótesis a confirmar.
      </p>
      <ul>
        {ea && eb && (
          <li>
            Aspersor {focusId}: {ea.nozzleLabel} → {eb.nozzleLabel}. Caudal {fmt(ea.flowLpm, 2)} → {fmt(eb.flowLpm, 2)} l/min; precipitación
            idealizada sobre su sector {fmt(ea.idealPrecipMmH)} → {fmt(eb.idealPrecipMmH)} mm/h, frente a {fmt(pMin)}–{fmt(pMax)} mm/h de los
            demás aspersores activos.
          </li>
        )}
        {pumpName && (
          <li>
            Con la bomba {pumpName}, al pasar a la 2.0 el caudal total sube y la presión general baja de {fmt(a.pressure.value, 2)} a{' '}
            {fmt(b.pressure.value, 2)} bar ({signed(b.pressure.value - a.pressure.value, 2)} bar), lo que reduce algo el caudal y el radio de
            los demás aspersores
            {(() => {
              const ra = a.effective.find((e) => e.id !== focusId && e.active);
              const rb = b.effective.find((e) => e.id === ra?.id);
              return ra && rb ? ` (p. ej. ${ra.label}: radio ${fmt(ra.radiusM, 2)} → ${fmt(rb.radiusM, 2)} m)` : '';
            })()}
            . Ya está incluido en el mapa y en los indicadores.
          </li>
        )}
        <li>
          DUlq de todo el césped: {pct(a.lawn.dulq, 1)} → {pct(b.lawn.dulq, 1)} ({duWord}). CU: {pct(a.lawn.cu, 1)} → {pct(b.lawn.cu, 1)}.
        </li>
        <li>
          Precipitación media del césped: {fmt(a.lawn.mean)} → {fmt(b.lawn.mean)} mm/h. Superficie con menos del 80 % de la media:{' '}
          {pct(a.lawn.pctBelow80, 1)} → {pct(b.lawn.pctBelow80, 1)}; con más del 120 %: {pct(a.lawn.pctAbove120, 1)} →{' '}
          {pct(b.lawn.pctAbove120, 1)}.
        </li>
        {ratioA !== null && ratioB !== null && (
          <li>
            Zona de la esquina de {focusId}: recibe {fmt(ratioA, 2)}× la media del césped en el escenario 1 y {fmt(ratioB, 2)}× en el escenario
            2 (máximo local {fmt(a.corner!.max)} → {fmt(b.corner!.max)} mm/h).
          </li>
        )}
        <li>
          Césped fuera del alcance de todos los aspersores: {pct(a.lawn.pctDry, 1)} → {pct(b.lawn.pctDry, 1)}. Estas zonas bajan el DUlq de
          ambos escenarios; cambiar la boquilla de {focusId} sólo las afecta si quedan dentro de su alcance.
        </li>
        <li>
          Caudal total: {fmt(a.balance.totalFlowLpm, 2)} → {fmt(b.balance.totalFlowLpm, 2)} l/min ({signed(d.totalFlowLpm, 2)}).{' '}
          {pumpName
            ? 'La caída de presión depende de las pérdidas de la instalación, que aún no se conocen: medir la presión con los cuatro en marcha y calibrar.'
            : 'Un caudal mayor puede bajar la presión de todos los aspersores si la alimentación está al límite; con la presión fija ese efecto no está en el modelo (activar la bomba en «Escenarios»).'}
        </li>
        {rob && (
          <li>
            Sensibilidad:{' '}
            {rob === 'depende'
              ? 'la conclusión cambia según el perfil radial o la presión supuestos; no es fiable hasta medirlos.'
              : rob === 'empate'
                ? 'en ningún supuesto ensayado hay una diferencia de DUlq apreciable.'
                : `el sentido del cambio de DUlq (${rob === 'mejora' ? 'mejora' : 'empeora'} con el escenario 2) se mantiene en todos los supuestos ensayados; la magnitud sigue dependiendo de los datos pendientes.`}
          </li>
        )}
      </ul>
    </div>
  );
}
