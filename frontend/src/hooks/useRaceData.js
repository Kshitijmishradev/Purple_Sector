import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import { RACES_URL } from "@/lib/api";

const BASE_URL = RACES_URL;

// 1. FETCH METADATA: Drivers, Team Colors, Event Name
export const useRaceMeta = (year, gp) => {
  return useQuery({
    queryKey: ["raceMeta", year, gp],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/${gp}/meta`);
      return data;
    },
    staleTime: Infinity,
    enabled: !!year && !!gp,
  });
};

// 2. FETCH TELEMETRY: Only for selected drivers
export const useDriverTelemetry = (year, gp, selectedDrivers) => {
  // 1. Safety Guard: Force selectedDrivers to be an array
  const driversArray = Array.isArray(selectedDrivers) ? selectedDrivers : [];
  const driversParam = driversArray.join(",");

  return useQuery({
    queryKey: ["telemetry", year, gp, driversParam],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/${gp}/telemetry`, {
        params: { drivers: driversParam },
      });
      return data;
    },
    staleTime: Infinity,
    // 2. Only run if we actually have valid drivers
    enabled: !!year && !!gp && driversArray.length > 0,
  });
};

export const useRaceAnalytics = (year, gp) => {
  return useQuery({
    queryKey: ["raceAnalytics", year, gp],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/${gp}/analytics`);
      return data;
    },
    staleTime: Infinity,
    enabled: !!year && !!gp,
  });
};

export const useRaceCalendar = (year) => {
  return useQuery({
    queryKey: ["raceCalendar", year],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/calendar`);
      return data;
    },
    staleTime: Infinity,
    enabled: !!year,
  });
};

export const useRaceTrackIntel = (year, gp, enabled = true) => {
  return useQuery({
    queryKey: ["raceTrackIntel", year, gp],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/${gp}/track-intel`);
      return data;
    },
    staleTime: Infinity,
    enabled: enabled && !!year && !!gp,
  });
};

/** Per-lap tire compound grid (rows = drivers, columns = laps). */
export const useLapTireMatrix = (year, gp, driverCodes) => {
  const codes = Array.isArray(driverCodes) ? driverCodes.filter(Boolean) : [];
  const driversParam = codes.join(",");
  return useQuery({
    queryKey: ["lapTireMatrix", year, gp, driversParam],
    queryFn: async () => {
      const { data } = await axios.get(
        `${BASE_URL}/${year}/${encodeURIComponent(gp)}/telemetry/lap-matrix`,
        { params: { drivers: driversParam } },
      );
      return data;
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!year && !!gp && codes.length > 0,
  });
};

/** Pace-only telemetry (lap list per driver) — fast, no full telemetry load. */
export const usePaceEvolution = (year, gp, driverCodes) => {
  const codes = Array.isArray(driverCodes) ? driverCodes.filter(Boolean) : [];
  const driversParam = codes.join(",");
  return useQuery({
    queryKey: ["paceEvolution", year, gp, driversParam],
    queryFn: async () => {
      const { data } = await axios.get(`${BASE_URL}/${year}/${gp}/telemetry`, {
        params: { drivers: driversParam },
      });
      return data?.pace_evolution ?? {};
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!year && !!gp && codes.length > 0,
  });
};

/** Full per-lap telemetry + delta (1–2 laps). Backend uses FastF1. */
export const useLapCompareTelemetry = (year, gp, spec) => {
  const { driverA, lapA, driverB, lapB, enabled } = spec ?? {};
  return useQuery({
    queryKey: ["lapCompareTelemetry", year, gp, driverA, lapA, driverB, lapB],
    queryFn: async () => {
      const { data } = await axios.get(
        `${BASE_URL}/${year}/${encodeURIComponent(gp)}/telemetry/lap-compare`,
        {
          params: {
            drivers: `${driverA},${driverB}`,
            laps: `${lapA},${lapB}`,
          },
        },
      );
      return data;
    },
    staleTime: 1000 * 60 * 30,
    enabled:
      !!enabled &&
      !!year &&
      !!gp &&
      driverA &&
      driverB &&
      lapA != null &&
      lapB != null,
  });
};
