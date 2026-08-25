import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getDriverColor } from "../../theme/f1colors";

const PaceChart = ({ data, selectedDrivers }) => {
  if (!selectedDrivers?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 ring-1 ring-foreground/5">
        <div className="mb-4 flex justify-between">
          <h3 className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted-foreground">
            Lap-by-lap pace chart
          </h3>
        </div>
        <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 text-sm font-bold text-muted-foreground">
          Select at least one driver to plot pace.
        </div>
      </div>
    );
  }

  // Performance check for M3 Pro: Disable heavy animations if many drivers are selected

  // Custom X-axis ticks:
  // - Laps 2-10: increment by 2
  // - Laps 12-30: increment by 4
  // - Laps 32-end: increment by 2
  const allLaps = data
    .map((d) => d.lap)
    .filter((lap) => typeof lap === "number");
  const maxLap = Math.max(...allLaps, 0);
  let lapTicks = [];
  for (let i = 2; i <= 10 && i <= maxLap; i += 2) lapTicks.push(i);
  for (let i = 12; i <= 30 && i <= maxLap; i += 4) lapTicks.push(i);
  for (let i = 32; i <= maxLap; i += 2) lapTicks.push(i);

  // Find min/max lap times for all visible drivers and laps
  let minLapTime = Infinity;
  let maxLapTime = -Infinity;
  data.forEach((d) => {
    lapTicks.forEach((lap) => {
      if (d.lap === lap) {
        selectedDrivers.forEach((driver) => {
          const code = typeof driver === "object" ? driver.code : driver;
          const t = d[`${code}_time`];
          if (typeof t === "number" && !isNaN(t)) {
            if (t < minLapTime) minLapTime = t;
            if (t > maxLapTime) maxLapTime = t;
          }
        });
      }
    });
  });
  if (!isFinite(minLapTime)) minLapTime = 0;
  if (!isFinite(maxLapTime)) maxLapTime = 1;
  const yDomain = [minLapTime - 1, maxLapTime + 1];

  return (
    <div className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-lg ring-1 ring-foreground/10">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Lap-by-lap pace chart
        </h3>
        {selectedDrivers.length > 5 && (
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.5rem] font-black text-muted-foreground">
            High density mode
          </span>
        )}
      </div>

      <div className="h-[600px] w-full rounded-xl bg-muted/20 p-4 shadow-inner">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 30, right: 30, left: 10, bottom: 40 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#222"
              vertical={false}
            />
            <XAxis
              dataKey="lap"
              stroke="#bbb"
              fontSize={13}
              tickLine={false}
              axisLine={false}
              interval={0}
              ticks={lapTicks}
              tick={{ angle: 0, textAnchor: "middle", dy: 10 }}
              label={{
                value: "Lap number",
                position: "insideBottom",
                offset: -10,
                fill: "#bbb",
                fontSize: 15,
              }}
            />
            <YAxis
              domain={yDomain}
              stroke="#bbb"
              fontSize={13}
              tickLine={false}
              axisLine={false}
              tickFormatter={(_val) => {
                // Use the first driver's formatted string for the tick if available
                if (!data.length || !selectedDrivers.length) return "";
                const code =
                  typeof selectedDrivers[0] === "object"
                    ? selectedDrivers[0].code
                    : selectedDrivers[0];
                // Find the closest data point for this tick value
                let closest = data.reduce((prev, curr) => {
                  const t = curr[`${code}_time`];
                  if (typeof t !== "number" || isNaN(t)) return prev;
                  if (
                    Math.abs(t - _val) <
                    Math.abs((prev[`${code}_time`] ?? 0) - _val)
                  )
                    return curr;
                  return prev;
                }, {});
                return closest[`${code}_time_str`] || "";
              }}
              label={{
                value: "Lap time",
                angle: -90,
                position: "insideLeft",
                fill: "#bbb",
                fontSize: 15,
              }}
            />
            <Tooltip
              contentStyle={styles.tooltip}
              itemStyle={styles.tooltipItem}
              cursor={{ stroke: "#333", strokeWidth: 0.7 }}
              formatter={(value, name, props) => {
                // Use the formatted string if available
                const code = name.replace("_time", "");
                const formatted = props.payload[`${code}_time_str`];
                return [formatted || value, "Lap time"];
              }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{
                fontSize: "13px",
                fontWeight: "900",
                paddingBottom: "20px",
              }}
            />
            {selectedDrivers.map((driver) => {
              const code = typeof driver === "object" ? driver.code : driver;
              // Custom dot: only show for laps in lapTicks
              const customDot = (props) => {
                const { cx, cy, payload } = props;
                if (!lapTicks.includes(payload.lap)) return null;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3}
                    stroke="#fff"
                    strokeWidth={2}
                    fill="#fff"
                  />
                );
              };
              return (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={`${code}_time`}
                  stroke={getDriverColor(code)}
                  strokeWidth={1}
                  dot={customDot}
                  connectNulls
                  animationDuration={1200}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const styles = {
  tooltip: {
    backgroundColor: "#000",
    border: "1px solid #222",
    borderRadius: "12px",
    padding: "12px",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
  },
  tooltipItem: {
    fontSize: "11px",
    fontWeight: "900",
    textTransform: "uppercase",
  },
};

export default PaceChart;
