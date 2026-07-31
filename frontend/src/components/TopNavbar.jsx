import React from "react";
import { NavLink } from "react-router-dom";
import { CalendarDays, Flag } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

const navLinks = [
  { to: "/lap-times", label: "Live Timing" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/live", label: "Race Replay" },
  { to: "/calender", label: "Calendar" },
  { to: "/strategy", label: "Drivers" },
  { to: "/technical", label: "Teams" },
];

const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const TopNavbar = ({
  selectedYear,
  onYearChange,
  selectedGP,
  onGPChange,
  availableGPs = [],
}) => {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/80 bg-background/75 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-10 lg:gap-14">
          <span className="shrink-0 cursor-default select-none font-headline text-2xl font-black italic tracking-tight text-foreground sm:text-[1.65rem]">
            KIDŌ<span className="text-racing">.</span>
          </span>
          <nav className="flex flex-wrap items-center gap-1 sm:gap-6 lg:gap-8">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.18em] transition-colors sm:text-xs",
                    isActive
                      ? "text-racing"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={cn(
                        "absolute bottom-0 left-0 h-0.5 rounded-full bg-racing shadow-[0_0_12px_rgba(225,6,0,0.6)] transition-all duration-300",
                        isActive ? "w-full opacity-100" : "w-0 opacity-0",
                      )}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-b from-muted/40 to-muted/20 p-3 shadow-sm ring-1 ring-foreground/[0.06] sm:w-auto sm:min-w-[320px] sm:flex-row sm:items-stretch sm:gap-0 sm:p-2 lg:min-w-[400px]">
          {/* Season */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:px-3 sm:py-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              <CalendarDays className="size-3 text-racing/90" aria-hidden />
              Season
            </span>
            <Select
              value={selectedYear != null ? String(selectedYear) : ""}
              onValueChange={(v) => onYearChange(Number(v))}
            >
              <SelectTrigger
                size="default"
                aria-label="Select season year"
                className={cn(
                  "h-10 w-full min-w-[6.5rem] justify-between gap-2 rounded-xl border-border/70 bg-background/95 px-3 shadow-inner",
                  "font-semibold tabular-nums tracking-tight",
                  "hover:border-racing/35 hover:bg-accent/30",
                  "focus-visible:border-racing/50 focus-visible:ring-racing/20",
                  "data-[state=open]:border-racing/40 data-[state=open]:shadow-md",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <CalendarDays
                    className="size-3.5 shrink-0 text-racing opacity-90"
                    aria-hidden
                  />
                  <SelectValue placeholder="Year" />
                </span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={8}
                align="start"
                className="z-[200] max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] rounded-xl border-border/80 p-1 shadow-xl ring-1 ring-foreground/10"
              >
                <SelectGroup>
                  <SelectLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Championship years
                  </SelectLabel>
                  <div className="max-h-60 overflow-y-auto py-0.5">
                    {years.map((y) => (
                      <SelectItem
                        key={y}
                        value={String(y)}
                        className="cursor-pointer rounded-lg py-2.5 pl-3 pr-8 text-[15px] font-semibold tabular-nums focus:bg-racing/15 focus:text-foreground"
                      >
                        {y}
                      </SelectItem>
                    ))}
                  </div>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <Separator
            orientation="vertical"
            className="hidden bg-border/60 sm:my-2 sm:block sm:h-auto sm:w-px sm:self-stretch"
          />

          {/* Grand Prix */}
          <div className="flex min-w-0 flex-[1.4] flex-col gap-1.5 sm:px-3 sm:py-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Flag className="size-3 text-racing/90" aria-hidden />
              Grand Prix
            </span>
            <Select
              value={selectedGP ?? ""}
              onValueChange={(v) => onGPChange(v)}
              disabled={!availableGPs.length}
            >
              <SelectTrigger
                size="default"
                aria-label="Select Grand Prix"
                className={cn(
                  "h-auto min-h-10 w-full min-w-0 justify-between gap-2 rounded-xl border-border/70 bg-background/95 py-2 pl-3 pr-2 text-left shadow-inner",
                  "font-medium leading-snug",
                  "hover:border-racing/35 hover:bg-accent/30",
                  "focus-visible:border-racing/50 focus-visible:ring-racing/20",
                  "data-[state=open]:border-racing/40 data-[state=open]:shadow-md",
                  "disabled:opacity-60",
                )}
              >
                <span className="flex min-w-0 flex-1 items-start gap-2 text-left">
                  <Flag
                    className="mt-0.5 size-3.5 shrink-0 text-racing opacity-90"
                    aria-hidden
                  />
                  <SelectValue
                    placeholder={
                      availableGPs.length ? "Choose a race…" : "No races"
                    }
                    className="line-clamp-2 text-left"
                  />
                </span>
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={8}
                align="end"
                className={cn(
                  "z-[200] max-h-[min(24rem,calc(100vh-8rem))] rounded-xl border-border/80 p-1 shadow-xl ring-1 ring-foreground/10",
                  "min-w-[var(--radix-select-trigger-width)] max-w-[min(92vw,26rem)]",
                  "data-[side=bottom]:slide-in-from-top-1",
                )}
              >
                <SelectGroup>
                  <SelectLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    {selectedYear != null
                      ? `${selectedYear} calendar`
                      : "Races"}
                  </SelectLabel>
                  <div className="max-h-[min(20rem,calc(100vh-10rem))] overflow-y-auto overscroll-contain py-0.5">
                    {availableGPs.map((gp) => (
                      <SelectItem
                        key={gp}
                        value={gp}
                        className="cursor-pointer rounded-lg py-2.5 pl-3 pr-10 text-left text-sm leading-snug break-words whitespace-normal focus:bg-racing/15 focus:text-foreground"
                      >
                        {gp}
                      </SelectItem>
                    ))}
                  </div>
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
