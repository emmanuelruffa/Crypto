/**
 * Escalas de color del mapa de calor.
 *  - Secuencial (mm/h): un solo tono azul, claro → oscuro.
 *  - Divergente (relativo a la media o diferencia entre escenarios):
 *    rojo = menos agua, gris neutro = igual, azul = más agua.
 */

type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'].map(hex);
const DIV_LOW = ['#f0efec', '#f2a09f', '#e34948', '#9e1f1f'].map(hex); // neutro → déficit
const DIV_HIGH = ['#f0efec', '#9ec5f4', '#3987e5', '#184f95'].map(hex); // neutro → exceso

function ramp(stops: RGB[], t: number): RGB {
  const c = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(c), stops.length - 2);
  const k = c - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** t ∈ [0,1] → color secuencial. */
export function sequential(t: number): RGB {
  return ramp(SEQ, t);
}

/** s ∈ [-1,1] → color divergente (negativo = rojo/déficit, positivo = azul/exceso). */
export function diverging(s: number): RGB {
  return s < 0 ? ramp(DIV_LOW, -s) : ramp(DIV_HIGH, s);
}

export function rgbCss(c: RGB): string {
  return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}
