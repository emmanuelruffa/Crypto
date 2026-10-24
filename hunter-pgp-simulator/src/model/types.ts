/**
 * Tipos del modelo hidráulico. Todo en unidades SI de trabajo:
 *  - longitudes en metros (m)
 *  - presión en bar
 *  - caudal en litros por minuto (l/min)
 *  - precipitación en milímetros por hora (mm/h)  (1 l/m² = 1 mm)
 *  - ángulos en grados. Sistema de pantalla: x hacia la derecha, y hacia abajo,
 *    0° = dirección +x (derecha) y los ángulos crecen en sentido horario.
 */

/** Procedencia de un dato. La interfaz la muestra siempre como etiqueta visible. */
export type DataSource = 'oficial' | 'medido' | 'estimado' | 'faltante';

export interface Sourced<T> {
  value: T;
  source: DataSource;
  /** Comentario libre: de dónde sale el valor o qué falta verificar. */
  note?: string;
}

export interface Point {
  x: number;
  y: number;
}

/** Rectángulo alineado con los ejes, en metros. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Sector extends Rect {
  id: string;
  name: string;
}

export interface Obstacle extends Rect {
  id: string;
  name: string;
}

export interface Geometry {
  /** Sectores de césped (regables). Su unión forma la L. */
  sectors: Sector[];
  /** Construcciones: no regables y, si se activa, bloquean el chorro. */
  obstacles: Obstacle[];
  /** Procedencia de las dimensiones/posiciones de sectores y construcción. */
  sectorsSource: DataSource;
  obstaclesSource: DataSource;
}

/**
 * Correspondencia entre el plano normalizado (0–100 en ambos ejes) y metros.
 * Es una HIPÓTESIS editable: el plano normalizado no está en escala métrica.
 */
export interface NormalizedFrame {
  originX: number;
  originY: number;
  widthM: number;
  heightM: number;
  /** true si el eje y normalizado crece hacia arriba (en pantalla crece hacia abajo). */
  flipY: boolean;
}

// ---------------------------------------------------------------- boquillas

export interface NozzleTablePoint {
  pressureBar: number;
  radiusM: number;
  flowLpm: number;
  /** Valores originales tal como figuran en la tabla del fabricante. */
  original?: string;
}

export interface NozzleSpec {
  id: string;
  label: string;
  family: 'gris-angulo-bajo' | 'negra-corto-alcance' | 'personalizada';
  color: string;
  /** Puntos de la tabla de rendimiento, ordenados por presión creciente. */
  table: NozzleTablePoint[];
  source: DataSource;
  sourceRef: string;
  /** Advertencias sobre la calidad del dato (transcripción, puntos faltantes…). */
  caveats: string[];
}

export interface NozzleLookup {
  radiusM: number;
  flowLpm: number;
  /** 'tabla' dentro del rango tabulado, 'extrapolado' fuera de él, 'sin-datos' si no hay tabla. */
  status: 'tabla' | 'extrapolado' | 'sin-datos';
}

// ------------------------------------------------------- perfil de reparto

export type ProfileKind = 'uniforme' | 'triangular' | 'trapezoidal' | 'tabla';

/**
 * Perfil radial relativo f(u), u = r/R ∈ [0,1]. Sólo importa la forma: se
 * normaliza para que el volumen total aplicado sea igual al caudal Q.
 */
export interface RadialProfile {
  kind: ProfileKind;
  /** trapezoidal: fracción del radio con intensidad plena antes de caer linealmente a 0. */
  plateau: number;
  /** tabla: valores relativos en u = 0, 0.1, …, 1.0 (11 valores). */
  points: number[];
  source: DataSource;
  note?: string;
}

// ------------------------------------------------------------- aspersores

export interface Sprinkler {
  id: string;
  label: string;
  /** Posición en metros (sistema de pantalla). */
  x: number;
  y: number;
  positionSource: DataSource;
  /** Coordenadas del plano normalizado preliminar (sólo referencia). */
  normalized: Point;
  /** Dirección del eje del arco (grados, 0° = derecha, horario). */
  dirDeg: number;
  arcDeg: number;
  orientationSource: DataSource;
  /** Presión propia (medida en el aspersor con los cuatro funcionando); null = presión general. */
  pressureBar: Sourced<number> | null;
  profile: RadialProfile;
}

/** Ajustes por escenario de cada aspersor (lo que cambia al cambiar boquilla). */
export interface SprinklerSetting {
  active: boolean;
  nozzleId: string;
  /** null = tomar de la tabla de la boquilla a la presión de trabajo. */
  flowOverride: Sourced<number> | null;
  radiusOverride: Sourced<number> | null;
}

export interface Scenario {
  id: string;
  name: string;
  settings: Record<string, SprinklerSetting>;
}

export interface SimOptions {
  /** Tamaño de celda de la cuadrícula de cálculo, en metros. */
  cellM: number;
  /** Si la construcción intercepta el chorro (sombra hidráulica). */
  obstacleShadow: boolean;
  /** Radio (m) de la zona de análisis alrededor de la esquina de E. */
  cornerZoneRadiusM: number;
  /** Lámina objetivo por riego (mm) para estimar tiempos. */
  targetDepthMm: number;
}

export interface Project {
  geometry: Geometry;
  frame: NormalizedFrame;
  sprinklers: Sprinkler[];
  pressureBar: Sourced<number>;
  nozzles: NozzleSpec[];
  /** El usuario confirma que ha contrastado las tablas con la ficha oficial impresa. */
  nozzleTablesVerified: boolean;
  scenarios: Scenario[];
  options: SimOptions;
  /** id del aspersor cuya boquilla se está evaluando (E). */
  focusSprinklerId: string;
}
