import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "@/lib/api";
import { useLiveStream } from "./useLiveStream";
import { GapRibbon } from "./GapRibbon";
import { TimingTower, formatLapTime } from "./TimingTower";
import "./pitwall.css";

const SPEEDS = [1, 5, 10, 30, 60];

export default function LivePage({ year, gp }) {
  const {
    status,
    standings,
    meta,
    lap,
    totalLaps,
    finished,
    sessionBestLap,
    sessionBestDriver,
  } = useLiveStream();

  const [speed, setSpeed] = useState(10);
  const [replay, setReplay] = useState({ running: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/replay/status`);
      setReplay(data);
    } catch {
      /* backend restarting; next poll picks it up */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/replay/${year}/${encodeURIComponent(gp)}?speed=${speed}`,
      );
      setReplay(data);
    } catch (err) {
      setError(
        err?.response?.data?.detail ??
          "Replay did not start. Check the broker is running.",
      );
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_URL}/replay/stop`);
      setReplay(data);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const running = replay.running;
  const flagState = finished ? "chequered" : running ? "green" : "idle";
  const progress =
    replay.total_events > 0
      ? Math.round((replay.sent / replay.total_events) * 100)
      : 0;

  return (
    <div className="pw">
      <header className="pw-header">
        <div className="pw-flag" data-state={flagState} />

        <div className="pw-slot" style={{ minWidth: 190 }}>
          <span className="pw-label">Session</span>
          <span className="pw-slot-value">
            {meta?.event_name ?? gp ?? "No race selected"}
          </span>
        </div>

        <div className="pw-slot">
          <span className="pw-label">Lap</span>
          <span className="pw-lap-count">
            {lap ?? 0}
            <span className="pw-lap-total">
              /{totalLaps ?? meta?.total_laps ?? "\u2014"}
            </span>
          </span>
        </div>

        <div className="pw-slot pw-hide-sm">
          <span className="pw-label">Fastest lap</span>
          <span className="pw-slot-value" style={{ color: "var(--t-purple)" }}>
            {formatLapTime(sessionBestLap)}
            {sessionBestDriver && (
              <span style={{ color: "var(--pw-dim)", fontSize: 11 }}>
                {" "}
                {sessionBestDriver}
              </span>
            )}
          </span>
        </div>

        <div className="pw-slot pw-hide-sm">
          <span className="pw-label">Feed</span>
          <span
            className="pw-slot-value"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {running && <span className="pw-live-dot" />}
            <span style={{ fontSize: 12 }}>
              {status === "connected" ? "CONNECTED" : status.toUpperCase()}
            </span>
          </span>
        </div>

        <div className="pw-controls">
          <select
            className="pw-select"
            value={speed}
            disabled={running}
            aria-label="Replay speed"
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}× speed
              </option>
            ))}
          </select>

          {running ? (
            <button className="pw-btn" data-variant="stop" onClick={stop} disabled={busy}>
              Stop
            </button>
          ) : (
            <button className="pw-btn" data-variant="go" onClick={start} disabled={busy || !gp}>
              {busy ? "Starting" : "Start replay"}
            </button>
          )}
        </div>
      </header>

      <div className="pw-progress">
        <div className="pw-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {error && (
        <div className="pw-empty" style={{ color: "var(--t-red)", padding: "14px 16px" }}>
          {error}
        </div>
      )}

      {standings.length > 0 && <GapRibbon standings={standings} />}

      {standings.length === 0 ? (
        <div className="pw-empty">
          {running
            ? "Waiting for the first lap to complete"
            : "Press start replay to stream a race through the pipeline"}
        </div>
      ) : (
        <TimingTower standings={standings} />
      )}
    </div>
  );
}
