import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/api";

/**
 * Subscribes to the live standings socket.
 *
 * Deliberately not TanStack Query: that models request/response with a cache,
 * and this is a push stream. Trying to force one into the other is where an
 * afternoon disappears. Plain state + a ref to the socket is the right shape.
 */
export function useLiveStream() {
  const [status, setStatus] = useState("connecting");
  const [standings, setStandings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [lap, setLap] = useState(null);
  const [totalLaps, setTotalLaps] = useState(null);
  const [finished, setFinished] = useState(false);
  const [sessionBestLap, setSessionBestLap] = useState(null);
  const [sessionBestDriver, setSessionBestDriver] = useState(null);

  const socketRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);

  const connect = useCallback(() => {
    const socket = new WebSocket(`${WS_URL}/ws/live`);
    socketRef.current = socket;

    socket.onopen = () => {
      retryRef.current = 0;
      setStatus("connected");
    };

    socket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "session_start") {
        setMeta(payload.meta ?? null);
        setStandings([]);
        setLap(null);
        setTotalLaps(payload.meta?.total_laps ?? null);
        setFinished(false);
        setSessionBestLap(null);
        setSessionBestDriver(null);
        return;
      }

      if (payload.type === "session_end") {
        setFinished(true);
        return;
      }

      if (payload.type === "standings") {
        setStandings(payload.standings ?? []);
        setLap(payload.lap ?? null);
        if (payload.total_laps) setTotalLaps(payload.total_laps);
        if (payload.session_best_lap != null) {
          setSessionBestLap(payload.session_best_lap);
          setSessionBestDriver(payload.session_best_driver ?? null);
        }
      }
    };

    socket.onclose = () => {
      setStatus("disconnected");
      // Backoff caps at 10s so a restarted backend reconnects promptly
      // without hammering it while it boots.
      const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null; // prevent reconnect on unmount
        socket.close();
      }
    };
  }, [connect]);

  return {
    status,
    standings,
    meta,
    lap,
    totalLaps,
    finished,
    sessionBestLap,
    sessionBestDriver,
  };
}
