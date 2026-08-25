import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getDriverColor } from "../../theme/f1colors";

const GapChart = ({ data, selectedDrivers }) => {
  if (!selectedDrivers?.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card/50 p-6 ring-1 ring-foreground/5">
        <h3 className="mb-6 text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Interval gaps (seconds)
        </h3>
        <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 text-sm font-bold text-muted-foreground">
          Select at least one driver to plot gaps.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-lg ring-1 ring-foreground/10">
      <h3 className="mb-6 text-[0.65rem] font-black uppercase tracking-[0.2em] text-muted-foreground">
        Interval gaps vs {selectedDrivers[0]} (seconds)
      </h3>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              {selectedDrivers.map((code) => (
                <linearGradient
                  key={`grad_${code}`}
                  id={`grad_${code}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={getDriverColor(code)}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={getDriverColor(code)}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1a1a1a"
              vertical={false}
            />
            <XAxis
              dataKey="lap"
              stroke="#444"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#444"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={styles.tooltip}
              itemStyle={styles.tooltipItem}
              cursor={{ stroke: "#333", strokeWidth: 1 }}
            />
            {selectedDrivers.map((code) => (
              <Area
                key={code}
                type="stepAfter"
                dataKey={`${code}_gap`}
                stroke={getDriverColor(code)}
                fill={`url(#grad_${code})`}
                strokeWidth={2}
                connectNulls
                animationDuration={1500}
              />
            ))}
          </AreaChart>
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
    padding: "10px",
  },
  tooltipItem: {
    fontSize: "12px",
    fontWeight: "900",
  },
};

export default GapChart;
