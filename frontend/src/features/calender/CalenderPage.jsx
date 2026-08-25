import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRaceCalendar, useRaceTrackIntel } from "../../hooks/useRaceData";
import CalendarRaceDetail from "./components/CalendarRaceDetail";
import CalendarRaceList from "./components/CalendarRaceList";
import { getRaceStatus, normalizeKey } from "./calendarUtils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const CalenderPage = ({ year, selectedGP, onRaceSelect }) => {
  const navigate = useNavigate();
  const calendar = useRaceCalendar(year);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  const events = useMemo(() => calendar.data?.events || [], [calendar.data]);

  const selectedEvent = useMemo(() => {
    if (!events.length) return null;
    if (selectedKey) {
      const selected = events.find((event) => event.circuit_key === selectedKey);
      if (selected) return selected;
    }
    const preferredName = normalizeKey(selectedGP);

    if (preferredName) {
      const matched = events.find(
        (event) => normalizeKey(event.EventName) === preferredName,
      );
      if (matched) return matched;
    }

    return events[0];
  }, [events, selectedGP, selectedKey]);

  const trackIntel = useRaceTrackIntel(
    year,
    selectedEvent?.EventName,
    selectedEvent?.mvp_supported !== false,
  );

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesSearch = !query || [event.EventName, event.Country, event.Location]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(query));
      const status = getRaceStatus(event);
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "mvp" && event.mvp_supported !== false) ||
        (activeFilter === "schedule" && event.mvp_supported === false) ||
        (activeFilter === status);
      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, events, search]);

  if (calendar.isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-[420px] w-full rounded-lg lg:h-[520px]" />
        </CardContent>
      </Card>
    );
  }

  if (calendar.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Calendar error</AlertTitle>
        <AlertDescription>{calendar.error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!events.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <CardDescription className="text-base">
            No races available for this season.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  const handleSelectRace = (event) => {
    setSelectedKey(event.circuit_key);
    if (event.mvp_supported !== false && onRaceSelect && event.EventName) {
      onRaceSelect(event.EventName);
    }
  };

  const availableCount = events.filter((event) => event.mvp_supported !== false).length;
  const filters = [
    ["all", "All races"],
    ["mvp", "MVP data"],
    ["schedule", "Schedule only"],
    ["completed", "Completed"],
    ["scheduled", "Upcoming"],
  ];

  return (
    <div className="space-y-5">
      <Card className="border-border/80 shadow-lg">
        <CardHeader className="border-b border-border/60 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="ps-label text-primary">Season command center</p>
              <CardTitle className="mt-2 font-headline text-2xl uppercase tracking-tight md:text-4xl">
                {year} race calendar
              </CardTitle>
              <CardDescription className="mt-2 max-w-2xl text-sm">
                Browse every scheduled venue, then jump into the five races with precomputed MVP data.
              </CardDescription>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-px border border-border bg-border">
              <div className="bg-card px-4 py-3">
                <span className="ps-label">Season rounds</span>
                <strong className="mt-1 block font-mono text-2xl tabular-nums text-foreground">{events.length}</strong>
              </div>
              <div className="bg-card px-4 py-3">
                <span className="ps-label">MVP coverage</span>
                <strong className="mt-1 block font-mono text-2xl tabular-nums text-primary">{availableCount}/{events.length}</strong>
              </div>
            </div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden bg-muted" aria-label={`${availableCount} of ${events.length} races have MVP data`}>
            <div className="h-full bg-primary" style={{ width: `${(availableCount / Math.max(events.length, 1)) * 100}%` }} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap gap-2" role="tablist" aria-label="Calendar filters">
              {filters.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === value}
                  onClick={() => setActiveFilter(value)}
                  className={`min-h-10 border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${activeFilter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex min-h-10 min-w-0 items-center border border-border bg-card px-3 focus-within:border-primary lg:w-72">
              <span className="sr-only">Search calendar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search venue or country"
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {filteredEvents.length} of {events.length} scheduled races
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-lg">
      <CardContent className="p-0">
        <div className="flex min-h-[720px] flex-col lg:flex-row">
          <CalendarRaceDetail
            event={selectedEvent}
            trackIntel={trackIntel.data}
            trackIntelLoading={trackIntel.isLoading}
            trackIntelError={trackIntel.error}
            onExplore={() => navigate("/lap-times")}
          />
          <CalendarRaceList
            events={filteredEvents}
            selectedRaceName={selectedEvent?.EventName}
            onSelectRace={handleSelectRace}
          />
        </div>
      </CardContent>
      </Card>
    </div>
  );
};

export default CalenderPage;
