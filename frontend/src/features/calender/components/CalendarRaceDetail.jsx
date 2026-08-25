import React, { lazy, Suspense } from "react";
import {
  formatEventDate,
  formatEventWindow,
  getCountdown,
  getRaceStatus,
} from "../calendarUtils";
import TrackIntelCard from "./TrackIntelCard";

const CircuitScene3D = lazy(() => import("./CircuitScene3D"));

const detailItems = [
  { key: "Country", accessor: (event) => event.Country || "Unknown" },
  { key: "Location", accessor: (event) => event.Location || "Unknown" },
  { key: "Format", accessor: (event) => event.EventFormat || "Race" },
  { key: "Session", accessor: (event) => formatEventDate(event) },
];

const CalendarRaceDetail = ({
  event,
  trackIntel,
  trackIntelLoading,
  trackIntelError,
  onExplore,
}) => {
  const countdown = getCountdown(event);
  const status = getRaceStatus(event);

  return (
    <section className="flex w-full flex-col gap-6 border-border/40 bg-background/40 p-6 md:p-8 lg:w-[62%] xl:w-[66%]">
      <div className="relative min-h-[420px] overflow-hidden border-l-4 border-racing bg-card">
        <Suspense
          fallback={
            <div className="flex min-h-[420px] items-center justify-center bg-[#080b10]">
              <span className="ps-label text-primary">Loading venue study…</span>
            </div>
          }
        >
          <CircuitScene3D
            eventName={event?.EventName}
            circuitKey={event?.circuit_key}
            round={event?.RoundNumber}
            supported={event?.mvp_supported !== false}
          />
        </Suspense>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background/95 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="bg-racing px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
              {status === "active"
                ? "Active Event"
                : status === "completed"
                  ? "Completed"
                  : "Upcoming"}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Round {String(event?.RoundNumber || "--").padStart(2, "0")}
            </span>
          </div>

          <h2 className="font-headline text-3xl font-black uppercase italic tracking-tight text-foreground md:text-5xl">
            {event?.EventName || "Select a race"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {event?.Location || "Unknown"}, {event?.Country || "Unknown"} •{" "}
            {formatEventWindow(event)}
          </p>

          <div className="mt-6 grid max-w-md grid-cols-3 gap-2 sm:gap-3">
            <div className="border-b-2 border-racing bg-muted/40 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Days
              </p>
              <p className="font-headline text-2xl font-black text-foreground">
                {countdown.days}
              </p>
            </div>
            <div className="border-b-2 border-racing bg-muted/40 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Hours
              </p>
              <p className="font-headline text-2xl font-black text-foreground">
                {countdown.hours}
              </p>
            </div>
            <div className="border-b-2 border-racing bg-muted/40 p-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Mins
              </p>
              <p className="font-headline text-2xl font-black text-foreground">
                {countdown.mins}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrackIntelCard
          trackIntel={trackIntel}
          isLoading={trackIntelLoading}
          error={trackIntelError}
          unavailable={event?.mvp_supported === false}
        />
        {detailItems.map((item) => (
          <div
            key={item.key}
            className="border-l-2 border-border bg-card p-5 ring-1 ring-foreground/5"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              {item.key}
            </p>
            <p className="mt-2 break-words text-lg font-black text-foreground">
              {item.accessor(event)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-l-2 border-primary bg-card p-5 ring-1 ring-foreground/5">
        <p className="ps-label text-primary">MVP access</p>
        <p className="mt-2 text-lg font-bold text-foreground">
          {event?.mvp_supported === false
            ? "Schedule metadata only"
            : "Analytics, telemetry, and replay available"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {event?.mvp_supported === false
            ? "This venue is visible in the full calendar but is not included in the five-race demo bundle."
            : "Explore the precomputed race bundle without waiting for live computation."}
        </p>
        {event?.mvp_supported !== false && onExplore ? (
          <button
            type="button"
            onClick={onExplore}
            className="mt-4 min-h-11 border border-primary/50 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Explore MVP data
          </button>
        ) : null}
      </div>
    </section>
  );
};

export default CalendarRaceDetail;
