import React from "react";
import { formatEventWindow, getRaceStatus } from "../calendarUtils";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusClass = {
  completed: "border-transparent bg-muted text-muted-foreground",
  active: "border-racing/40 bg-racing/20 text-racing",
  scheduled: "border-border bg-muted/50 text-muted-foreground",
};

const statusLabels = {
  completed: "Completed",
  active: "Active",
  scheduled: "Scheduled",
};

const CalendarRaceCard = ({ event, isActive, onClick }) => {
  const status = getRaceStatus(event);
  const supported = event.mvp_supported !== false;

  return (
    <button
      type="button"
        onClick={onClick}
        aria-label={`${event.EventName || "Race"}${supported ? " MVP data available" : " schedule only"}`}
        className={cn(
        "w-full rounded-lg border-l-4 p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        isActive
          ? "border-racing bg-card ring-1 ring-racing/30"
          : supported
            ? "border-border/80 bg-card/60 hover:border-racing/70 hover:bg-card"
            : "border-border/50 bg-card/30 opacity-75 hover:border-primary/50 hover:bg-card/60",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
          Round {String(event.RoundNumber || "--").padStart(2, "0")}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
            statusClass[status],
          )}
        >
          {supported ? statusLabels[status] : "Schedule only"}
        </Badge>
      </div>

      <h4 className="text-sm font-black uppercase leading-tight text-foreground md:text-base">
        {event.EventName || "Unnamed Grand Prix"}
      </h4>

      <p className="mt-1 text-xs text-muted-foreground">
        {event.Location || "Unknown"}, {event.Country || "Unknown"}
      </p>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatEventWindow(event)}</span>
        <span className="font-bold uppercase">
        {supported ? event.EventFormat || "Race" : "MVP data unavailable"}
        </span>
      </div>
    </button>
  );
};

export default CalendarRaceCard;
