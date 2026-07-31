import React, { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import TopNavbar from "./components/TopNavbar";
import LapTimesPage from "./features/lap-times/LapTimesPage";
import RaceControlPage from "./features/race-control/RaceControlPage";
import StrategyPage from "./features/strategy/StrategyPage";
import TechnicalPage from "./features/technical/TechnicalPage";
import CalenderPage from "./features/calender/CalenderPage";
import TelemetryPage from "./features/telemetry/TelemetryPage";
import LivePage from "./features/live/LivePage";

import { useEffect } from "react";
import axios from "axios";
import { RACES_URL } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FlagIcon } from "lucide-react";

function App() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [gp, setGp] = useState(null);
  const [availableGPs, setAvailableGPs] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);

  useEffect(() => {
    const fetchRaces = async () => {
      try {
        const { data } = await axios.get(`${RACES_URL}/${year}`);
        setAvailableGPs(data.events);
        if (!data.events.includes(gp)) {
          setGp(data.events[0]);
        }
      } catch (err) {
        setAvailableGPs([]);
        setGp(null);
        console.error("Failed to fetch schedule", err);
      }
    };
    fetchRaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const handleDriverToggle = (driverCode) => {
    if (Array.isArray(driverCode) && driverCode.length === 0) {
      setSelectedDrivers([]);
      return;
    }
    const code = typeof driverCode === "object" ? driverCode.code : driverCode;
    setSelectedDrivers((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const renderPage = (page) => {
    if (!gp) {
      return (
        <Card className="mx-auto max-w-lg border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
              <FlagIcon className="size-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-headline text-lg tracking-wide">
              Select a session
            </CardTitle>
            <CardDescription>
              Choose a season and Grand Prix in the header to load telemetry and
              analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTitle>No race selected</AlertTitle>
              <AlertDescription>
                Waiting for schedule data from the API. If this persists,
                confirm the backend is running at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000"}
                </code>
                .
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }
    return page;
  };

  return (
    <div className="min-h-screen bg-background font-body text-foreground antialiased">
      <TopNavbar
        selectedYear={year}
        onYearChange={(newYear) => {
          setYear(newYear);
          setSelectedDrivers([]);
        }}
        selectedGP={gp}
        onGPChange={(newGp) => {
          setGp(newGp);
          setSelectedDrivers([]);
        }}
        availableGPs={availableGPs}
      />
      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-28 sm:px-6 sm:pt-32">
        <Routes>
          <Route path="/" element={<Navigate to="/lap-times" replace />} />
          <Route
            path="/lap-times"
            element={renderPage(
              <LapTimesPage
                year={year}
                gp={gp}
                selectedDrivers={selectedDrivers}
                onSelectionChange={handleDriverToggle}
              />,
            )}
          />
          <Route
            path="/telemetry"
            element={renderPage(
              <TelemetryPage key={`${year}-${gp}`} year={year} gp={gp} />,
            )}
          />
          <Route
            path="/live"
            element={renderPage(<LivePage year={year} gp={gp} />)}
          />
          <Route
            path="/race-control"
            element={renderPage(<RaceControlPage year={year} gp={gp} />)}
          />
          <Route
            path="/calender"
            element={
              <CalenderPage
                year={year}
                selectedGP={gp}
                onRaceSelect={(raceName) => {
                  setGp(raceName);
                  setSelectedDrivers([]);
                }}
              />
            }
          />
          <Route
            path="/calendar"
            element={<Navigate to="/calender" replace />}
          />
          <Route
            path="/strategy"
            element={renderPage(
              <StrategyPage
                year={year}
                gp={gp}
                selectedDrivers={selectedDrivers}
                onSelectionChange={handleDriverToggle}
              />,
            )}
          />
          <Route
            path="/technical"
            element={renderPage(
              <TechnicalPage
                year={year}
                gp={gp}
                selectedDrivers={selectedDrivers}
                onSelectionChange={handleDriverToggle}
              />,
            )}
          />
          <Route path="*" element={<Navigate to="/lap-times" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
