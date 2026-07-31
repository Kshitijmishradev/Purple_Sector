import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import {
  useRaceMeta,
  usePaceEvolution,
  useLapTireMatrix,
  useLapCompareTelemetry,
} from "../../hooks/useRaceData";
import DriverPanel from "../../components/DriverPanel";
import LapTireMatrixPanel from "./LapTireMatrixPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

const SYNC_ID = "kidō-telemetry";

function formatLapTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function linInterp(x, xs, ys) {
  if (!xs?.length || !ys?.length) return null;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0;
  while (i < xs.length - 1 && xs[i + 1] < x) i += 1;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + t * (ys[i + 1] - ys[i]);
}

function buildAlignedRows(laps, deltaPayload) {
  if (!laps?.length) return [];
  const grid =
    laps.length === 2 && deltaPayload?.distance?.length
      ? deltaPayload.distance
      : laps[0].series.distance;

  return grid.map((d, i) => {
    const row = { distance: d };
    if (
      laps.length === 2 &&
      deltaPayload?.delta_s &&
      deltaPayload.delta_s[i] != null
    ) {
      row.delta_s = deltaPayload.delta_s[i];
    }
    laps.forEach((lap, j) => {
      const s = lap.series;
      const pre = `d${j}`;
      row[`${pre}_speed`] = linInterp(d, s.distance, s.speed);
      row[`${pre}_throttle`] = linInterp(d, s.distance, s.throttle);
      row[`${pre}_brake`] = linInterp(d, s.distance, s.brake);
      row[`${pre}_rpm`] = linInterp(d, s.distance, s.rpm);
      row[`${pre}_gear`] = linInterp(d, s.distance, s.gear);
    });
    return row;
  });
}

function TrackMap({ laps }) {
  const paths = useMemo(() => {
    if (!laps?.length) return [];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    laps.forEach((lap) => {
      const { x, y } = lap.series;
      x.forEach((xi, i) => {
        minX = Math.min(minX, xi);
        maxX = Math.max(maxX, xi);
        minY = Math.min(minY, y[i]);
        maxY = Math.max(maxY, y[i]);
      });
    });
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const pad = 0.04;
    return laps.map((lap) => {
      const { x, y } = lap.series;
      const pts = x
        .map((xi, i) => {
          const px = pad + ((xi - minX) / w) * (1 - 2 * pad);
          const py = pad + (1 - (y[i] - minY) / h) * (1 - 2 * pad);
          return `${(px * 100).toFixed(2)},${(py * 100).toFixed(2)}`;
        })
        .join(" ");
      return { d: pts, color: lap.color, label: `${lap.driver} L${lap.lap}` };
    });
  }, [laps]);

  if (!paths.length) return null;

  return (
    <Card className="overflow-hidden border-border/80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="size-4 text-racing" />
          Track map
        </CardTitle>
        <CardDescription>
          XY trace from car telemetry (FastF1). Compare two laps overlaid.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative aspect-[1.55/1] w-full rounded-lg bg-muted/30 ring-1 ring-border/60">
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[4rem] font-black uppercase tracking-[0.28em] text-foreground/[0.04]"
            aria-hidden
          >
            PURPLE SECTOR
          </div>
          <svg
            viewBox="0 0 100 100"
            className="relative h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {paths.map((p) => (
              <polyline
                key={p.label}
                fill="none"
                stroke={p.color}
                strokeWidth="0.9"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={p.d}
                opacity={0.95}
              />
            ))}
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {laps.map((lap) => (
            <div key={lap.driver + lap.lap} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: lap.color }}
              />
              <span className="font-bold text-foreground">
                {lap.driver} — Lap {lap.lap}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const chartWrap =
  "rounded-xl border border-border/60 bg-card/80 p-3 ring-1 ring-foreground/5";

const TelemetryPage = ({ year, gp }) => {
  const meta = useRaceMeta(year, gp);
  const drivers = useMemo(() => meta.data?.drivers ?? [], [meta.data?.drivers]);

  /** Explicit picks from the driver panel; empty means “use default pair” for comparison. */
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [lapA, setLapA] = useState("");
  const [lapB, setLapB] = useState("");
  const [shouldLoad, setShouldLoad] = useState(false);

  const comparisonPair = useMemo(() => {
    if (selectedDrivers.length >= 2) {
      return [selectedDrivers[0], selectedDrivers[1]];
    }
    if (selectedDrivers.length === 1) {
      const other =
        drivers.find((d) => d.code !== selectedDrivers[0])?.code ??
        drivers[0]?.code;
      return [selectedDrivers[0], other].filter(Boolean);
    }
    if (drivers.length >= 2) {
      return [drivers[0].code, drivers[1].code];
    }
    if (drivers.length === 1) {
      return [drivers[0].code, drivers[0].code];
    }
    return [];
  }, [selectedDrivers, drivers]);

  const resolvedDriverA = comparisonPair[0] ?? "";
  const resolvedDriverB = comparisonPair[1] ?? "";

  const panelHighlight = useMemo(() => {
    if (selectedDrivers.length >= 2) {
      return [selectedDrivers[0], selectedDrivers[1]];
    }
    if (selectedDrivers.length === 1) {
      return [selectedDrivers[0]];
    }
    return comparisonPair;
  }, [selectedDrivers, comparisonPair]);

  const handleTelemetryDriverToggle = (code) => {
    setSelectedDrivers((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return [prev[0], code];
      return [...prev, code];
    });
    setLapA("");
    setLapB("");
  };

  const handleTelemetryDriverClear = () => {
    setSelectedDrivers([]);
    setLapA("");
    setLapB("");
  };

  const pace = usePaceEvolution(year, gp, [resolvedDriverA, resolvedDriverB]);

  const lapMatrix = useLapTireMatrix(year, gp, [
    resolvedDriverA,
    resolvedDriverB,
  ]);

  const lapsOptionsA = useMemo(() => {
    const fromMatrix = lapMatrix.data?.drivers?.[resolvedDriverA];
    if (Array.isArray(fromMatrix) && fromMatrix.length) {
      return fromMatrix
        .map((r) => ({ l: r.lap, t: r.lap_time_s ?? 0 }))
        .sort((a, b) => a.l - b.l);
    }
    const list = pace.data?.[resolvedDriverA];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => a.l - b.l);
  }, [lapMatrix.data, pace.data, resolvedDriverA]);

  const lapsOptionsB = useMemo(() => {
    const fromMatrix = lapMatrix.data?.drivers?.[resolvedDriverB];
    if (Array.isArray(fromMatrix) && fromMatrix.length) {
      return fromMatrix
        .map((r) => ({ l: r.lap, t: r.lap_time_s ?? 0 }))
        .sort((a, b) => a.l - b.l);
    }
    const list = pace.data?.[resolvedDriverB];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => a.l - b.l);
  }, [lapMatrix.data, pace.data, resolvedDriverB]);

  const matrixHasBothDrivers = useMemo(() => {
    const d = lapMatrix.data?.drivers;
    if (!d || !resolvedDriverA || !resolvedDriverB) return false;
    return (
      (d[resolvedDriverA]?.length ?? 0) > 0 &&
      (d[resolvedDriverB]?.length ?? 0) > 0
    );
  }, [lapMatrix.data, resolvedDriverA, resolvedDriverB]);

  const showLapSelectFallback =
    lapMatrix.isFetched &&
    !matrixHasBothDrivers &&
    (lapsOptionsA.length > 0 || lapsOptionsB.length > 0);

  const handlePickLapFromMatrix = (code, lapNum) => {
    const n = String(lapNum);
    if (code === resolvedDriverA) setLapA(n);
    else if (code === resolvedDriverB) setLapB(n);
  };

  const resolvedLapA = useMemo(() => {
    if (!lapsOptionsA.length) return "";
    if (lapA && lapsOptionsA.some((x) => String(x.l) === lapA)) return lapA;
    return String(lapsOptionsA[Math.floor(lapsOptionsA.length / 2)].l);
  }, [lapsOptionsA, lapA]);

  const resolvedLapB = useMemo(() => {
    if (!lapsOptionsB.length) return "";
    if (lapB && lapsOptionsB.some((x) => String(x.l) === lapB)) return lapB;
    return String(lapsOptionsB[Math.floor(lapsOptionsB.length / 2)].l);
  }, [lapsOptionsB, lapB]);

  const compare = useLapCompareTelemetry(year, gp, {
    driverA: resolvedDriverA,
    lapA: resolvedLapA ? Number(resolvedLapA) : null,
    driverB: resolvedDriverB,
    lapB: resolvedLapB ? Number(resolvedLapB) : null,
    enabled: shouldLoad,
  });

  const chartData = useMemo(
    () =>
      buildAlignedRows(compare.data?.laps, compare.data?.delta).filter(
        (r) => r.distance != null,
      ),
    [compare.data],
  );

  const corners =
    compare.data?.corners?.filter((c) => c.distance_m != null) ?? [];

  const deltaMs = useMemo(() => {
    const la = compare.data?.laps?.[0];
    const lb = compare.data?.laps?.[1];
    if (la?.lap_time_s == null || lb?.lap_time_s == null) return null;
    return lb.lap_time_s - la.lap_time_s;
  }, [compare.data]);

  if (meta.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (meta.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load session</AlertTitle>
        <AlertDescription>{meta.error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-headline text-2xl font-black tracking-tight text-foreground">
            Lap telemetry
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compare two laps like{" "}
            <a
              href="https://www.gp-tempo.com"
              target="_blank"
              rel="noreferrer"
              className="text-racing underline-offset-4 hover:underline"
            >
              GP Tempo
            </a>
            : speed, delta, throttle, brake, RPM, and gear on a shared distance
            axis (FastF1 data).
          </p>
        </div>
      </div>

      <DriverPanel
        allDrivers={drivers}
        selectedDrivers={panelHighlight}
        onToggle={handleTelemetryDriverToggle}
        onClear={handleTelemetryDriverClear}
        title="Telemetry drivers"
        description="Select two drivers (max two highlighted). Order: 1st = Lap A / teal, 2nd = Lap B / orange. With one pick, the other slot uses the next driver on the grid. Reset clears your picks and restores defaults."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-racing" />
            Laps &amp; tires
          </CardTitle>
          <CardDescription>
            Rows = drivers (Lap A / Lap B), columns = lap number; each cell is
            the tire compound for that lap. Click a cell to set that lap for the
            driver, then load. First telemetry load may take a while while
            FastF1 downloads data.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-3">
            <LapTireMatrixPanel
              matrix={lapMatrix.data}
              driverA={resolvedDriverA}
              driverB={resolvedDriverB}
              selectedLapA={resolvedLapA}
              selectedLapB={resolvedLapB}
              onPickLap={handlePickLapFromMatrix}
              isLoading={lapMatrix.isLoading}
              error={
                lapMatrix.isError
                  ? (lapMatrix.error?.message ??
                    lapMatrix.error?.response?.data?.detail ??
                    "Request failed")
                  : null
              }
            />
            {showLapSelectFallback && (
              <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                <p className="col-span-full text-xs text-muted-foreground">
                  Tire matrix unavailable — pick laps from the list.
                </p>
                <div className="space-y-2">
                  <Label>
                    Lap A —{" "}
                    <span className="font-mono text-racing">
                      {resolvedDriverA || "—"}
                    </span>
                  </Label>
                  <Select
                    value={resolvedLapA}
                    onValueChange={setLapA}
                    disabled={!lapsOptionsA.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Lap" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {lapsOptionsA.map((row) => (
                        <SelectItem key={row.l} value={String(row.l)}>
                          Lap {row.l} · {formatLapTime(row.t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    Lap B —{" "}
                    <span className="font-mono text-[#F47600]">
                      {resolvedDriverB || "—"}
                    </span>
                  </Label>
                  <Select
                    value={resolvedLapB}
                    onValueChange={setLapB}
                    disabled={!lapsOptionsB.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Lap" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {lapsOptionsB.map((row) => (
                        <SelectItem key={row.l} value={String(row.l)}>
                          Lap {row.l} · {formatLapTime(row.t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <Button
            type="button"
            className="w-full shrink-0 lg:w-auto"
            disabled={
              !resolvedDriverA ||
              !resolvedDriverB ||
              !resolvedLapA ||
              !resolvedLapB ||
              compare.isFetching
            }
            onClick={() => setShouldLoad(true)}
          >
            {compare.isFetching ? "Loading telemetry…" : "Load comparison"}
          </Button>
        </CardContent>
      </Card>

      {compare.isError && (
        <Alert variant="destructive">
          <AlertTitle>Telemetry error</AlertTitle>
          <AlertDescription>
            {compare.error?.response?.data?.detail ??
              compare.error?.message ??
              "Could not load lap telemetry."}
          </AlertDescription>
        </Alert>
      )}

      {compare.isFetching && shouldLoad && (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )}

      {compare.data?.laps?.length === 2 && !compare.isFetching && (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <div className="grid gap-3 sm:grid-cols-2">
              {compare.data.laps.map((lap) => (
                <Card
                  key={`${lap.driver}-${lap.lap}`}
                  className="border-l-4 bg-card/90"
                  style={{ borderLeftColor: lap.color }}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardDescription>
                        {compare.data.event_name}
                      </CardDescription>
                      <CardTitle className="mt-1 font-headline text-lg">
                        <span style={{ color: lap.color }}>{lap.driver}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — Lap {lap.lap}
                        </span>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="font-mono text-3xl font-black tabular-nums tracking-tight">
                      {formatLapTime(lap.lap_time_s)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <TrackMap laps={compare.data.laps} />
          </div>

          {deltaMs != null && (
            <p className="text-center text-sm text-muted-foreground">
              Lap time delta (B vs A):{" "}
              <span
                className={cn(
                  "font-mono font-bold tabular-nums",
                  deltaMs <= 0 ? "text-emerald-400" : "text-racing",
                )}
              >
                {deltaMs >= 0 ? "+" : ""}
                {deltaMs.toFixed(3)}s
              </span>
            </p>
          )}

          <div className={chartWrap}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Speed (km/h)
            </p>
            <div className="relative h-[280px]">
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black uppercase text-foreground/[0.05]"
                aria-hidden
              >
                PURPLE SECTOR
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  syncId={SYNC_ID}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border/40"
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    dataKey="distance"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 11, fill: "#a1a1aa" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(1)}km`}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(v) => [Number(v).toFixed(1), ""]}
                    labelFormatter={(d) => `Dist ${(d / 1000).toFixed(3)} km`}
                  />
                  {corners.map((c) =>
                    c.distance_m != null ? (
                      <ReferenceLine
                        key={`c-${c.number}-${c.distance_m}`}
                        x={c.distance_m}
                        stroke="#71717a"
                        strokeDasharray="4 4"
                        strokeOpacity={0.35}
                      />
                    ) : null,
                  )}
                  <Line
                    type="monotone"
                    dataKey="d0_speed"
                    stroke={compare.data.laps[0].color}
                    dot={false}
                    strokeWidth={1.5}
                    name={`${compare.data.laps[0].driver}`}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="d1_speed"
                    stroke={compare.data.laps[1].color}
                    dot={false}
                    strokeWidth={1.5}
                    name={`${compare.data.laps[1].driver}`}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={chartWrap}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Delta (s) — B vs A at same distance
            </p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  syncId={SYNC_ID}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border/40"
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    dataKey="distance"
                    domain={["dataMin", "dataMax"]}
                    hide
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                  <ReferenceLine y={0} stroke="#71717a" strokeOpacity={0.5} />
                  <Line
                    type="monotone"
                    dataKey="delta_s"
                    stroke="#a78bfa"
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {["throttle", "brake"].map((key) => (
              <div key={key} className={chartWrap}>
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  {key === "throttle" ? "Throttle (%)" : "Brake"}
                </p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {key === "throttle" ? (
                      <LineChart
                        data={chartData}
                        syncId={SYNC_ID}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border/40"
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          dataKey="distance"
                          domain={["dataMin", "dataMax"]}
                          hide
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Line
                          type="monotone"
                          dataKey="d0_throttle"
                          stroke={compare.data.laps[0].color}
                          dot={false}
                          strokeWidth={1.2}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="d1_throttle"
                          stroke={compare.data.laps[1].color}
                          dot={false}
                          strokeWidth={1.2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    ) : (
                      <AreaChart
                        data={chartData}
                        syncId={SYNC_ID}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="stroke-border/40"
                          vertical={false}
                        />
                        <XAxis
                          type="number"
                          dataKey="distance"
                          domain={["dataMin", "dataMax"]}
                          hide
                        />
                        <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                        <Area
                          type="step"
                          dataKey="d0_brake"
                          stroke={compare.data.laps[0].color}
                          fill={compare.data.laps[0].color}
                          fillOpacity={0.15}
                          strokeWidth={1}
                          isAnimationActive={false}
                        />
                        <Area
                          type="step"
                          dataKey="d1_brake"
                          stroke={compare.data.laps[1].color}
                          fill={compare.data.laps[1].color}
                          fillOpacity={0.12}
                          strokeWidth={1}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className={chartWrap}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                RPM
              </p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    syncId={SYNC_ID}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border/40"
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      dataKey="distance"
                      domain={["dataMin", "dataMax"]}
                      hide
                    />
                    <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                    <Line
                      type="monotone"
                      dataKey="d0_rpm"
                      stroke={compare.data.laps[0].color}
                      dot={false}
                      strokeWidth={1.2}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="d1_rpm"
                      stroke={compare.data.laps[1].color}
                      dot={false}
                      strokeWidth={1.2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className={chartWrap}>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Gear
              </p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    syncId={SYNC_ID}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border/40"
                      vertical={false}
                    />
                    <XAxis
                      type="number"
                      dataKey="distance"
                      domain={["dataMin", "dataMax"]}
                      hide
                    />
                    <YAxis
                      domain={[0, 8]}
                      ticks={[0, 2, 4, 6, 8]}
                      tick={{ fontSize: 11 }}
                    />
                    <Line
                      type="step"
                      dataKey="d0_gear"
                      stroke={compare.data.laps[0].color}
                      dot={false}
                      strokeWidth={1.2}
                      isAnimationActive={false}
                    />
                    <Line
                      type="step"
                      dataKey="d1_gear"
                      stroke={compare.data.laps[1].color}
                      dot={false}
                      strokeWidth={1.2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {!shouldLoad && (
        <p className="text-center text-sm text-muted-foreground">
          Choose two laps and press <strong>Load comparison</strong> to fetch
          telemetry.
        </p>
      )}
    </div>
  );
};

export default TelemetryPage;
