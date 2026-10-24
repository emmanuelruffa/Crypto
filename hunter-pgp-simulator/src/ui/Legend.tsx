import { diverging, rgbCss, sequential } from './colors';
import { fmt } from './common';
import type { ColorMode } from './GardenView';

export function Legend({ mode, scaleMax, diffMax, refName }: { mode: ColorMode; scaleMax: number; diffMax: number; refName: string }) {
  const n = 24;
  let stops: string[];
  let ticks: { t: number; label: string }[];
  let title: string;
  if (mode === 'absoluto') {
    stops = Array.from({ length: n + 1 }, (_, i) => rgbCss(sequential(i / n)));
    ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ t, label: fmt(t * scaleMax) }));
    title = 'Precipitación simulada (mm/h)';
  } else if (mode === 'relativo') {
    stops = Array.from({ length: n + 1 }, (_, i) => rgbCss(diverging((i / n) * 2 - 1)));
    ticks = [0.5, 0.8, 1, 1.2, 1.5].map((r) => ({ t: (r - 0.5) / 1, label: `${Math.round(r * 100)} %` }));
    title = 'Precipitación relativa a la media del césped de cada escenario';
  } else {
    stops = Array.from({ length: n + 1 }, (_, i) => rgbCss(diverging((i / n) * 2 - 1)));
    ticks = [-1, -0.5, 0, 0.5, 1].map((s) => ({ t: (s + 1) / 2, label: `${s > 0 ? '+' : s < 0 ? '−' : ''}${fmt(Math.abs(s * diffMax))}` }));
    title = `Diferencia respecto de ${refName} (mm/h): rojo = menos agua, azul = más agua`;
  }
  return (
    <div className="legend" aria-label={title}>
      <div className="legend-title">{title}</div>
      <div className="legend-bar" style={{ background: `linear-gradient(to right, ${stops.join(',')})` }} />
      <div className="legend-ticks">
        {ticks.map((k) => (
          <span key={k.label} style={{ left: `${k.t * 100}%` }}>
            {k.label}
          </span>
        ))}
      </div>
      <div className="legend-keys">
        {mode === 'absoluto' && (
          <span>
            <i className="key lawn-key" /> sin riego (0 mm/h)
          </span>
        )}
        {mode === 'relativo' && <span>Rojo &lt; 80 % (falta de agua) · azul &gt; 120 % (exceso)</span>}
        <span>
          <i className="key building-key" /> construcción (excluida)
        </span>
        <span>
          <i className="key paving-key" /> no regable (agua fuera del césped atenuada)
        </span>
      </div>
    </div>
  );
}
