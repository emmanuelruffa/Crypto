import {
  BAR_TO_PSI,
  PROFILE_LABELS,
  GENERIC_ROTOR_POINTS,
  bestInwardDirection,
  findNozzle,
  lookupNozzle,
  metersToNormalized,
  resolveSprinkler,
  scenarioPressure,
  type DataSource,
  type Geometry,
  type NormalizedFrame,
  type Obstacle,
  type ProfileKind,
  type Project,
  type RadialProfile,
  type Scenario,
  type Sector,
  type SimOptions,
  type Sourced,
  type Sprinkler,
  type SprinklerSetting,
} from '../model';
import { Field, NumberInput, SourceBadge, SourceSelect, fmt } from './common';
import { sprinklerColor } from './GardenView';

// ---------------------------------------------------------------- presión

export function PressureEditor({ value, onChange }: { value: Sourced<number>; onChange: (v: Sourced<number>) => void }) {
  return (
    <Field
      label="Presión de trabajo general"
      hint={
        <>
          ≈ {fmt(value.value * BAR_TO_PSI, 0)} psi · {value.note ?? ''} Rango recomendado PGP Ultra: 1,7–4,8 bar (25–70 psi).
        </>
      }
    >
      <NumberInput value={value.value} step={0.05} min={0.5} max={7} unit="bar" onChange={(v) => onChange({ ...value, value: v })} label="Presión" />
      <SourceSelect value={value.source} onChange={(s) => onChange({ ...value, source: s })} allow={['medido', 'estimado']} />
    </Field>
  );
}

// ----------------------------------------------------- ajustes por escenario

function OverrideInput({
  label,
  unit,
  tableValue,
  tableSource,
  value,
  onChange,
  step,
}: {
  label: string;
  unit: string;
  tableValue: number;
  tableSource: DataSource;
  value: Sourced<number> | null;
  onChange: (v: Sourced<number> | null) => void;
  step: number;
}) {
  return (
    <div className="override">
      <span className="field-label">{label}</span>
      {value ? (
        <>
          <NumberInput value={value.value} step={step} min={0} unit={unit} onChange={(v) => onChange({ ...value, value: v })} label={label} />
          <SourceSelect value={value.source} onChange={(s) => onChange({ ...value, source: s })} allow={['medido', 'estimado']} />
          <button className="link" onClick={() => onChange(null)} title="Volver al valor de la tabla">
            usar tabla
          </button>
        </>
      ) : (
        <>
          <span className="readonly">
            {tableValue > 0 ? `${fmt(tableValue, 2)} ${unit}` : '— sin dato'}
          </span>
          <SourceBadge source={tableSource} title="Valor de la tabla de la boquilla a la presión de trabajo" />
          <button className="link" onClick={() => onChange({ value: +tableValue.toFixed(2), source: 'medido' })}>
            introducir valor medido
          </button>
        </>
      )}
    </div>
  );
}

export function ScenarioEditor({
  project,
  scenario,
  onChange,
}: {
  project: Project;
  scenario: Scenario;
  onChange: (s: Scenario) => void;
}) {
  const set = (id: string, patch: Partial<SprinklerSetting>) =>
    onChange({ ...scenario, settings: { ...scenario.settings, [id]: { ...scenario.settings[id], ...patch } } });
  return (
    <div className="scenario-editor">
      <Field label="Nombre">
        <input type="text" value={scenario.name} onChange={(e) => onChange({ ...scenario, name: e.target.value })} />
      </Field>
      {project.sprinklers.map((s) => {
        const st = scenario.settings[s.id];
        if (!st) return null;
        const eff = resolveSprinkler(project, s, { ...scenario, settings: { ...scenario.settings, [s.id]: { ...st, flowOverride: null, radiusOverride: null } } });
        const nozzle = findNozzle(project.nozzles, st.nozzleId);
        return (
          <div key={s.id} className="card">
            <div className="card-head">
              <label className="check">
                <input type="checkbox" checked={st.active} onChange={(e) => set(s.id, { active: e.target.checked })} />
                <span className="sw" style={{ background: sprinklerColor(s.id) }} />
                <b>Aspersor {s.label}</b>
              </label>
              <select value={st.nozzleId} onChange={(e) => set(s.id, { nozzleId: e.target.value, flowOverride: null, radiusOverride: null })} aria-label={`Boquilla de ${s.label}`}>
                {project.nozzles.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            {eff.tableStatus === 'extrapolado' && <div className="warn">Presión fuera del rango de la tabla de esta boquilla: valores extrapolados (estimación).</div>}
            {nozzle?.table.length === 0 && <div className="warn">Boquilla sin tabla: introducir caudal y radio.</div>}
            <OverrideInput label="Caudal" unit="l/min" step={0.05} tableValue={eff.flowLpm} tableSource={eff.flowSource} value={st.flowOverride} onChange={(v) => set(s.id, { flowOverride: v })} />
            <OverrideInput label="Radio" unit="m" step={0.1} tableValue={eff.radiusM} tableSource={eff.radiusSource} value={st.radiusOverride} onChange={(v) => set(s.id, { radiusOverride: v })} />
          </div>
        );
      })}
    </div>
  );
}

// --------------------------------------------------- aspersores (comunes)

function ProfileEditor({ profile, onChange }: { profile: RadialProfile; onChange: (p: RadialProfile) => void }) {
  return (
    <div className="profile-editor">
      <div className="row">
        <select value={profile.kind} onChange={(e) => onChange({ ...profile, kind: e.target.value as ProfileKind })} aria-label="Perfil radial">
          {(Object.keys(PROFILE_LABELS) as ProfileKind[]).map((k) => (
            <option key={k} value={k}>
              {PROFILE_LABELS[k]}
            </option>
          ))}
        </select>
        <SourceSelect value={profile.source} onChange={(s) => onChange({ ...profile, source: s })} allow={['medido', 'oficial', 'estimado']} />
      </div>
      {profile.kind === 'trapezoidal' && (
        <Field label="Meseta (fracción de R)">
          <NumberInput value={profile.plateau} step={0.05} min={0} max={0.95} onChange={(v) => onChange({ ...profile, plateau: v })} />
        </Field>
      )}
      {profile.kind === 'tabla' && (
        <>
          <div className="profile-points">
            {profile.points.map((v, i) => (
              <label key={i}>
                <span>{(i / 10).toFixed(1)}</span>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  value={v}
                  aria-label={`Intensidad relativa en r/R = ${(i / 10).toFixed(1)}`}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!Number.isFinite(n)) return;
                    const pts = [...profile.points];
                    pts[i] = Math.max(0, n);
                    onChange({ ...profile, points: pts });
                  }}
                />
              </label>
            ))}
          </div>
          <ProfileSpark points={profile.points} />
          <div className="row">
            <button className="link" onClick={() => onChange({ ...profile, points: [...GENERIC_ROTOR_POINTS], source: 'estimado' })}>
              restablecer perfil genérico
            </button>
          </div>
          <p className="field-hint">
            Intensidad relativa (sólo importa la forma) en r/R = 0…1. Con una prueba de vasos en línea recta desde el aspersor, introducir la
            lámina recogida en cada vaso y marcar «medido».
          </p>
        </>
      )}
    </div>
  );
}

function ProfileSpark({ points }: { points: number[] }) {
  const max = Math.max(...points, 1e-6);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * 100} ${40 - (v / max) * 36}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="Forma del perfil radial">
      <path d={`${d} L 100 40 L 0 40 Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
    </svg>
  );
}

export function SprinklerEditor({
  project,
  sprinkler: s,
  scenario,
  onChange,
  onApplyProfileToAll,
}: {
  project: Project;
  sprinkler: Sprinkler;
  scenario: Scenario;
  onChange: (s: Sprinkler) => void;
  onApplyProfileToAll: (p: RadialProfile) => void;
}) {
  const eff = resolveSprinkler(project, s, scenario);
  const norm = metersToNormalized(project.frame, s);
  return (
    <div className="sprinkler-editor">
      <Field label="Posición (m)" hint={`En el plano normalizado (con la escala actual): x=${fmt(norm.x, 0)}, y=${fmt(norm.y, 0)} · original: x=${s.normalized.x}, y=${s.normalized.y}`}>
        <span className="row">
          x <NumberInput value={s.x} step={0.05} onChange={(v) => onChange({ ...s, x: v })} unit="m" width={4.5} label="x" />
          y <NumberInput value={s.y} step={0.05} onChange={(v) => onChange({ ...s, y: v })} unit="m" width={4.5} label="y" />
          <SourceSelect value={s.positionSource} onChange={(v) => onChange({ ...s, positionSource: v })} allow={['medido', 'estimado']} />
        </span>
      </Field>
      <Field label="Orientación y arco" hint="Dirección del eje central del arco: 0° = derecha →, 90° = abajo ↓, 180° = izquierda ←, 270° = arriba ↑. PGP Ultra: arco 50°–360°.">
        <span className="row">
          eje <NumberInput value={s.dirDeg} step={1} onChange={(v) => onChange({ ...s, dirDeg: ((v % 360) + 360) % 360 })} unit="°" width={4} label="Dirección" />
          arco <NumberInput value={s.arcDeg} step={5} min={10} max={360} onChange={(v) => onChange({ ...s, arcDeg: Math.min(Math.max(v, 10), 360) })} unit="°" width={4} label="Arco" />
          <SourceSelect value={s.orientationSource} onChange={(v) => onChange({ ...s, orientationSource: v })} allow={['medido', 'estimado']} />
        </span>
      </Field>
      <div className="row">
        <button
          onClick={() => onChange({ ...s, dirDeg: bestInwardDirection(project.geometry, s, Math.max(eff.radiusM, 1)), orientationSource: 'estimado' })}
          title="Busca la dirección que deja la mayor parte del arco sobre el césped"
        >
          Orientar hacia el interior
        </button>
        <span className="muted">
          Arco: de {fmt((s.dirDeg - s.arcDeg / 2 + 360) % 360, 0)}° a {fmt((s.dirDeg + s.arcDeg / 2) % 360, 0)}°
        </span>
      </div>
      <Field label="Presión propia en este aspersor" hint="Dejar vacío para usar la presión general. Introducir aquí la lectura del manómetro en este rotor.">
        {s.pressureBar ? (
          <span className="row">
            <NumberInput value={s.pressureBar.value} step={0.05} unit="bar" onChange={(v) => onChange({ ...s, pressureBar: { ...s.pressureBar!, value: v } })} label="Presión propia" />
            <SourceSelect value={s.pressureBar.source} onChange={(v) => onChange({ ...s, pressureBar: { ...s.pressureBar!, source: v } })} allow={['medido', 'estimado']} />
            <button className="link" onClick={() => onChange({ ...s, pressureBar: null })}>
              usar general
            </button>
          </span>
        ) : (
          <button className="link" onClick={() => onChange({ ...s, pressureBar: { value: project.pressureBar.value, source: 'medido' } })}>
            introducir presión medida
          </button>
        )}
      </Field>
      <Field label="Perfil radial de reparto">
        <ProfileEditor profile={s.profile} onChange={(p) => onChange({ ...s, profile: p })} />
      </Field>
      <button className="link" onClick={() => onApplyProfileToAll(s.profile)}>
        aplicar este perfil a todos los aspersores
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- terreno

function RectRow<T extends Sector | Obstacle>({ r, onChange, onRemove }: { r: T; onChange: (r: T) => void; onRemove?: () => void }) {
  return (
    <div className="rect-row">
      <input type="text" value={r.name} onChange={(e) => onChange({ ...r, name: e.target.value })} aria-label="Nombre" />
      <span className="row">
        x <NumberInput value={r.x} step={0.1} onChange={(v) => onChange({ ...r, x: v })} width={4} label="x" />
        y <NumberInput value={r.y} step={0.1} onChange={(v) => onChange({ ...r, y: v })} width={4} label="y" />
        ancho <NumberInput value={r.w} step={0.1} min={0.1} onChange={(v) => onChange({ ...r, w: Math.max(0.1, v) })} width={4} label="ancho" />
        alto <NumberInput value={r.h} step={0.1} min={0.1} onChange={(v) => onChange({ ...r, h: Math.max(0.1, v) })} width={4} label="alto" unit="m" />
        {onRemove && (
          <button className="link danger" onClick={onRemove}>
            quitar
          </button>
        )}
      </span>
    </div>
  );
}

export function TerrainEditor({
  geometry: g,
  frame,
  onGeometry,
  onFrame,
  onTransform,
  onResetFromNormalized,
}: {
  geometry: Geometry;
  frame: NormalizedFrame;
  onGeometry: (g: Geometry) => void;
  onFrame: (f: NormalizedFrame) => void;
  onTransform: (t: 'rotar90' | 'espejoH' | 'espejoV') => void;
  onResetFromNormalized: () => void;
}) {
  return (
    <div className="terrain-editor">
      <div className="row">
        <button onClick={() => onTransform('rotar90')}>Girar L 90°</button>
        <button onClick={() => onTransform('espejoH')}>Espejo ↔</button>
        <button onClick={() => onTransform('espejoV')}>Espejo ↕</button>
      </div>
      <p className="field-hint">Los giros y espejos mueven también la construcción y los aspersores. En el plano, con «Editar: terreno», se pueden arrastrar los sectores y la construcción.</p>
      <h4>
        Sectores de césped <SourceSelect value={g.sectorsSource} onChange={(s) => onGeometry({ ...g, sectorsSource: s })} allow={['medido', 'estimado']} />
      </h4>
      {g.sectors.map((s, i) => (
        <RectRow
          key={s.id}
          r={s}
          onChange={(r) => onGeometry({ ...g, sectors: g.sectors.map((x, k) => (k === i ? r : x)) })}
          onRemove={g.sectors.length > 1 ? () => onGeometry({ ...g, sectors: g.sectors.filter((_, k) => k !== i) }) : undefined}
        />
      ))}
      <button className="link" onClick={() => onGeometry({ ...g, sectors: [...g.sectors, { id: `s${Date.now()}`, name: 'Sector nuevo', x: 0, y: 0, w: 2, h: 2 }] })}>
        + añadir sector
      </button>
      <h4>
        Construcción y zonas no regables <SourceSelect value={g.obstaclesSource} onChange={(s) => onGeometry({ ...g, obstaclesSource: s })} allow={['medido', 'estimado']} />
      </h4>
      {g.obstacles.map((o, i) => (
        <RectRow
          key={o.id}
          r={o}
          onChange={(r) => onGeometry({ ...g, obstacles: g.obstacles.map((x, k) => (k === i ? r : x)) })}
          onRemove={() => onGeometry({ ...g, obstacles: g.obstacles.filter((_, k) => k !== i) })}
        />
      ))}
      <button className="link" onClick={() => onGeometry({ ...g, obstacles: [...g.obstacles, { id: `o${Date.now()}`, name: 'No regable', x: 0, y: 0, w: 1, h: 1 }] })}>
        + añadir zona no regable
      </button>

      <h4>Correspondencia del plano normalizado</h4>
      <p className="field-hint">
        Hipótesis de escala: qué rectángulo en metros representa el 0–100 del plano preliminar. No es una medición; sirve para colocar
        inicialmente los aspersores.
      </p>
      <div className="row">
        origen x <NumberInput value={frame.originX} step={0.1} onChange={(v) => onFrame({ ...frame, originX: v })} width={4} />
        y <NumberInput value={frame.originY} step={0.1} onChange={(v) => onFrame({ ...frame, originY: v })} width={4} />
      </div>
      <div className="row">
        100 % en x = <NumberInput value={frame.widthM} step={0.1} min={0.1} onChange={(v) => onFrame({ ...frame, widthM: v })} unit="m" width={4} />
        100 % en y = <NumberInput value={frame.heightM} step={0.1} min={0.1} onChange={(v) => onFrame({ ...frame, heightM: v })} unit="m" width={4} />
      </div>
      <label className="check">
        <input type="checkbox" checked={frame.flipY} onChange={(e) => onFrame({ ...frame, flipY: e.target.checked })} /> el eje y normalizado crece hacia arriba
      </label>
      <button onClick={onResetFromNormalized}>Recolocar los aspersores desde el plano normalizado</button>
    </div>
  );
}

// ------------------------------------------------------------- simulación

export function SimSettings({ options, onChange }: { options: SimOptions; onChange: (o: SimOptions) => void }) {
  return (
    <div>
      <Field label="Cuadrícula de cálculo" hint="10–20 cm es suficiente; celdas más finas son más lentas.">
        <span className="row">
          <input type="range" min={0.05} max={0.5} step={0.05} value={options.cellM} onChange={(e) => onChange({ ...options, cellM: parseFloat(e.target.value) })} aria-label="Tamaño de celda" />
          <b>{fmt(options.cellM * 100, 0)} cm</b>
        </span>
      </Field>
      <label className="check">
        <input type="checkbox" checked={options.obstacleShadow} onChange={(e) => onChange({ ...options, obstacleShadow: e.target.checked })} /> La construcción
        intercepta el chorro (sombra hidráulica)
      </label>
      <Field label="Radio de la zona de análisis de la esquina de E">
        <NumberInput value={options.cornerZoneRadiusM} step={0.5} min={0} onChange={(v) => onChange({ ...options, cornerZoneRadiusM: Math.max(0, v) })} unit="m" />
      </Field>
      <Field label="Lámina objetivo por riego" hint="Sólo para estimar el tiempo de riego necesario.">
        <NumberInput value={options.targetDepthMm} step={1} min={1} onChange={(v) => onChange({ ...options, targetDepthMm: Math.max(1, v) })} unit="mm" />
      </Field>
    </div>
  );
}

// -------------------------------------------------------------- boquillas

export function NozzleCatalog({ project, onVerified }: { project: Project; onVerified: (v: boolean) => void }) {
  const used = new Set(project.scenarios.flatMap((s) => Object.values(s.settings).map((x) => x.nozzleId)));
  return (
    <div>
      <label className="check verify">
        <input type="checkbox" checked={project.nozzleTablesVerified} onChange={(e) => onVerified(e.target.checked)} /> He contrastado estas tablas con
        la ficha oficial de Hunter y con el código impreso en las boquillas instaladas
      </label>
      {project.nozzles
        .filter((n) => used.has(n.id))
        .map((n) => {
          const pBar = scenarioPressure(project, project.scenarios[0]).value;
          const now = lookupNozzle(n, pBar);
          return (
            <div key={n.id} className="card">
              <div className="card-head">
                <b>{n.label}</b> <SourceBadge source={n.source} />
              </div>
              <div className="table-wrap">
                <table className="results small">
                  <thead>
                    <tr>
                      <th className="num">bar</th>
                      <th className="num">m</th>
                      <th className="num">l/min</th>
                      <th>Valor original</th>
                    </tr>
                  </thead>
                  <tbody>
                    {n.table.map((t) => (
                      <tr key={t.pressureBar}>
                        <td className="num">{fmt(t.pressureBar, 2)}</td>
                        <td className="num">{fmt(t.radiusM, 2)}</td>
                        <td className="num">{fmt(t.flowLpm, 2)}</td>
                        <td className="muted">{t.original}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {n.table.length > 0 && (
                <div className="muted">
                  A {fmt(pBar, 2)} bar (presión del escenario 1): {fmt(now.flowLpm, 2)} l/min, {fmt(now.radiusM, 2)} m ({now.status === 'tabla' ? 'interpolado' : 'extrapolado'})
                </div>
              )}
              <div className="muted small">Fuente: {n.sourceRef}</div>
              <ul className="caveats">
                {n.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          );
        })}
      <p className="field-hint">Se muestran las boquillas usadas en los escenarios. El selector de cada aspersor incluye el resto del catálogo PGP Ultra disponible.</p>
    </div>
  );
}
