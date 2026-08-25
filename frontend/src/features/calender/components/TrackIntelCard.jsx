import React from "react";

const formatMetric = (value, unit) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value} ${unit}`;
};

const TrackIntelCard = ({ trackIntel, isLoading, error, unavailable }) => {
  return (
    <div className="bg-[#1b1b24] border-l-2 border-white/10 p-5">
      <p className="text-[10px] uppercase tracking-[0.22em] text-[#ffb4a7] font-bold">
        Circuit Intel
      </p>

      {unavailable ? (
        <p className="mt-3 text-sm text-white/60">
          Circuit intelligence is not included in the MVP bundle for this race.
        </p>
      ) : isLoading ? (
        <p className="mt-3 text-sm text-white/60">Loading track intel...</p>
      ) : error ? (
        <p className="mt-3 text-sm text-red-300">Track intel unavailable</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex items-end justify-between">
            <span className="text-xs text-white/40 uppercase font-bold">
              Laps
            </span>
            <span className="text-2xl font-black font-headline text-white">
              {trackIntel?.total_laps ?? "—"}
            </span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-xs text-white/40 uppercase font-bold">
              Circuit Length
            </span>
            <span className="text-2xl font-black font-headline text-white text-right">
              {formatMetric(trackIntel?.circuit_length_km, "KM")}
            </span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-xs text-white/40 uppercase font-bold">
              Race Distance
            </span>
            <span className="text-2xl font-black font-headline text-white text-right">
              {formatMetric(trackIntel?.race_distance_km, "KM")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackIntelCard;
