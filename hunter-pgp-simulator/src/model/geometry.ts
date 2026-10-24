import type { Geometry, NormalizedFrame, Point, Rect, Sprinkler } from './types';

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Un punto es césped si está en algún sector y en ninguna construcción. */
export function isLawn(g: Geometry, x: number, y: number): boolean {
  if (!g.sectors.some((s) => inRect(s, x, y))) return false;
  return !g.obstacles.some((o) => inRect(o, x, y));
}

export function isObstacle(g: Geometry, x: number, y: number): boolean {
  return g.obstacles.some((o) => inRect(o, x, y));
}

export function boundsOf(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * ¿El segmento a→b atraviesa el interior del rectángulo? (Liang–Barsky).
 * El rectángulo se encoge ligeramente para que un aspersor apoyado en la pared
 * no quede "bloqueado" por la propia arista.
 */
export function segmentHitsRect(a: Point, b: Point, r: Rect, shrink = 1e-4): boolean {
  const xmin = r.x + shrink;
  const xmax = r.x + r.w - shrink;
  const ymin = r.y + shrink;
  const ymax = r.y + r.h - shrink;
  if (xmin >= xmax || ymin >= ymax) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - xmin, xmax - a.x, a.y - ymin, ymax - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0 < t1;
}

// ------------------------------------------------------ plano normalizado

export function normalizedToMeters(f: NormalizedFrame, p: Point): Point {
  const ny = f.flipY ? 100 - p.y : p.y;
  return { x: f.originX + (p.x / 100) * f.widthM, y: f.originY + (ny / 100) * f.heightM };
}

export function metersToNormalized(f: NormalizedFrame, p: Point): Point {
  const nx = ((p.x - f.originX) / f.widthM) * 100;
  const ny = ((p.y - f.originY) / f.heightM) * 100;
  return { x: nx, y: f.flipY ? 100 - ny : ny };
}

/**
 * Punto de césped más cercano a p, retirado `inset` metros del borde. Se usa para
 * colocar sobre el césped un aspersor cuyas coordenadas normalizadas caen
 * ligeramente fuera (p. ej. dentro de la construcción).
 */
export function snapToLawn(g: Geometry, p: Point, inset = 0.1): Point {
  const nearObstacle = (x: number, y: number) =>
    g.obstacles.some((o) => inRect({ x: o.x - inset + 1e-6, y: o.y - inset + 1e-6, w: o.w + 2 * inset - 2e-6, h: o.h + 2 * inset - 2e-6 }, x, y));
  if (isLawn(g, p.x, p.y) && !nearObstacle(p.x, p.y)) return p;
  let best: Point = p;
  let bestD = Infinity;
  const step = 0.05;
  for (const s of g.sectors) {
    for (let x = s.x + inset; x <= s.x + s.w - inset + 1e-9; x += step) {
      for (let y = s.y + inset; y <= s.y + s.h - inset + 1e-9; y += step) {
        if (!isLawn(g, x, y) || nearObstacle(x, y)) continue;
        const d = (x - p.x) ** 2 + (y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
  }
  return { x: round(best.x, 2), y: round(best.y, 2) };
}

export function round(v: number, d: number): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

// ------------------------------------------------------------ ángulos

export function normDeg(a: number): number {
  return ((a % 360) + 360) % 360;
}

/** Diferencia angular con signo en (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = normDeg(a - b);
  if (d > 180) d -= 360;
  return d;
}

export function inArc(s: Pick<Sprinkler, 'x' | 'y' | 'dirDeg' | 'arcDeg'>, x: number, y: number): boolean {
  if (s.arcDeg >= 360) return true;
  const ang = (Math.atan2(y - s.y, x - s.x) * 180) / Math.PI;
  return Math.abs(angleDiff(ang, s.dirDeg)) <= s.arcDeg / 2 + 1e-9;
}

/**
 * Dirección del eje del arco que maximiza la fracción del sector circular que cae
 * sobre césped (barrido de 1°). Ayuda a "orientar hacia el interior"; el resultado
 * es una propuesta (estimación), no la orientación real del rotor.
 */
export function bestInwardDirection(g: Geometry, s: Pick<Sprinkler, 'x' | 'y' | 'arcDeg'>, radiusM: number): number {
  const samples: Point[] = [];
  const nr = 12;
  const na = 72;
  for (let i = 1; i <= nr; i++) {
    const r = (radiusM * i) / nr;
    for (let j = 0; j < na; j++) {
      const a = (j / na) * 2 * Math.PI;
      samples.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
  }
  const sampleLawn = samples.map((p) => ({
    ang: normDeg((Math.atan2(p.y, p.x) * 180) / Math.PI),
    w: Math.hypot(p.x, p.y), // peso ∝ r (área del anillo)
    lawn: isLawn(g, s.x + p.x, s.y + p.y),
  }));
  let best = 0;
  let bestScore = -Infinity;
  for (let dir = 0; dir < 360; dir++) {
    let score = 0;
    for (const p of sampleLawn) {
      if (Math.abs(angleDiff(p.ang, dir)) <= s.arcDeg / 2) score += p.lawn ? p.w : -p.w;
    }
    if (score > bestScore) {
      bestScore = score;
      best = dir;
    }
  }
  return best;
}

// ------------------------------------------------- transformaciones del plano

export type LayoutTransform = 'rotar90' | 'espejoH' | 'espejoV';

/** Transforma un rectángulo dentro de la caja `b` (que se mantiene anclada en su origen). */
function transformRect<T extends Rect>(r: T, b: Rect, t: LayoutTransform): T {
  switch (t) {
    case 'espejoH':
      return { ...r, x: 2 * b.x + b.w - r.x - r.w };
    case 'espejoV':
      return { ...r, y: 2 * b.y + b.h - r.y - r.h };
    case 'rotar90': {
      // rotación horaria 90° en pantalla: (x, y) → (b.h - y, x) relativo al origen
      const rx = r.x - b.x;
      const ry = r.y - b.y;
      return { ...r, x: b.x + (b.h - (ry + r.h)), y: b.y + rx, w: r.h, h: r.w };
    }
  }
}

function transformPoint(p: Point, b: Rect, t: LayoutTransform): Point {
  switch (t) {
    case 'espejoH':
      return { x: b.x + b.w - (p.x - b.x), y: p.y };
    case 'espejoV':
      return { x: p.x, y: b.y + b.h - (p.y - b.y) };
    case 'rotar90':
      return { x: b.x + (b.h - (p.y - b.y)), y: b.y + (p.x - b.x) };
  }
}

function transformDir(dirDeg: number, t: LayoutTransform): number {
  switch (t) {
    case 'espejoH':
      return normDeg(180 - dirDeg);
    case 'espejoV':
      return normDeg(-dirDeg);
    case 'rotar90':
      return normDeg(dirDeg + 90);
  }
}

/** Aplica una rotación o simetría a todo el trazado (sectores, construcción y aspersores). */
export function transformLayout(
  g: Geometry,
  sprinklers: Sprinkler[],
  t: LayoutTransform,
): { geometry: Geometry; sprinklers: Sprinkler[] } {
  const b = boundsOf([...g.sectors, ...g.obstacles]);
  return {
    geometry: {
      ...g,
      sectors: g.sectors.map((s) => transformRect(s, b, t)),
      obstacles: g.obstacles.map((o) => transformRect(o, b, t)),
    },
    sprinklers: sprinklers.map((s) => {
      const p = transformPoint(s, b, t);
      return { ...s, x: round(p.x, 3), y: round(p.y, 3), dirDeg: transformDir(s.dirDeg, t) };
    }),
  };
}
