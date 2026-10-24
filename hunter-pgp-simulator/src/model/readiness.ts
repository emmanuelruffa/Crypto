import { findNozzle, lookupNozzle } from './nozzles';
import type { Project, Scenario } from './types';

export type CheckStatus = 'ok' | 'parcial' | 'falta';

export interface ReadinessItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Peso en la fiabilidad de la comparación 1.0 vs 2.0 en E (3 = crítico). */
  weight: 1 | 2 | 3;
}

const PGP_ARC_MIN = 50; // ficha PGP Ultra: arco ajustable de 50° a 360°

/**
 * Lista de comprobación de los datos que condicionan la fiabilidad de la
 * comparación. Se calcula a partir de la procedencia (oficial/medido/estimado/
 * faltante) de cada dato del proyecto.
 */
export function readiness(project: Project, scenarios: Scenario[]): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const sp = project.sprinklers;
  const used = (s: Scenario, id: string) => s.settings[id]?.active;

  // 1. Presión
  const pressMeasured = sp.filter((s) => (s.pressureBar ?? project.pressureBar).source === 'medido').length;
  items.push({
    id: 'presion',
    label: 'Presión real en cada aspersor con los cuatro funcionando',
    status: pressMeasured === sp.length ? 'ok' : pressMeasured > 0 ? 'parcial' : 'falta',
    detail:
      pressMeasured === sp.length
        ? 'Medida en todos los aspersores.'
        : `Medida en ${pressMeasured}/${sp.length}. Medir con manómetro en la toma de pitot de la boquilla o en la base del rotor, con la zona completa en marcha. Determina caudal y radio de la tabla.`,
    weight: 3,
  });

  // 2. Rango de tabla
  const outOfRange: string[] = [];
  for (const sc of scenarios) {
    for (const s of sp) {
      const set = sc.settings[s.id];
      if (!set?.active) continue;
      const n = findNozzle(project.nozzles, set.nozzleId);
      if (!n) continue;
      const st = lookupNozzle(n, (s.pressureBar ?? project.pressureBar).value).status;
      if (st !== 'tabla' && !(set.flowOverride && set.radiusOverride)) outOfRange.push(`${s.label} (${sc.name})`);
    }
  }
  items.push({
    id: 'rango',
    label: 'Presión dentro del rango de las tablas',
    status: outOfRange.length === 0 ? 'ok' : 'parcial',
    detail: outOfRange.length === 0 ? 'Todas las consultas caen dentro de la tabla.' : `Extrapolado (Q ∝ √P, radio constante) en: ${outOfRange.join(', ')}.`,
    weight: 2,
  });

  // 3. Caudal por boquilla
  const missingFlow = new Map<string, string[]>();
  let flowsMeasured = 0;
  let flowsTotal = 0;
  scenarios.forEach((sc, i) => {
    for (const s of sp) {
      if (!used(sc, s.id)) continue;
      flowsTotal++;
      if (sc.settings[s.id].flowOverride?.source === 'medido') flowsMeasured++;
      else missingFlow.set(s.label, [...(missingFlow.get(s.label) ?? []), String(i + 1)]);
    }
  });
  const missingTxt = [...missingFlow].map(([l, sc]) => `${l} (esc. ${sc.join(' y ')})`).join(', ');
  items.push({
    id: 'caudal',
    label: 'Caudal real de cada boquilla',
    status: flowsMeasured === flowsTotal ? 'ok' : project.nozzleTablesVerified && pressMeasured === sp.length ? 'parcial' : 'falta',
    detail:
      flowsMeasured === flowsTotal
        ? 'Medido en todos los casos.'
        : `Sin medir: ${missingTxt}. Se usa la tabla a la presión indicada. Para medir: volumen recogido en un tiempo dado, o lectura del contador con un único aspersor abierto.`,
    weight: 3,
  });

  // 4. Radio observado
  let radMeasured = 0;
  let radTotal = 0;
  for (const sc of scenarios) {
    for (const s of sp) {
      if (!used(sc, s.id)) continue;
      radTotal++;
      if (sc.settings[s.id].radiusOverride?.source === 'medido') radMeasured++;
    }
  }
  items.push({
    id: 'radio',
    label: 'Radio de alcance observado',
    status: radMeasured === radTotal ? 'ok' : radMeasured > 0 ? 'parcial' : 'falta',
    detail: `${radMeasured}/${radTotal} medidos. Si se usó el tornillo reductor de radio, el valor de tabla no aplica.`,
    weight: 2,
  });

  // 5. Posiciones
  const posMeasured = sp.filter((s) => s.positionSource === 'medido').length;
  items.push({
    id: 'posicion',
    label: 'Posición métrica exacta de los aspersores',
    status: posMeasured === sp.length ? 'ok' : posMeasured > 0 ? 'parcial' : 'falta',
    detail: `${posMeasured}/${sp.length} medidas. Las demás derivan del plano normalizado (hipótesis de escala editable).`,
    weight: 3,
  });

  // 6. Orientación y arco
  const orMeasured = sp.filter((s) => s.orientationSource === 'medido').length;
  const badArc = sp.filter((s) => s.arcDeg < PGP_ARC_MIN || s.arcDeg > 360).map((s) => s.label);
  items.push({
    id: 'orientacion',
    label: 'Orientación angular y arco de cada rotor',
    status: badArc.length > 0 ? 'falta' : orMeasured === sp.length ? 'ok' : orMeasured > 0 ? 'parcial' : 'falta',
    detail:
      (badArc.length > 0 ? `Arco fuera del rango del PGP Ultra (50°–360°): ${badArc.join(', ')}. ` : '') +
      `${orMeasured}/${sp.length} orientaciones medidas (bordes izquierdo y derecho del arco).`,
    weight: 2,
  });

  // 7. Geometría
  const g = project.geometry;
  items.push({
    id: 'sectores',
    label: 'Dimensiones y orientación definitivas de los sectores',
    status: g.sectorsSource === 'medido' ? 'ok' : 'falta',
    detail: g.sectorsSource === 'medido' ? 'Confirmadas.' : 'La L y su orientación son una hipótesis a partir del plano normalizado.',
    weight: 2,
  });
  items.push({
    id: 'construccion',
    label: 'Geometría exacta de la construcción',
    status: g.obstaclesSource === 'medido' ? 'ok' : 'falta',
    detail: g.obstaclesSource === 'medido' ? 'Confirmada.' : 'Posición y tamaño supuestos. Afecta al agua que se pierde contra la pared en la esquina de E.',
    weight: 2,
  });

  // 8. Tablas oficiales
  items.push({
    id: 'tablas',
    label: 'Tablas oficiales de las boquillas exactas instaladas',
    status: project.nozzleTablesVerified ? 'ok' : 'parcial',
    detail: project.nozzleTablesVerified
      ? 'Contrastadas por el usuario con la ficha Hunter.'
      : 'Transcritas de las páginas de rendimiento de Hunter; falta contrastarlas con la ficha impresa y confirmar el código de cada boquilla instalada.',
    weight: 2,
  });

  // 9. Perfil radial
  const profMeasured = sp.filter((s) => s.profile.source === 'medido' || s.profile.source === 'oficial').length;
  items.push({
    id: 'perfil',
    label: 'Perfil radial de distribución de cada boquilla',
    status: profMeasured === sp.length ? 'ok' : profMeasured > 0 ? 'parcial' : 'falta',
    detail:
      profMeasured === sp.length
        ? 'Perfiles medidos u oficiales.'
        : 'Forma supuesta. Hunter no publica perfiles radiales en las tablas de rendimiento; obtenerlos con una prueba de vasos en línea recta desde el aspersor o con datos de laboratorio (p. ej. CIT). Ver el análisis de sensibilidad.',
    weight: 3,
  });

  return items;
}

export function reliabilityScore(items: ReadinessItem[]): number {
  let got = 0;
  let max = 0;
  for (const it of items) {
    max += it.weight;
    got += it.weight * (it.status === 'ok' ? 1 : it.status === 'parcial' ? 0.5 : 0);
  }
  return max > 0 ? got / max : 0;
}
