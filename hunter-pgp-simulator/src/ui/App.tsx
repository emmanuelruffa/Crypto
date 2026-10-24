import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  MASK_LAWN,
  boundsOf,
  defaultProject,
  readiness,
  reliabilityScore,
  sampleGrid,
  sensitivity,
  simulate,
  sprinklersFromNormalized,
  transformLayout,
  type Point,
  type Project,
  type RadialProfile,
  type SensitivityRow,
  type Sprinkler,
} from '../model';
import { NozzleCatalog, PressureEditor, ScenarioEditor, SimSettings, SprinklerEditor, TerrainEditor } from './Editors';
import { GardenView, sprinklerColor, type ColorMode, type EditMode } from './GardenView';
import { Legend } from './Legend';
import { PumpEditor } from './PumpEditor';
import { Interpretation, ReadinessPanel, ResultsTable, SensitivityPanel, SprinklerTable } from './Results';
import { Section, fmt, pct } from './common';

const STORAGE_KEY = 'pgp-ultra-simulador-v1';

function loadProject(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p?.sprinklers?.length && p?.scenarios?.length >= 2 && p?.geometry?.sectors) return { ...defaultProject(), ...p };
    }
  } catch {
    /* almacenamiento no disponible: se usa el ejemplo */
  }
  return defaultProject();
}

function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= v) return m * e;
  return 10 * e;
}

type Tab = 'escenarios' | 'aspersores' | 'terreno' | 'boquillas' | 'simulacion';

export function App() {
  const [project, setProject] = useState<Project>(loadProject);
  const [tab, setTab] = useState<Tab>('escenarios');
  const [scIdx, setScIdx] = useState(0);
  const [selected, setSelected] = useState<string>('E');
  const [mode, setMode] = useState<ColorMode>('absoluto');
  const [editMode, setEditMode] = useState<EditMode>('ninguno');
  const [opacity, setOpacity] = useState(0.85);
  const [manualMax, setManualMax] = useState<number | null>(null);
  const [showMinMax, setShowMinMax] = useState(true);
  const [hover, setHover] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sens, setSens] = useState<SensitivityRow[] | null>(null);
  const [sensBusy, setSensBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      /* sin persistencia */
    }
  }, [project]);

  const deferred = useDeferredValue(project);
  const [s1, s2] = deferred.scenarios;

  // Durante el arrastre se usa una cuadrícula gruesa para que la interacción sea fluida.
  const cellM = dragging ? Math.max(deferred.options.cellM, 0.25) : deferred.options.cellM;
  const results = useMemo(() => [simulate(deferred, s1, { cellM }), simulate(deferred, s2, { cellM })], [deferred, s1, s2, cellM]);
  const [r1, r2] = results;

  useEffect(() => {
    if (dragging) return;
    setSensBusy(true);
    const t = setTimeout(() => {
      setSens(sensitivity(deferred, deferred.scenarios[0], deferred.scenarios[1]));
      setSensBusy(false);
    }, 350);
    return () => clearTimeout(t);
  }, [deferred, dragging]);

  const checks = useMemo(() => readiness(deferred, deferred.scenarios), [deferred]);
  const score = reliabilityScore(checks);

  const autoMax = niceCeil(Math.max(r1.lawn.max, r2.lawn.max));
  const scaleMax = manualMax ?? autoMax;
  const diffMax = useMemo(() => {
    let m = 0;
    const g = r2.grid;
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const idx = j * g.nx + i;
        if (g.mask[idx] !== MASK_LAWN) continue;
        const o = sampleGrid(r1.grid, g.x0 + (i + 0.5) * g.cell, g.y0 + (j + 0.5) * g.cell);
        m = Math.max(m, Math.abs(g.precip[idx] - (o?.value ?? 0)));
      }
    return niceCeil(m);
  }, [r1, r2]);

  const view = useMemo(() => {
    const b = boundsOf([...project.geometry.sectors, ...project.geometry.obstacles, ...project.sprinklers.map((s) => ({ x: s.x, y: s.y, w: 0, h: 0 }))]);
    const pad = 1.5;
    return { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.w + 2 * pad), h: Math.ceil(b.h + 2 * pad) };
  }, [project.geometry, project.sprinklers]);

  // ------------------------------------------------------------ mutadores
  const patch = (p: Partial<Project>) => setProject((cur) => ({ ...cur, ...p }));
  const updateSprinkler = (id: string, fn: (s: Sprinkler) => Sprinkler) =>
    setProject((cur) => ({ ...cur, sprinklers: cur.sprinklers.map((s) => (s.id === id ? fn(s) : s)) }));
  const applyProfileAll = (p: RadialProfile) => setProject((cur) => ({ ...cur, sprinklers: cur.sprinklers.map((s) => ({ ...s, profile: structuredClone(p) })) }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'riego-pgp-ultra.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const p = JSON.parse(await f.text()) as Project;
      if (!p?.sprinklers?.length || !p?.scenarios || p.scenarios.length < 2 || !p?.geometry?.sectors) throw new Error('estructura');
      setProject({ ...defaultProject(), ...p });
    } catch {
      alert('El archivo no es un proyecto válido del simulador.');
    }
  };

  const selSprinkler = project.sprinklers.find((s) => s.id === selected) ?? project.sprinklers[0];

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Simulador de riego · Hunter PGP Ultra en jardín en L</h1>
          <p className="question">
            ¿Mantener la boquilla negra <b>1.0</b> en el aspersor <b>E</b> o cambiarla por una <b>2.0</b> mejora la uniformidad de todo el
            jardín con los cuatro rotores funcionando a la vez?
          </p>
        </div>
        <div className="top-actions">
          <span className={`reliab ${score < 0.4 ? 'low' : score < 0.8 ? 'mid' : 'high'}`} title="Proporción ponderada de datos medidos u oficiales verificados">
            Datos verificados {pct(score)}
          </span>
          <button onClick={exportJson}>Exportar JSON</button>
          <button onClick={() => fileRef.current?.click()}>Importar</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button
            className="ghost"
            onClick={() => {
              if (confirm('¿Restablecer los datos de ejemplo? Se perderán los cambios no exportados.')) setProject(defaultProject());
            }}
          >
            Restablecer ejemplo
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <nav className="tabs" role="tablist">
            {(
              [
                ['escenarios', 'Escenarios'],
                ['aspersores', 'Aspersores'],
                ['terreno', 'Terreno'],
                ['boquillas', 'Boquillas'],
                ['simulacion', 'Cálculo'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === 'escenarios' && (
              <>
                <PumpEditor project={project} onChange={(pump) => patch({ pump })} />
                {!project.pump.enabled && <PressureEditor value={project.pressureBar} onChange={(v) => patch({ pressureBar: v })} />}
                <div className="subtabs">
                  {project.scenarios.slice(0, 2).map((s, i) => (
                    <button key={s.id} className={scIdx === i ? 'on' : ''} onClick={() => setScIdx(i)}>
                      Escenario {i + 1}
                    </button>
                  ))}
                </div>
                <ScenarioEditor
                  project={project}
                  scenario={project.scenarios[scIdx]}
                  onChange={(sc) => patch({ scenarios: project.scenarios.map((x, i) => (i === scIdx ? sc : x)) })}
                />
              </>
            )}
            {tab === 'aspersores' && (
              <>
                <div className="chips">
                  {project.sprinklers.map((s) => (
                    <button key={s.id} className={selected === s.id ? 'on' : ''} onClick={() => setSelected(s.id)}>
                      <span className="sw" style={{ background: sprinklerColor(s.id) }} /> {s.label}
                    </button>
                  ))}
                </div>
                <p className="field-hint">
                  Posición, orientación, presión y perfil son comunes a los dos escenarios. En el plano, con «Editar: aspersores», se arrastra
                  el aspersor y el tirador de dirección.
                </p>
                <SprinklerEditor
                  project={project}
                  sprinkler={selSprinkler}
                  scenario={project.scenarios[0]}
                  onChange={(s) => updateSprinkler(s.id, () => s)}
                  onApplyProfileToAll={applyProfileAll}
                />
              </>
            )}
            {tab === 'terreno' && (
              <TerrainEditor
                geometry={project.geometry}
                frame={project.frame}
                onGeometry={(g) => patch({ geometry: g })}
                onFrame={(f) => patch({ frame: f })}
                onTransform={(t) => setProject((cur) => ({ ...cur, ...transformLayout(cur.geometry, cur.sprinklers, t) }))}
                onResetFromNormalized={() =>
                  setProject((cur) => {
                    const fresh = sprinklersFromNormalized(cur.geometry, cur.frame);
                    return {
                      ...cur,
                      sprinklers: cur.sprinklers.map((s) => {
                        const f = fresh.find((x) => x.id === s.id);
                        return f ? { ...s, x: f.x, y: f.y, positionSource: 'estimado' } : s;
                      }),
                    };
                  })
                }
              />
            )}
            {tab === 'boquillas' && <NozzleCatalog project={project} onVerified={(v) => patch({ nozzleTablesVerified: v })} />}
            {tab === 'simulacion' && <SimSettings options={project.options} onChange={(o) => patch({ options: o })} />}
          </div>
        </aside>

        <main className="content">
          <div className="toolbar">
            <div className="seg" role="group" aria-label="Modo de color">
              {(
                [
                  ['absoluto', 'mm/h'],
                  ['relativo', '% de la media'],
                  ['diferencia', 'Diferencia 2 − 1'],
                ] as [ColorMode, string][]
              ).map(([k, l]) => (
                <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Edición en el plano">
              {(
                [
                  ['ninguno', 'Ver'],
                  ['aspersores', 'Editar: aspersores'],
                  ['terreno', 'Editar: terreno'],
                ] as [EditMode, string][]
              ).map(([k, l]) => (
                <button key={k} className={editMode === k ? 'on' : ''} onClick={() => setEditMode(k)}>
                  {l}
                </button>
              ))}
            </div>
            <label className="inline">
              Opacidad
              <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} />
            </label>
            <label className="inline">
              Escala máx.
              <input
                type="number"
                step={1}
                min={1}
                value={scaleMax}
                style={{ width: '4.5em' }}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setManualMax(Number.isFinite(v) && v > 0 ? v : null);
                }}
              />
              mm/h
              {manualMax !== null && (
                <button className="link" onClick={() => setManualMax(null)}>
                  auto
                </button>
              )}
            </label>
            <label className="inline">
              <input type="checkbox" checked={showMinMax} onChange={(e) => setShowMinMax(e.target.checked)} /> mín/máx
            </label>
          </div>

          <div className="compare">
            {[r1, r2].map((r, i) => (
              <GardenView
                key={r.scenarioId}
                title={`${i + 1}. ${deferred.scenarios[i].name}`}
                geometry={deferred.geometry}
                options={deferred.options}
                result={r}
                reference={i === 1 ? r1 : undefined}
                mode={mode === 'diferencia' && i === 0 ? 'absoluto' : mode}
                scaleMax={scaleMax}
                diffMax={diffMax}
                opacity={opacity}
                view={view}
                editMode={editMode}
                selectedId={selected}
                hover={hover}
                showMinMax={showMinMax && !(mode === 'diferencia' && i === 1)}
                onHover={setHover}
                onSelect={(id) => {
                  setSelected(id);
                  if (editMode === 'aspersores') setTab('aspersores');
                }}
                onMoveSprinkler={(id, x, y) => updateSprinkler(id, (s) => ({ ...s, x, y }))}
                onRotateSprinkler={(id, d) => updateSprinkler(id, (s) => ({ ...s, dirDeg: d }))}
                onMoveRect={(kind, id, x, y) =>
                  setProject((cur) => ({
                    ...cur,
                    geometry:
                      kind === 'sector'
                        ? { ...cur.geometry, sectors: cur.geometry.sectors.map((s) => (s.id === id ? { ...s, x, y } : s)) }
                        : { ...cur.geometry, obstacles: cur.geometry.obstacles.map((o) => (o.id === id ? { ...o, x, y } : o)) },
                  }))
                }
                onDragging={setDragging}
              />
            ))}
          </div>
          <div className="legends">
            {mode === 'diferencia' && <Legend mode="absoluto" scaleMax={scaleMax} diffMax={diffMax} refName="escenario 1" />}
            <Legend mode={mode} scaleMax={scaleMax} diffMax={diffMax} refName="escenario 1" />
          </div>
          <p className="note">
            Cuadrícula de cálculo {fmt(cellM * 100, 0)} cm{dragging ? ' (provisional durante el arrastre)' : ''}. Escala de color común a ambos
            escenarios. Pasar el cursor por el plano muestra la precipitación y la aportación de cada aspersor en ese punto.
          </p>

          <Section title="Lectura de la comparación">
            <Interpretation a={r1} b={r2} rows={sens} score={score} focusId={deferred.focusSprinklerId} pumpName={deferred.pump.enabled ? deferred.pump.name : undefined} />
          </Section>
          <Section title="Resultados hidráulicos (simulados)">
            <ResultsTable results={results} targetMm={deferred.options.targetDepthMm} cornerR={deferred.options.cornerZoneRadiusM} />
          </Section>
          <Section title="Aspersores: caudal, radio y precipitación idealizada">
            <SprinklerTable results={results} names={deferred.scenarios.map((s) => s.name)} />
          </Section>
          <Section title="Sensibilidad a los datos no verificados">
            <SensitivityPanel rows={sens} busy={sensBusy} />
          </Section>
          <Section title="Qué falta para que la comparación sea técnicamente fiable">
            <ReadinessPanel items={checks} score={score} />
          </Section>
          <Section title="Modelo de cálculo y supuestos" defaultOpen={false}>
            <Method />
          </Section>
        </main>
      </div>
    </div>
  );
}

function Method() {
  return (
    <div className="method">
      <p>
        <b>Precipitación local.</b> P(x,y) = Σᵢ Pᵢ(x,y) sumando los aspersores activos. Cada aspersor aporta Pᵢ(r) = kᵢ·f(r/Rᵢ) dentro de su
        arco y de su radio, con kᵢ = 60·Qᵢ / (θᵢ·Rᵢ²·∫₀¹ f(u)·u du). Así el volumen aplicado por cada aspersor es exactamente su caudal Qᵢ (l/min →
        60·Qᵢ l/h; 1 l/m² = 1 mm). Con f ≡ 1 se recupera Pᵢ = 60·Qᵢ/Aᵢ.
      </p>
      <p>
        <b>Caudal y radio.</b> Interpolación lineal en la tabla de la boquilla a la presión del aspersor; fuera del rango, caudal ∝ √P y radio
        constante (marcado como estimación). Los valores medidos sustituyen a la tabla.
      </p>
      <p>
        <b>Supuestos no modelados:</b> velocidad de giro uniforme en todo el arco (sin sobre-riego en los extremos de giro), sin viento ni
        evaporación, sin caída de presión adicional al cambiar de boquilla, superficie plana, agua que cae fuera del césped perdida.
      </p>
      <p>
        <b>Indicadores</b> sobre las celdas de césped (sin la construcción): media, desviación estándar, CV = σ/media, CU de Christiansen = 1 −
        Σ|Pᵢ − media| / (n·media), DUlq = media del 25 % de celdas con menos agua / media, fracción de superficie &lt; 80 % y &gt; 120 % de la
        media. Son resultados simulados, no mediciones.
      </p>
      <p>Documentación completa, fuentes y procedimiento de medición en README.md.</p>
    </div>
  );
}
