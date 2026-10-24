import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  MASK_LAWN,
  MASK_OBSTACLE,
  contributionAt,
  sampleGrid,
  type EffectiveSprinkler,
  type Geometry,
  type Point,
  type Rect,
  type SimOptions,
  type SimResult,
} from '../model';
import { diverging, sequential } from './colors';
import { fmt } from './common';

export type ColorMode = 'absoluto' | 'relativo' | 'diferencia';
export type EditMode = 'aspersores' | 'terreno' | 'ninguno';

interface Props {
  title: string;
  geometry: Geometry;
  options: SimOptions;
  result: SimResult;
  /** Escenario de referencia para el modo diferencia (este − referencia). */
  reference?: SimResult;
  mode: ColorMode;
  scaleMax: number;
  diffMax: number;
  opacity: number;
  view: Rect;
  editMode: EditMode;
  selectedId: string | null;
  hover: Point | null;
  showMinMax: boolean;
  onHover: (p: Point | null) => void;
  onSelect: (id: string) => void;
  onMoveSprinkler: (id: string, x: number, y: number) => void;
  onRotateSprinkler: (id: string, dirDeg: number) => void;
  onMoveRect: (kind: 'sector' | 'obstacle', id: string, x: number, y: number) => void;
  onDragging: (d: boolean) => void;
}

type Drag =
  | { kind: 'sprinkler'; id: string }
  | { kind: 'rotate'; id: string }
  | { kind: 'rect'; rectKind: 'sector' | 'obstacle'; id: string; dx: number; dy: number };

const SPRINKLER_COLORS: Record<string, string> = { A: '#2a78d6', B: '#eb6834', D: '#1baf7a', E: '#6250d6' };
export const sprinklerColor = (id: string) => SPRINKLER_COLORS[id] ?? '#e87ba4';

function wedgePath(e: Pick<EffectiveSprinkler, 'x' | 'y' | 'dirDeg' | 'arcDeg' | 'radiusM'>): string {
  const R = e.radiusM;
  if (e.arcDeg >= 360) {
    return `M ${e.x - R} ${e.y} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`;
  }
  const a1 = ((e.dirDeg - e.arcDeg / 2) * Math.PI) / 180;
  const a2 = ((e.dirDeg + e.arcDeg / 2) * Math.PI) / 180;
  const x1 = e.x + R * Math.cos(a1);
  const y1 = e.y + R * Math.sin(a1);
  const x2 = e.x + R * Math.cos(a2);
  const y2 = e.y + R * Math.sin(a2);
  return `M ${e.x} ${e.y} L ${x1} ${y1} A ${R} ${R} 0 ${e.arcDeg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

function buildHeatmap(res: SimResult, mode: ColorMode, scaleMax: number, diffMax: number, opacity: number, ref?: SimResult): string {
  const g = res.grid;
  const canvas = document.createElement('canvas');
  canvas.width = g.nx;
  canvas.height = g.ny;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(g.nx, g.ny);
  const mean = res.lawn.mean;
  for (let j = 0; j < g.ny; j++) {
    for (let i = 0; i < g.nx; i++) {
      const idx = j * g.nx + i;
      const m = g.mask[idx];
      if (m === MASK_OBSTACLE) continue;
      const v = g.precip[idx];
      let c: [number, number, number] | null = null;
      if (mode === 'absoluto') {
        if (v > 1e-6) c = sequential(v / scaleMax);
      } else if (mode === 'relativo') {
        if (m === MASK_LAWN && mean > 0) c = diverging((v / mean - 1) / 0.5);
        else if (v > 1e-6) c = sequential(v / scaleMax);
      } else if (ref) {
        const x = g.x0 + (i + 0.5) * g.cell;
        const y = g.y0 + (j + 0.5) * g.cell;
        const o = sampleGrid(ref.grid, x, y);
        const d = v - (o?.value ?? 0);
        if (m === MASK_LAWN || Math.abs(d) > 1e-6) c = diverging(diffMax > 0 ? d / diffMax : 0);
      }
      if (!c) continue;
      const k = idx * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = Math.round(255 * (m === MASK_LAWN ? opacity : opacity * 0.35));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

export function GardenView(p: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const { result: res, geometry: geo, view } = p;
  const g = res.grid;

  const href = useMemo(
    () => buildHeatmap(res, p.mode, p.scaleMax, p.diffMax, p.opacity, p.reference),
    [res, p.mode, p.scaleMax, p.diffMax, p.opacity, p.reference],
  );

  const toMeters = (ev: RPointerEvent): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  };

  const snap = (v: number, s = 0.05) => Math.round(v / s) * s;

  const onMove = (ev: RPointerEvent) => {
    const m = toMeters(ev);
    if (!m) return;
    p.onHover(m);
    if (!drag) return;
    if (drag.kind === 'sprinkler') p.onMoveSprinkler(drag.id, +snap(m.x).toFixed(2), +snap(m.y).toFixed(2));
    else if (drag.kind === 'rotate') {
      const s = res.effective.find((e) => e.id === drag.id);
      if (s) p.onRotateSprinkler(drag.id, (Math.round((Math.atan2(m.y - s.y, m.x - s.x) * 180) / Math.PI) + 360) % 360);
    } else p.onMoveRect(drag.rectKind, drag.id, +snap(m.x - drag.dx, 0.1).toFixed(2), +snap(m.y - drag.dy, 0.1).toFixed(2));
  };

  const startDrag = (ev: RPointerEvent, d: Drag) => {
    ev.stopPropagation();
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    svgRef.current?.setPointerCapture(ev.pointerId);
    setDrag(d);
    p.onDragging(true);
  };
  const endDrag = () => {
    if (drag) {
      setDrag(null);
      p.onDragging(false);
    }
  };

  // Lectura en el punto bajo el cursor
  const hoverInfo = useMemo(() => {
    if (!p.hover) return null;
    const s = sampleGrid(g, p.hover.x, p.hover.y);
    if (!s) return null;
    const parts = res.effective
      .filter((e) => e.active)
      .map((e) => ({ id: e.id, v: contributionAt(e, geo, p.options, p.hover!.x, p.hover!.y) }))
      .filter((c) => c.v > 0);
    const total = parts.reduce((a, c) => a + c.v, 0);
    const ref = p.mode === 'diferencia' && p.reference ? sampleGrid(p.reference.grid, p.hover.x, p.hover.y) : null;
    return { mask: s.mask, total, parts, diff: ref ? s.value - ref.value : null };
  }, [p.hover, g, res, geo, p.options, p.mode, p.reference]);

  const sw = { vectorEffect: 'non-scaling-stroke' as const };
  const fs = Math.max(view.w, view.h) / 38;
  const ticks: number[] = [];
  for (let x = Math.ceil(view.x); x <= view.x + view.w; x++) ticks.push(x);
  const yticks: number[] = [];
  for (let y = Math.ceil(view.y); y <= view.y + view.h; y++) yticks.push(y);
  const clipId = `clip-${p.title.replace(/\W/g, '')}`;
  const hatchId = `hatch-${p.title.replace(/\W/g, '')}`;

  return (
    <figure className="garden">
      <figcaption>{p.title}</figcaption>
      <div className="garden-wrap">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            if (!drag) p.onHover(null);
          }}
          role="img"
          aria-label={`Plano del jardín y mapa de precipitación: ${p.title}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={view.x} y={view.y} width={view.w} height={view.h} />
            </clipPath>
            <pattern id={hatchId} width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="0.4" className="hatch-line" strokeWidth="0.08" />
            </pattern>
          </defs>
          <rect x={view.x} y={view.y} width={view.w} height={view.h} className="paving" />
          <g clipPath={`url(#${clipId})`}>
            {geo.sectors.map((s) => (
              <rect key={s.id} x={s.x} y={s.y} width={s.w} height={s.h} className="lawn" />
            ))}
            {href && (
              <image
                href={href}
                x={g.x0}
                y={g.y0}
                width={g.nx * g.cell}
                height={g.ny * g.cell}
                preserveAspectRatio="none"
                style={{ imageRendering: g.nx > 120 ? 'auto' : 'pixelated' }}
              />
            )}
            {ticks.map((x) => (
              <line key={`gx${x}`} x1={x} x2={x} y1={view.y} y2={view.y + view.h} className={x % 5 === 0 ? 'grid5' : 'grid1'} {...sw} />
            ))}
            {yticks.map((y) => (
              <line key={`gy${y}`} y1={y} y2={y} x1={view.x} x2={view.x + view.w} className={y % 5 === 0 ? 'grid5' : 'grid1'} {...sw} />
            ))}
            {geo.obstacles.map((o) => (
              <g key={o.id}>
                <rect
                  x={o.x}
                  y={o.y}
                  width={o.w}
                  height={o.h}
                  className={`building ${p.editMode === 'terreno' ? 'draggable' : ''}`}
                  {...sw}
                  onPointerDown={(ev) => {
                    if (p.editMode !== 'terreno') return;
                    const m = toMeters(ev);
                    if (m) startDrag(ev, { kind: 'rect', rectKind: 'obstacle', id: o.id, dx: m.x - o.x, dy: m.y - o.y });
                  }}
                />
                <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={`url(#${hatchId})`} pointerEvents="none" />
                <text x={o.x + o.w / 2} y={o.y + o.h / 2} className="building-label" fontSize={fs} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                  {o.name}
                </text>
              </g>
            ))}
            {geo.sectors.map((s) => (
              <rect
                key={`o-${s.id}`}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                className={`sector-outline ${p.editMode === 'terreno' ? 'draggable' : ''}`}
                {...sw}
                onPointerDown={(ev) => {
                  if (p.editMode !== 'terreno') return;
                  const m = toMeters(ev);
                  if (m) startDrag(ev, { kind: 'rect', rectKind: 'sector', id: s.id, dx: m.x - s.x, dy: m.y - s.y });
                }}
              />
            ))}
            {p.options.cornerZoneRadiusM > 0 && res.cornerCenter && (
              <circle cx={res.cornerCenter.x} cy={res.cornerCenter.y} r={p.options.cornerZoneRadiusM} className="corner-zone" {...sw} />
            )}
            {res.effective.map((e) => {
              const col = sprinklerColor(e.id);
              const sel = p.selectedId === e.id;
              const hx = e.x + Math.cos((e.dirDeg * Math.PI) / 180) * Math.min(e.radiusM * 0.45, 2.5);
              const hy = e.y + Math.sin((e.dirDeg * Math.PI) / 180) * Math.min(e.radiusM * 0.45, 2.5);
              return (
                <g key={e.id} opacity={e.active ? 1 : 0.45}>
                  {e.radiusM > 0 && (
                    <path d={wedgePath(e)} className={`wedge ${sel ? 'sel' : ''}`} style={{ stroke: col }} strokeDasharray={e.active ? undefined : '4 3'} {...sw} />
                  )}
                  {p.editMode === 'aspersores' && (
                    <>
                      <line x1={e.x} y1={e.y} x2={hx} y2={hy} style={{ stroke: col }} className="dir-line" {...sw} />
                      <circle
                        cx={hx}
                        cy={hy}
                        r={fs * 0.4}
                        className="handle"
                        style={{ fill: col }}
                        onPointerDown={(ev) => startDrag(ev, { kind: 'rotate', id: e.id })}
                      >
                        <title>Arrastrar para orientar {e.label}</title>
                      </circle>
                    </>
                  )}
                  <circle
                    cx={e.x}
                    cy={e.y}
                    r={fs * 0.55}
                    className={`head ${p.editMode === 'aspersores' ? 'draggable' : ''}`}
                    style={{ fill: col }}
                    {...sw}
                    onPointerDown={(ev) => {
                      p.onSelect(e.id);
                      if (p.editMode === 'aspersores') startDrag(ev, { kind: 'sprinkler', id: e.id });
                    }}
                  />
                  <text x={e.x} y={e.y - fs * 0.95} className="head-label" fontSize={fs * 1.05} textAnchor="middle" pointerEvents="none">
                    {e.label}
                  </text>
                </g>
              );
            })}
            {p.showMinMax && res.lawn.minAt && (
              <g className="marker-min" pointerEvents="none">
                <circle cx={res.lawn.minAt.x} cy={res.lawn.minAt.y} r={fs * 0.45} {...sw} />
                <text x={res.lawn.minAt.x + fs * 0.6} y={res.lawn.minAt.y + fs * 0.35} fontSize={fs * 0.85}>
                  mín {fmt(res.lawn.min)}
                </text>
              </g>
            )}
            {p.showMinMax && res.lawn.maxAt && (
              <g className="marker-max" pointerEvents="none">
                <rect x={res.lawn.maxAt.x - fs * 0.4} y={res.lawn.maxAt.y - fs * 0.4} width={fs * 0.8} height={fs * 0.8} {...sw} />
                <text x={res.lawn.maxAt.x + fs * 0.6} y={res.lawn.maxAt.y + fs * 0.35} fontSize={fs * 0.85}>
                  máx {fmt(res.lawn.max)}
                </text>
              </g>
            )}
            {p.hover && (
              <g pointerEvents="none" className="crosshair">
                <line x1={p.hover.x} x2={p.hover.x} y1={view.y} y2={view.y + view.h} {...sw} />
                <line y1={p.hover.y} y2={p.hover.y} x1={view.x} x2={view.x + view.w} {...sw} />
              </g>
            )}
          </g>
          {/* barra de escala (esquina inferior derecha) */}
          <g className="scalebar" pointerEvents="none" transform={`translate(${view.x + view.w - 5.5} ${view.y + view.h - 0.6})`}>
            <rect x={0} y={0} width={5} height={0.18} />
            <rect x={1} y={0} width={1} height={0.18} className="alt" />
            <rect x={3} y={0} width={1} height={0.18} className="alt" />
            <text x={0} y={-0.2} fontSize={fs * 0.8}>
              0
            </text>
            <text x={5} y={-0.2} fontSize={fs * 0.8} textAnchor="end">
              5 m
            </text>
          </g>
          {ticks
            .filter((x) => x % 5 === 0)
            .map((x) => (
              <text key={`tx${x}`} x={x + 0.1} y={view.y + fs * 0.9} fontSize={fs * 0.75} className="tick">
                {x} m
              </text>
            ))}
          {yticks
            .filter((y) => y % 5 === 0 && y !== 0)
            .map((y) => (
              <text key={`ty${y}`} x={view.x + 0.1} y={y - 0.1} fontSize={fs * 0.75} className="tick">
                {y} m
              </text>
            ))}
        </svg>
        {hoverInfo && p.hover && (
          <div className="tooltip">
            <div>
              x {fmt(p.hover.x, 2)} m · y {fmt(p.hover.y, 2)} m
            </div>
            <div className="tt-main">
              {hoverInfo.mask === MASK_LAWN ? 'Césped' : hoverInfo.mask === MASK_OBSTACLE ? 'Construcción' : 'Fuera del césped'}:{' '}
              <b>{fmt(hoverInfo.total)} mm/h</b>
              {hoverInfo.mask === MASK_LAWN && res.lawn.mean > 0 && <> ({fmt((hoverInfo.total / res.lawn.mean) * 100, 0)} % de la media)</>}
            </div>
            {hoverInfo.diff !== null && (
              <div>
                Diferencia con la referencia: <b>{fmt(hoverInfo.diff)} mm/h</b>
              </div>
            )}
            {hoverInfo.parts.map((c) => (
              <div key={c.id} className="tt-row">
                <span className="sw" style={{ background: sprinklerColor(c.id) }} />
                {c.id}: {fmt(c.v)} mm/h
              </div>
            ))}
            {hoverInfo.parts.length === 0 && <div className="muted">Ningún aspersor alcanza este punto.</div>}
          </div>
        )}
      </div>
    </figure>
  );
}
