import React from "react";

/** 84.213 -> 1:24.213 — how lap times are read everywhere in the sport. */
export function formatLapTime(seconds) {
  if (seconds == null) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3).padStart(6, "0");
  return mins > 0 ? `${mins}:${secs}` : secs;
}

function lapFlag(row) {
  if (row.last_was_session_best) return "session";
  if (row.last_was_personal_best) return "personal";
  return undefined;
}

export function TimingTower({ standings }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="pw-table">
        <thead>
          <tr>
            <th data-align="left">Pos</th>
            <th data-align="left">Driver</th>
            <th className="pw-hide-sm">Lap</th>
            <th>Gap</th>
            <th>Int</th>
            <th>Last</th>
            <th className="pw-hide-sm">Best</th>
            <th className="pw-hide-sm">Sectors</th>
            <th>Tyre</th>
            <th className="pw-hide-sm">Stops</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.code} data-pit={row.in_pit === true}>
              <td data-align="left" className="pw-pos">
                {row.live_position}
              </td>

              <td data-align="left">
                <span className="pw-driver">
                  <span
                    className="pw-team-bar"
                    style={{ background: row.color }}
                  />
                  <span className="pw-code">{row.code}</span>
                  <span className="pw-team-name pw-hide-sm">{row.team}</span>
                  {row.in_pit && <span className="pw-pit-tag">PIT</span>}
                </span>
              </td>

              <td className="pw-hide-sm">{row.lap ?? "—"}</td>
              <td>{row.gap ?? "—"}</td>
              <td>{row.interval ?? "—"}</td>

              <td className="pw-time" data-flag={lapFlag(row)}>
                {formatLapTime(row.last_lap_s)}
              </td>

              <td
                className="pw-time pw-hide-sm"
                data-flag={row.is_session_best_holder ? "session" : undefined}
              >
                {formatLapTime(row.best_lap_s)}
              </td>

              <td className="pw-hide-sm">
                <span className="pw-sectors">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="pw-sector"
                      data-flag={row.sector_flags?.[i] ?? undefined}
                      title={
                        row.sectors?.[i] != null
                          ? `S${i + 1} ${row.sectors[i].toFixed(3)}`
                          : `S${i + 1} —`
                      }
                    />
                  ))}
                </span>
              </td>

              <td>
                <span className="pw-tyre">
                  <span className="pw-compound" data-c={row.compound}>
                    {(row.compound ?? "?").charAt(0)}
                  </span>
                  <span className="pw-age">{row.tyre_age ?? 0}L</span>
                </span>
              </td>

              <td className="pw-hide-sm">{row.pit_stops ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
