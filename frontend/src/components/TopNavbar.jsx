import React from "react";
import { NavLink, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const navLinks = [
  { to: "/lap-times", label: "Timing" },
  { to: "/live", label: "Replay" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/strategy", label: "Drivers" },
  { to: "/technical", label: "Teams" },
  // The route existed but was never linked, so the race-control timeline --
  // flags, safety cars, stewards' investigations -- was unreachable.
  { to: "/race-control", label: "Race Control" },
  { to: "/calender", label: "Calendar" },
];

// Local dev talks to a backend that can compute any season on demand, so it
// offers the full range. The deployed build ships only a precomputed 2026
// season and sets VITE_SEASONS=2026, because offering a year it cannot serve
// is worse than not offering it. Configuration, not a code change, so the two
// environments do not drift.
const ALL_SEASONS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const years = import.meta.env.VITE_SEASONS
  ? import.meta.env.VITE_SEASONS.split(",")
      .map((y) => Number(y.trim()))
      .filter(Number.isFinite)
  : ALL_SEASONS;

/* Instrument dropdown: square, hairline border, mono value, no gradient. */
const triggerClass = cn(
  "h-9 w-full min-w-0 justify-between gap-2 rounded-none border-border bg-card px-3",
  "font-mono text-[13px] tabular-nums text-card-foreground",
  "hover:border-input focus-visible:border-primary focus-visible:ring-0",
  "data-[state=open]:border-primary",
);

const contentClass = cn(
  "z-[200] max-h-80 rounded-none border-border bg-popover p-0",
  "w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]",
);

const itemClass =
  "rounded-none font-mono text-[13px] focus:bg-accent focus:text-accent-foreground";

const labelClass =
  "px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground";

const TopNavbar = ({
  selectedYear,
  onYearChange,
  selectedGP,
  onGPChange,
  availableGPs = [],
}) => {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Wordmark — back to the landing page */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 text-foreground hover:text-foreground"
        >
          <span className="h-4 w-[3px] bg-primary shadow-[0_0_10px_var(--primary)]" />
          <span className="font-headline text-[15px] font-bold tracking-tight">
            Purple Sector
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1">
          {navLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {item.label}
                  <span
                    className={cn(
                      "absolute -bottom-[3px] left-0 h-[2px] bg-primary transition-all duration-200",
                      isActive ? "w-full opacity-100" : "w-0 opacity-0",
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Session selectors */}
        <div className="flex w-full items-end gap-px border border-border bg-border sm:w-auto">
          <div className="flex flex-col gap-1 bg-card px-3 py-2">
            <span className="ps-label">Season</span>
            <Select
              value={selectedYear != null ? String(selectedYear) : ""}
              onValueChange={(v) => onYearChange(Number(v))}
            >
              <SelectTrigger
                aria-label="Select season year"
                className={cn(triggerClass, "w-[5.5rem]")}
              >
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className={contentClass}>
                <SelectGroup>
                  <SelectLabel className={labelClass}>Season</SelectLabel>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)} className={itemClass}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1 bg-card px-3 py-2">
            <span className="ps-label">Grand Prix</span>
            <Select
              value={selectedGP ?? ""}
              onValueChange={onGPChange}
              disabled={availableGPs.length === 0}
            >
              <SelectTrigger
                aria-label="Select Grand Prix"
                className={cn(triggerClass, "sm:w-[15rem]")}
              >
                <SelectValue placeholder="Select a race" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className={contentClass}>
                <SelectGroup>
                  <SelectLabel className={labelClass}>
                    {selectedYear} calendar
                  </SelectLabel>
                  {availableGPs.map((gp) => (
                    <SelectItem key={gp} value={gp} className={itemClass}>
                      {gp}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopNavbar;
