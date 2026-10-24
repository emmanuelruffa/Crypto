import type { ProfileKind, RadialProfile } from './types';

/**
 * Perfil radial genérico de un rotor: algo menos de intensidad junto al aspersor,
 * meseta en la zona media y caída hacia el final del alcance. NO es un dato de
 * Hunter: es una forma típica supuesta, etiquetada como estimación. Debe
 * sustituirse por datos de una prueba de vasos (pluviómetros) o por el perfil
 * de distribución oficial si se consigue.
 */
export const GENERIC_ROTOR_POINTS = [0.55, 0.75, 0.9, 1, 1, 1, 0.95, 0.85, 0.65, 0.35, 0];

export const PROFILE_LABELS: Record<ProfileKind, string> = {
  uniforme: 'Uniforme (sector ideal)',
  triangular: 'Triangular (máximo junto al aspersor)',
  trapezoidal: 'Trapezoidal (meseta + caída lineal)',
  tabla: 'Tabla de 11 puntos (r/R = 0…1)',
};

export function defaultProfile(): RadialProfile {
  return {
    kind: 'tabla',
    plateau: 0.6,
    points: [...GENERIC_ROTOR_POINTS],
    source: 'estimado',
    note: 'Perfil genérico de rotor supuesto; sustituir por prueba de vasos.',
  };
}

/** Intensidad relativa f(u) con u = r/R. Fuera de [0,1] vale 0. */
export function profileValue(p: RadialProfile, u: number): number {
  if (u < 0 || u > 1) return 0;
  switch (p.kind) {
    case 'uniforme':
      return 1;
    case 'triangular':
      return 1 - u;
    case 'trapezoidal': {
      const pl = Math.min(Math.max(p.plateau, 0), 0.999);
      return u <= pl ? 1 : (1 - u) / (1 - pl);
    }
    case 'tabla': {
      const pts = p.points.length >= 2 ? p.points : GENERIC_ROTOR_POINTS;
      const pos = u * (pts.length - 1);
      const i = Math.min(Math.floor(pos), pts.length - 2);
      const k = pos - i;
      return Math.max(0, pts[i] + k * (pts[i + 1] - pts[i]));
    }
  }
}

/**
 * I = ∫₀¹ f(u)·u du  (regla de Simpson). Con ella la intensidad absoluta es
 *   P(r) = 60·Q·f(r/R) / (θ·R²·I)       [mm/h]
 * con Q en l/min, θ en radianes y R en m, de modo que ∬ P dA = 60·Q (l/h) sobre
 * el sector regado. Para f ≡ 1, I = 1/2 y se recupera P = 60·Q / A.
 */
export function profileMoment(p: RadialProfile): number {
  const n = 1000;
  const h = 1 / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = i * h;
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    s += w * profileValue(p, u) * u;
  }
  return (s * h) / 3;
}
