import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import CalendarRaceCard from "./CalendarRaceCard";

const CalendarRaceList = ({ events, selectedRaceName, onSelectRace }) => {
  return (
    <section className="flex w-full flex-col border-t border-border/60 bg-muted/20 lg:w-[38%] lg:border-t-0 lg:border-l xl:w-[34%]">
      <div className="flex items-end justify-between px-6 pb-4 pt-6">
        <h3 className="font-headline text-xl font-black italic uppercase tracking-tight text-foreground">
          Season calendar
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Select race
        </span>
      </div>

      <ScrollArea className="h-[min(70vh,720px)] px-6 pb-6">
        <div className="space-y-3 pr-3">
          {events.length ? events.map((event) => (
            <CalendarRaceCard
              key={`${event.RoundNumber}-${event.EventName}`}
              event={event}
              isActive={selectedRaceName === event.EventName}
              onClick={() => onSelectRace(event)}
            />
          )) : (
            <div className="border border-dashed border-border p-6 text-center">
              <p className="ps-label text-primary">No matching rounds</p>
              <p className="mt-2 text-sm text-muted-foreground">Try another filter or search term.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  );
};

export default CalendarRaceList;
