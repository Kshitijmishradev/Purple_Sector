import React, { useMemo } from "react";

/**
 * Field spread as a single horizontal strip.
 *
 * Each car is a tick placed at its real gap to the leader, so the shape of the
 * race is readable without parsing any numbers: a tight cluster is a DRS
 * train, a wide space is clean air. This is the view a race engineer glances
 * at between radio calls, and it's the one thing a timing table can't show.
 *
 * Labels are thinned rather than drawn for every car — overlapping text in a
 * pack would destroy the exact reading the ribbon exists to give.
 */
export function GapRibbon({ standings }) {
  const { cars, maxGap } = useMemo(() => {
    const onLeadLap = standings.filter((row) => row.gap_s != null);
    const largest = onLeadLap.reduce(
      (acc, row) => Math.max(acc, row.gap_s ?? 0),
      0,
    );
    // Never let a two-car field zoom to absurd resolution.
    const scale = Math.max(largest, 5);

    let lastLabelled = -Infinity;
    const cars = onLeadLap.map((row) => {
      const pct = (row.gap_s / scale) * 96; // 4% right margin
      const labelled = pct - lastLabelled > 4.5;
      if (labelled) lastLabelled = pct;
      return { ...row, pct, labelled };
    });

    return { cars, maxGap: scale };
  }, [standings]);

  if (cars.length === 0) return null;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => (f * maxGap).toFixed(1));

  return (
    <div className="pw-ribbon" aria-label="Field spread by gap to leader">
      <div className="pw-ribbon-grid" />

      {cars.map((car) => (
        <React.Fragment key={car.code}>
          <div
            className="pw-car"
            data-leader={car.live_position === 1}
            style={{ left: `${car.pct}%`, background: car.color, color: car.color }}
            title={`${car.code} · ${car.gap}`}
          />
          {car.labelled && (
            <span className="pw-car-tag" style={{ left: `${car.pct}%` }}>
              {car.code}
            </span>
          )}
        </React.Fragment>
      ))}

      <div className="pw-ribbon-axis">
        {ticks.map((t, i) => (
          <span key={i}>{i === 0 ? "LEADER" : `+${t}s`}</span>
        ))}
      </div>
    </div>
  );
}
