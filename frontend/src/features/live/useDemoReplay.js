import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "@/lib/api";

function makeState(meta) {
  return {
    meta: meta ?? {},
    drivers: {},
    sessionBestLap: null,
    sessionBestDriver: null,
    sessionBestSectors: [null, null, null],
  };
}

function applyEvent(state, event) {
  const reference = (state.meta.drivers ?? []).find((driver) => driver.code === event.driver) ?? {};
  const entry = state.drivers[event.driver] ?? {
    code: event.driver,
    name: reference.name ?? event.driver,
    team: reference.team ?? "Unknown",
    color: reference.color ?? "#777777",
    pit_stops: 0,
    best_sectors: [null, null, null],
    stint_start_lap: event.lap ?? 1,
  };

  if (event.stint !== entry.stint) entry.stint_start_lap = event.lap ?? entry.stint_start_lap;
  entry.lap = event.lap;
  entry.position = event.position;
  entry.last_lap_s = event.lap_time_s;
  entry.sectors = [event.s1_s, event.s2_s, event.s3_s];
  entry.compound = event.compound;
  entry.stint = event.stint;
  entry.elapsed_s = event.t;
  entry.track_status = event.track_status;
  entry.pit_stops += event.pit_in ? 1 : 0;
  entry.in_pit = Boolean(event.pit_in || event.pit_out);
  entry.tyre_age = Math.max(0, (event.lap ?? 0) - entry.stint_start_lap);

  entry.last_was_personal_best = false;
  entry.last_was_session_best = false;
  if (event.lap_time_s != null) {
    if (entry.best_lap_s == null || event.lap_time_s < entry.best_lap_s) {
      entry.best_lap_s = event.lap_time_s;
      entry.last_was_personal_best = true;
    }
    if (state.sessionBestLap == null || event.lap_time_s < state.sessionBestLap) {
      state.sessionBestLap = event.lap_time_s;
      state.sessionBestDriver = event.driver;
      entry.last_was_session_best = true;
    }
  }

  entry.sector_flags = entry.sectors.map((value, index) => {
    if (value == null) return null;
    const own = entry.best_sectors[index];
    if (own == null || value < own) entry.best_sectors[index] = value;
    const overall = state.sessionBestSectors[index];
    if (overall == null || value < overall) {
      state.sessionBestSectors[index] = value;
      return "session";
    }
    return value <= entry.best_sectors[index] ? "personal" : "slower";
  });
  state.drivers[event.driver] = entry;
}

function standings(state) {
  const rows = Object.values(state.drivers)
    .sort((a, b) => (b.lap ?? 0) - (a.lap ?? 0) || (a.elapsed_s ?? 0) - (b.elapsed_s ?? 0))
    .map((row) => ({ ...row }));
  if (!rows.length) return [];
  const leader = rows[0];
  rows.forEach((row, index) => {
    row.live_position = index + 1;
    const lapped = (row.lap ?? 0) < (leader.lap ?? 0);
    if (index === 0) {
      row.gap = "LEADER";
      row.gap_s = 0;
      row.interval = "—";
    } else if (lapped) {
      const down = (leader.lap ?? 0) - (row.lap ?? 0);
      row.gap = `+${down} LAP${down > 1 ? "S" : ""}`;
      row.gap_s = null;
      row.interval = row.gap;
    } else {
      row.gap_s = Number(((row.elapsed_s ?? 0) - (leader.elapsed_s ?? 0)).toFixed(3));
      row.gap = `+${row.gap_s.toFixed(3)}`;
      const ahead = rows[index - 1];
      const delta = (row.elapsed_s ?? 0) - (ahead.elapsed_s ?? 0);
      row.interval = (ahead.lap ?? 0) === (row.lap ?? 0) ? `+${delta.toFixed(3)}` : row.gap;
    }
    row.is_session_best_holder = row.code === state.sessionBestDriver;
  });
  return rows;
}

export function useDemoReplay(year, gp) {
  const [bundle, setBundle] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [standingsRows, setStandingsRows] = useState([]);
  const [sessionBest, setSessionBest] = useState({ lap: null, driver: null });
  const [sent, setSent] = useState(0);
  const [speed, setSpeed] = useState(10);
  const stateRef = useRef(null);
  const indexRef = useRef(0);
  const frameRef = useRef(null);
  const startedRef = useRef(0);
  const requestKey = `${year ?? ""}:${gp ?? ""}`;
  const activeBundle = loadedKey === requestKey ? bundle : null;
  const activeError = loadError?.key === requestKey ? loadError.message : null;

  useEffect(() => {
    let cancelled = false;
    if (!year || !gp) return () => { cancelled = true; };
    axios.get(`${API_URL}/demo/replay/${year}/${encodeURIComponent(gp)}`)
      .then(({ data }) => { if (!cancelled) { setBundle(data); setLoadedKey(requestKey); } })
      .catch((error) => { if (!cancelled) setLoadError({ key: requestKey, message: error?.response?.data?.detail ?? "Demo replay data unavailable" }); });
    return () => { cancelled = true; };
  }, [year, gp, requestKey]);

  const stop = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (!activeBundle?.events?.length) return;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    stateRef.current = makeState(activeBundle.meta);
    indexRef.current = 0;
    startedRef.current = performance.now();
    setStandingsRows([]);
    setSent(0);
    setFinished(false);
    setRunning(true);

    const firstT = activeBundle.events[0].t;
    const tick = (now) => {
      const elapsed = ((now - startedRef.current) / 1000) * speed;
      while (indexRef.current < activeBundle.events.length && activeBundle.events[indexRef.current].t - firstT <= elapsed) {
        applyEvent(stateRef.current, activeBundle.events[indexRef.current]);
        indexRef.current += 1;
      }
      setSent(indexRef.current);
      setStandingsRows(standings(stateRef.current));
      setSessionBest({ lap: stateRef.current.sessionBestLap, driver: stateRef.current.sessionBestDriver });
      if (indexRef.current >= activeBundle.events.length) {
        setRunning(false);
        setFinished(true);
        frameRef.current = null;
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [activeBundle, speed]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  return {
    status: activeError ? "error" : activeBundle ? "demo" : "loading",
    error: activeError,
    standings: standingsRows,
    meta: activeBundle?.meta ?? null,
    lap: standingsRows[0]?.lap ?? null,
    totalLaps: activeBundle?.meta?.total_laps ?? null,
    finished,
    sessionBestLap: sessionBest.lap,
    sessionBestDriver: sessionBest.driver,
    running,
    sent,
    totalEvents: activeBundle?.events?.length ?? 0,
    speed,
    setSpeed,
    start,
    stop,
  };
}
