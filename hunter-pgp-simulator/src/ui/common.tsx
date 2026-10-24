import type { ReactNode } from 'react';
import type { DataSource } from '../model';

export const SOURCE_LABEL: Record<DataSource, string> = {
  oficial: 'oficial',
  medido: 'medido',
  estimado: 'estimación',
  faltante: 'falta dato',
};

export function SourceBadge({ source, title }: { source: DataSource; title?: string }) {
  return (
    <span className={`badge badge-${source}`} title={title}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function SourceSelect({ value, onChange, allow }: { value: DataSource; onChange: (s: DataSource) => void; allow?: DataSource[] }) {
  const opts = allow ?? (['medido', 'estimado', 'oficial', 'faltante'] as DataSource[]);
  return (
    <select className={`src-select badge-${value}`} value={value} onChange={(e) => onChange(e.target.value as DataSource)} aria-label="Procedencia del dato">
      {opts.map((o) => (
        <option key={o} value={o}>
          {SOURCE_LABEL[o]}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  unit,
  width = 5.5,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  width?: number;
  label?: string;
}) {
  return (
    <span className="num">
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? +value.toFixed(4) : ''}
        step={step}
        min={min}
        max={max}
        style={{ width: `${width}em` }}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-body">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Section({ title, children, defaultOpen = true, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {right}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
export const pct = (v: number, d = 0) => (Number.isFinite(v) ? `${fmt(v * 100, d)} %` : '—');
export const signed = (v: number, d = 1) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), d)}` : '—');
