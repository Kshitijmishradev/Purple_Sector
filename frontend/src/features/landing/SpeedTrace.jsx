import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * A lap speed trace with the middle sector lit purple.
 *
 * This is the page's thesis: purple is the FIA colour for fastest sector, so
 * the hero states what the product is about and what it's called in the same
 * mark. A speed trace is also the single most recognisable artifact of F1
 * data work — anyone in the audience reads it instantly, and nobody's
 * template hero looks like this.
 *
 * Geometry is deterministic, not random: braking drops sharply, acceleration
 * builds gradually, which is what makes a trace read as a real lap rather
 * than a waveform.
 */

// distance along lap (0-100) -> speed km/h at that point
const CONTROL = [
  [0, 322], [7, 92], [13, 138], [21, 305], [28, 112], [36, 286],
  [44, 98], [52, 312], [60, 145], [68, 252], [75, 108], [83, 300],
  [91, 158], [100, 322],
];

const W = 1000;
const H = 200;
const V_MIN = 70;
const V_MAX = 340;

function speedAt(d) {
  for (let i = 0; i < CONTROL.length - 1; i++) {
    const [d0, v0] = CONTROL[i];
    const [d1, v1] = CONTROL[i + 1];
    if (d >= d0 && d <= d1) {
      const t = (d - d0) / (d1 - d0);
      // Braking is violent, acceleration is progressive. Different easing
      // each way is what stops this looking like a sine wave.
      const eased = v1 < v0 ? 1 - Math.pow(1 - t, 3.2) : Math.pow(t, 1.7);
      return v0 + (v1 - v0) * eased;
    }
  }
  return CONTROL[CONTROL.length - 1][1];
}

const toX = (d) => (d / 100) * W;
const toY = (v) => H - ((v - V_MIN) / (V_MAX - V_MIN)) * H;

function buildPath(from, to, samples = 260) {
  let path = "";
  for (let i = 0; i <= samples; i++) {
    const d = from + ((to - from) * i) / samples;
    const x = toX(d).toFixed(2);
    const y = toY(speedAt(d)).toFixed(2);
    path += `${i === 0 ? "M" : "L"}${x} ${y}`;
  }
  return path;
}

export function SpeedTrace() {
  const fullRef = useRef(null);
  const [marker, setMarker] = useState(null);
  const [reduced, setReduced] = useState(false);

  const paths = useMemo(
    () => ({
      full: buildPath(0, 100),
      s2: buildPath(33, 66, 120),
    }),
    [],
  );

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced || !fullRef.current) return;
    const path = fullRef.current;
    const length = path.getTotalLength();
    let frame;
    const started = performance.now();

    const tick = (now) => {
      const t = ((now - started) / 9000) % 1; // 9s lap
      const point = path.getPointAtLength(t * length);
      setMarker({ x: point.x, y: point.y, t });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  return (
    <svg
      className="ps-trace"
      viewBox={`0 -14 ${W} ${H + 46}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Speed trace across one lap, with the second sector highlighted as fastest"
    >
      {/* sector boundaries */}
      {[33, 66].map((d) => (
        <line
          key={d}
          x1={toX(d)}
          x2={toX(d)}
          y1={-14}
          y2={H + 16}
          className="ps-trace-divider"
        />
      ))}

      {/* sector 2 fill, the purple one */}
      <path d={`${paths.s2}L${toX(66)} ${H + 16}L${toX(33)} ${H + 16}Z`} className="ps-trace-fill" />

      {/* the lap */}
      <path ref={fullRef} d={paths.full} className="ps-trace-line" />
      <path d={paths.s2} className="ps-trace-line-hot" />

      {/* travelling marker */}
      {marker && (
        <g>
          <circle cx={marker.x} cy={marker.y} r="4.5" className="ps-trace-dot" />
          <circle cx={marker.x} cy={marker.y} r="11" className="ps-trace-halo" />
        </g>
      )}

      <text x={toX(16)} y={H + 34} className="ps-trace-label">SECTOR 1</text>
      <text x={toX(49)} y={H + 34} className="ps-trace-label is-hot">SECTOR 2 · FASTEST</text>
      <text x={toX(83)} y={H + 34} className="ps-trace-label">SECTOR 3</text>
    </svg>
  );
}
