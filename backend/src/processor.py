import fastf1
import pandas as pd
from typing import List, Dict, Tuple, Optional
from pathlib import Path
import numpy as np

class F1DataProcessor:
    def __init__(self, cache_dir: str | None = None):
        """
        Initializes the F1DataProcessor, sets up the cache directory for fastf1, and enables caching.
        
        Args:
            cache_dir (str | None): Optional path to a directory for caching F1 data.
        """
        if cache_dir is None:
            # Consistent cache pathing
            cache_path = Path(__file__).resolve().parent.parent / "data_cache"
        else:
            cache_path = Path(cache_dir)
        cache_path.mkdir(parents=True, exist_ok=True)
        fastf1.Cache.enable_cache(str(cache_path))

    def get_minimal_meta(self, year: int, gp: str) -> Dict:
        """
        Fetches basic session metadata (drivers, total laps, event name, fastest lap) without loading heavy telemetry/lap data.
        
        Args:
            year (int): Season year.
            gp (str): Grand Prix name or location.
        Returns:
            Dict: drivers list, total_laps, event_name, fastest_lap
        """
        """
        NEW: Fetches only the entry list and race basics.
        Extremely fast because it skips lap/telemetry loading.
        """
        session = fastf1.get_session(year, gp, 'R')
        # Load absolutely nothing but the headers
        session.load(laps=True, telemetry=False, weather=False)
        
        results = session.results
        drivers_list = []
        
        for _, row in results.iterrows():
            drivers_list.append({
                "code": str(row['Abbreviation']),
                "name": str(row['FullName']),
                "team": str(row['TeamName']),
                "color": f"#{str(row['TeamColor'])}",
                "number": int(row['DriverNumber'])
            })

        fastest_lap = session.laps.pick_fastest()
        fastest_lap_payload = None
        if fastest_lap is not None and not pd.isna(fastest_lap.get('LapTime')):
            fastest_lap_payload = {
                "driver": str(fastest_lap.get('Driver')),
                "time": float(fastest_lap.get('LapTime').total_seconds()),
                "lap": int(fastest_lap.get('LapNumber')) if not pd.isna(fastest_lap.get('LapNumber')) else 0
            }

        winner_payload = None
        winner_row = results[results['Position'] == 1]
        if not winner_row.empty:
            winner = winner_row.iloc[0]
            winner_payload = {
                "driver": str(winner.get('Abbreviation')),
                "name": str(winner.get('FullName')),
                "team": str(winner.get('TeamName')),
                "number": int(winner.get('DriverNumber')) if not pd.isna(winner.get('DriverNumber')) else 0,
            }

        return {
            "drivers": drivers_list,
            "total_laps": int(session.total_laps) if hasattr(session, 'total_laps') else 0,
            "event_name": str(session.event['EventName']),
            "fastest_lap": fastest_lap_payload,
            "race_winner": winner_payload
        }

    # The schedule's Location label is not stable across seasons: the same
    # circuit can be "Monaco" one year and "Monte Carlo" the next. These are
    # the pairs known to be one venue under two labels. Anything not listed
    # here and not an exact match is treated as a different circuit, because
    # the failure we are guarding against -- silently describing the wrong
    # track -- is far worse than declining to describe one at all.
    _LOCATION_ALIASES = {
        "monte carlo": "monaco",
        "yas marina": "yas island",
    }

    @classmethod
    def _canonical_place(cls, event) -> tuple:
        location = str(event.get('Location', '')).strip().lower()
        country = str(event.get('Country', '')).strip().lower()
        return cls._LOCATION_ALIASES.get(location, location), country

    def _same_circuit_last_year(self, year: int, gp: str) -> bool:
        """Does `gp` refer to the same physical circuit in year and year-1?

        Track intel is borrowed from the previous season by event name, which
        quietly assumes a name always means the same venue. It does not. In
        2026 the "Spanish Grand Prix" moved to Madrid while Barcelona kept a
        round under a new name, so a name-only lookup would report Barcelona's
        circuit length and lap count as Madrid's -- wrong, with no error to
        notice. Match on location instead, and decline when it does not agree.
        """
        try:
            current = self._canonical_place(fastf1.get_event(year, gp))
            previous = self._canonical_place(fastf1.get_event(year - 1, gp))
        except Exception:
            return False

        return current == previous and all(current)

    def get_track_intel(self, year: int, gp: str) -> Dict:
        """
        Fetch static track intel from previous season by default.
        No multi-year fallback is applied.
        """
        source_year = year - 1

        # A new or relocated venue has no comparable session last year. Say so
        # rather than silently describing a different circuit.
        if not self._same_circuit_last_year(year, gp):
            return {
                "year": year,
                "gp": gp,
                "intel_source_year": None,
                "event_name": gp,
                "total_laps": None,
                "circuit_length_km": None,
                "race_distance_km": None,
                "unavailable_reason": (
                    f"{gp} was not run at the same venue in {source_year}"
                ),
            }

        session = fastf1.get_session(source_year, gp, 'R')

        try:
            session.load(laps=True, telemetry=True, weather=False, messages=False)
        except Exception:
            try:
                session.load(laps=False, telemetry=False, weather=False, messages=False)
            except Exception:
                return {
                    "year": year,
                    "gp": gp,
                    "intel_source_year": source_year,
                    "event_name": gp,
                    "total_laps": None,
                    "circuit_length_km": None,
                    "race_distance_km": None,
                }

        circuit_info = None
        try:
            circuit_info = session.get_circuit_info()
        except Exception:
            circuit_info = None

        total_laps = None
        try:
            if hasattr(session, 'total_laps'):
                candidate = int(session.total_laps)
                total_laps = candidate if candidate > 0 else None
        except Exception:
            total_laps = None

        circuit_length_km = None
        try:
            if hasattr(session, 'laps') and session.laps is not None and not session.laps.empty:
                fastest_lap = session.laps.pick_fastest()
                if fastest_lap is not None:
                    telemetry = fastest_lap.get_telemetry()
                    if telemetry is not None and not telemetry.empty and 'Distance' in telemetry:
                        distance_m = self._safe_float(telemetry['Distance'].max())
                        if distance_m and distance_m > 0:
                            circuit_length_km = round(distance_m / 1000.0, 3)
        except Exception:
            circuit_length_km = None

        if circuit_length_km is None and circuit_info is not None:
            try:
                marker_sets = [
                    getattr(circuit_info, 'corners', None),
                    getattr(circuit_info, 'marshal_lights', None),
                    getattr(circuit_info, 'marshal_sectors', None),
                ]
                max_distance = None
                for marker_df in marker_sets:
                    if marker_df is None or marker_df.empty or 'Distance' not in marker_df:
                        continue
                    candidate = self._safe_float(marker_df['Distance'].max())
                    if candidate is None:
                        continue
                    if max_distance is None or candidate > max_distance:
                        max_distance = candidate
                if max_distance and max_distance > 0:
                    circuit_length_km = round(max_distance / 1000.0, 3)
            except Exception:
                circuit_length_km = None

        race_distance_km = None
        if circuit_length_km is not None and total_laps is not None:
            race_distance_km = round(circuit_length_km * total_laps, 3)

        event_name = gp
        try:
            if hasattr(session, 'event') and session.event is not None:
                event_name = str(session.event.get('EventName', gp))
        except Exception:
            event_name = gp

        return {
            "year": year,
            "gp": gp,
            "intel_source_year": source_year,
            "event_name": event_name,
            "total_laps": total_laps,
            "circuit_length_km": circuit_length_km,
            "race_distance_km": race_distance_km,
        }

    def get_selective_telemetry(self, year: int, gp: str, driver_codes: List[str]) -> Dict:
        """
        Fetches lap times for specific drivers, skipping full telemetry for performance.
        
        Args:
            year (int): Season year.
            gp (str): Grand Prix name.
            driver_codes (List[str]): List of driver abbreviations.
        Returns:
            Dict: Mapping driver codes to their lap numbers and lap times.
        """
        """
        NEW: Fetches lap times only for specific drivers.
        Used to power the Pace Evolution chart dynamically.
        """
        session = fastf1.get_session(year, gp, 'R')
        # Only load laps. Skipping telemetry saves ~80% processing time.
        session.load(laps=True, telemetry=False, weather=False)
        
        pace_evolution = {}
        for code in driver_codes:
            driver_laps = session.laps.pick_driver(code)
            pace_evolution[code] = [
                {"l": int(row['LapNumber']), "t": float(row['LapTime'].total_seconds())}
                for _, row in driver_laps.iterrows()
                if not pd.isna(row['LapTime'])
            ]
            
        return pace_evolution

    def get_lap_tire_matrix(self, year: int, gp: str, driver_codes: List[str]) -> Dict:
        """
        Per-lap tire compound (and lap time) for each driver — for telemetry lap picker grid.
        """
        session = fastf1.get_session(year, gp, "R")
        session.load(laps=True, telemetry=False, weather=False)

        total_laps = 0
        try:
            if hasattr(session, "total_laps") and session.total_laps:
                total_laps = int(session.total_laps)
        except Exception:
            total_laps = 0

        drivers_out: Dict[str, List[Dict]] = {}
        for code in driver_codes:
            rows: List[Dict] = []
            try:
                dl = session.laps.pick_driver(code)
                for _, row in dl.iterrows():
                    if pd.isna(row.get("LapTime")):
                        continue
                    lt = row.get("LapTime")
                    lap_time_s = None
                    if lt is not None and hasattr(lt, "total_seconds"):
                        lap_time_s = round(float(lt.total_seconds()), 3)
                    rows.append(
                        {
                            "lap": int(row["LapNumber"]),
                            "compound": str(row.get("Compound", "UNKNOWN")),
                            "lap_time_s": lap_time_s,
                        }
                    )
                rows.sort(key=lambda x: x["lap"])
            except Exception:
                rows = []
            drivers_out[str(code)] = rows

        if total_laps <= 0:
            max_lap = 0
            for rows in drivers_out.values():
                for r in rows:
                    max_lap = max(max_lap, r["lap"])
            total_laps = max_lap

        return {
            "year": year,
            "gp": gp,
            "total_laps": total_laps,
            "drivers": drivers_out,
        }

    def _get_session(self, year: int, gp: str, session_type: str = 'R'):
        """
        Helper to retrieve and load a fastf1 session.
        
        Args:
            year (int): Season year.
            gp (str): Grand Prix name.
            session_type (str): Session type (default 'R' for Race).
        Returns:
            fastf1 session object.
        """
        """Helper to load and load telemetry."""
        session = fastf1.get_session(year, gp, session_type)
        session.load()
        return session

    @staticmethod
    def _td_to_seconds(value):
        """
        Converts a timedelta or numeric value to float seconds.
        
        Args:
            value (timedelta or numeric): The time value to convert.
        Returns:
            float or None
        """
        if value is None or pd.isna(value):
            return None
        if hasattr(value, "total_seconds"):
            return float(value.total_seconds())
        return float(value)

    @staticmethod
    def _format_time_min_sec(seconds):
        """
        Formats a float (seconds) as 'M:SS.sss' string.
        
        Args:
            seconds (float): The time in seconds.
        Returns:
            str or None
        """
        """
        Converts a float (seconds) to 'M:SS.sss' string (e.g., 1:23.456).
        Returns None if input is None or not a number.
        """
        if seconds is None or pd.isna(seconds):
            return None
        try:
            minutes = int(seconds // 60)
            secs = seconds % 60
            return f"{minutes}:{secs:06.3f}"
        except Exception:
            return None

    @staticmethod
    def _safe_float(value, default=None):
        """
        Safely casts a value to float, returns default if fails.
        
        Args:
            value: Value to cast.
            default (float | None): Value to return on failure.
        Returns:
            float or default
        """
        if value is None or pd.isna(value):
            return default
        try:
            return float(value)
        except Exception:
            return default

    @staticmethod
    def _safe_int(value, default=None):
        """
        Safely casts a value to int, returns default if fails.
        
        Args:
            value: Value to cast.
            default (int | None): Value to return on failure.
        Returns:
            int or default
        """
        if value is None or pd.isna(value):
            return default
        try:
            return int(value)
        except Exception:
            return default

    def _build_driver_reference(self, session) -> Dict[str, Dict]:
        """
        Builds a reference dict of driver details from session results.
        
        Args:
            session: fastf1 session object.
        Returns:
            Dict mapping driver codes to driver info.
        """
        drivers = {}
        for _, row in session.results.iterrows():
            code = str(row.get('Abbreviation', ''))
            if not code:
                continue
            drivers[code] = {
                "code": code,
                "name": str(row.get('FullName', code)),
                "team": str(row.get('TeamName', 'Unknown')),
                "number": self._safe_int(row.get('DriverNumber'), 0),
                "color": f"#{str(row.get('TeamColor', '777777'))}",
            }
        return drivers

    def _prepare_lap_frame(self, laps: pd.DataFrame) -> pd.DataFrame:
        """
        Cleans and processes laps DataFrame, adds columns for analysis.
        
        Args:
            laps (pd.DataFrame): Raw laps data from fastf1.
        Returns:
            Processed pd.DataFrame
        """
        frame = laps.copy()
        frame = frame[~frame['LapTime'].isna()].copy()
        frame['LapTimeSeconds'] = frame['LapTime'].dt.total_seconds()
        frame['S1'] = frame['Sector1Time'].dt.total_seconds()
        frame['S2'] = frame['Sector2Time'].dt.total_seconds()
        frame['S3'] = frame['Sector3Time'].dt.total_seconds()
        frame['RaceTimeSeconds'] = frame['Time'].dt.total_seconds()
        frame['PitInFlag'] = ~frame['PitInTime'].isna()
        frame['PitOutFlag'] = ~frame['PitOutTime'].isna()
        return frame

    def _build_lap_times_payload(self, laps_df: pd.DataFrame) -> Dict:
        """
        Aggregates lap time, sector, tire, and status data for all drivers.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
        Returns:
            Dict with lap history and fastest lap info.
        """
        lap_records = []
        for lap_no, group in laps_df.groupby('LapNumber'):
            idx = group['LapTimeSeconds'].idxmin()
            fastest = group.loc[idx]
            lap_records.append({
                "lap": int(lap_no),
                "driver": str(fastest['Driver']),
                "lap_time_s": round(float(fastest['LapTimeSeconds']), 3)
            })

        global_idx = laps_df['LapTimeSeconds'].idxmin()
        global_fastest = laps_df.loc[global_idx]

        drivers_payload = {}
        for code, group in laps_df.groupby('Driver'):
            rows = []
            for _, row in group.iterrows():
                rows.append({
                    "lap": int(row['LapNumber']),
                    "lap_time_s": round(float(row['LapTimeSeconds']), 3),
                    # Absolute session clock. The replay stream needs to know
                    # *when* a lap was completed, not just how long it took --
                    # accumulating lap_time_s drifts for any driver whose laps
                    # were dropped above for a missing LapTime.
                    "race_time_s": self._safe_float(row.get('RaceTimeSeconds')),
                    "s1_s": round(float(row['S1']), 3) if not pd.isna(row['S1']) else None,
                    "s2_s": round(float(row['S2']), 3) if not pd.isna(row['S2']) else None,
                    "s3_s": round(float(row['S3']), 3) if not pd.isna(row['S3']) else None,
                    "compound": str(row.get('Compound', 'UNKNOWN')),
                    "stint": self._safe_int(row.get('Stint'), 0),
                    "position": self._safe_int(row.get('Position'), None),
                    "pit_in": bool(row['PitInFlag']),
                    "pit_out": bool(row['PitOutFlag']),
                    "track_status": str(row.get('TrackStatus', '')),
                })
            drivers_payload[str(code)] = rows

        return {
            "drivers": drivers_payload,
            "global_fastest": {
                "driver": str(global_fastest['Driver']),
                "lap": int(global_fastest['LapNumber']),
                "lap_time_s": round(float(global_fastest['LapTimeSeconds']), 3)
            },
            "lap_records": lap_records,
        }

    def _build_gap_payload(self, laps_df: pd.DataFrame) -> Dict:
        """
        Calculates gap to leader and interval to car ahead for each driver/lap.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
        Returns:
            Dict by lap with leader and car gaps.
        """
        gaps = {}
        for lap_no, group in laps_df.groupby('LapNumber'):
            leader_row = group[group['Position'] == 1]
            if leader_row.empty:
                continue
            leader_time = float(leader_row.iloc[0]['RaceTimeSeconds'])
            leader_driver = str(leader_row.iloc[0]['Driver'])

            entries = []
            for _, row in group.iterrows():
                race_t = self._safe_float(row['RaceTimeSeconds'])
                if race_t is None:
                    continue
                entries.append({
                    "driver": str(row['Driver']),
                    "position": self._safe_int(row.get('Position'), None),
                    "gap_to_leader_s": round(race_t - leader_time, 3),
                    "interval_ahead_s": self._safe_float(row.get('IntervalToPositionAhead')),
                })

            gaps[int(lap_no)] = {
                "leader": leader_driver,
                "cars": entries,
            }
        return {"by_lap": gaps}

    def _build_tire_payload(self, laps_df: pd.DataFrame) -> Dict:
        """
        Analyzes tire stints, average pace, and wear for each compound.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
        Returns:
            Dict with stint and compound summaries.
        """
        stints = []
        for (driver, stint, compound), group in laps_df.groupby(['Driver', 'Stint', 'Compound']):
            ordered = group.sort_values('LapNumber')
            lap_numbers = ordered['LapNumber'].astype(int)
            lap_times = ordered['LapTimeSeconds']

            wear_slope = None
            if len(ordered) >= 3 and lap_times.notna().sum() >= 3:
                x = lap_numbers.values.astype(float)
                y = lap_times.values.astype(float)
                wear_slope = float(np.polyfit(x, y, 1)[0])

            stints.append({
                "driver": str(driver),
                "stint": self._safe_int(stint, 0),
                "compound": str(compound),
                "start_lap": int(lap_numbers.min()),
                "end_lap": int(lap_numbers.max()),
                "stint_length": int(len(ordered)),
                "avg_lap_s": round(float(lap_times.mean()), 3),
                "wear_s_per_lap": round(wear_slope, 4) if wear_slope is not None else None,
            })

        compound_summary = []
        for compound, group in laps_df.groupby('Compound'):
            compound_summary.append({
                "compound": str(compound),
                "avg_lap_s": round(float(group['LapTimeSeconds'].mean()), 3),
                "median_lap_s": round(float(group['LapTimeSeconds'].median()), 3),
                "sample_size": int(len(group)),
            })

        return {
            "stints": stints,
            "compound_pace": sorted(compound_summary, key=lambda x: x['avg_lap_s'])
        }

    def _build_pit_payload(self, laps_df: pd.DataFrame, drivers_ref: Dict[str, Dict]) -> Dict:
        """
        Identifies pit events, estimates pit loss, summarizes team pit performance.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
            drivers_ref (Dict): Driver reference info.
        Returns:
            Dict with pit events, strategies, team performance.
        """
        pit_events = []
        stop_counts = {}

        for driver, group in laps_df.groupby('Driver'):
            group = group.sort_values('LapNumber')
            stop_counts[str(driver)] = int(group['PitInFlag'].sum())
            median_clean = group[(~group['PitInFlag']) & (~group['PitOutFlag'])]['LapTimeSeconds'].median()

            for _, row in group[group['PitInFlag'] | group['PitOutFlag']].iterrows():
                lap_no = int(row['LapNumber'])
                lap_time = self._safe_float(row['LapTimeSeconds'])
                pit_loss = None
                if median_clean and lap_time:
                    pit_loss = lap_time - float(median_clean)

                pit_events.append({
                    "driver": str(driver),
                    "team": drivers_ref.get(str(driver), {}).get("team", "Unknown"),
                    "lap": lap_no,
                    "event": "pit_in" if bool(row['PitInFlag']) else "pit_out",
                    "lap_time_s": round(lap_time, 3) if lap_time is not None else None,
                    "estimated_pit_lane_loss_s": round(pit_loss, 3) if pit_loss is not None else None,
                })

        strategies = []
        for driver, count in stop_counts.items():
            label = "NO-STOP" if count == 0 else ("1-STOP" if count == 1 else f"{count}-STOP")
            strategies.append({"driver": driver, "stops": count, "strategy": label})

        team_perf = []
        pit_df = pd.DataFrame(pit_events)
        if not pit_df.empty and 'estimated_pit_lane_loss_s' in pit_df.columns:
            valid = pit_df.dropna(subset=['estimated_pit_lane_loss_s'])
            if not valid.empty:
                for team, group in valid.groupby('team'):
                    team_perf.append({
                        "team": str(team),
                        "avg_estimated_pit_lane_loss_s": round(float(group['estimated_pit_lane_loss_s'].mean()), 3),
                        "samples": int(len(group)),
                    })

        return {
            "events": pit_events,
            "strategies": strategies,
            "team_crew_performance": sorted(team_perf, key=lambda x: x['avg_estimated_pit_lane_loss_s'])
        }

    def _build_undercut_overcut_payload(self, laps_df: pd.DataFrame) -> List[Dict]:
        """
        Detects undercut/overcut battles by comparing pit windows and position changes.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
        Returns:
            List of undercut/overcut events.
        """
        driver_pit_laps = {}
        for driver, group in laps_df.groupby('Driver'):
            laps = group[group['PitOutFlag']]['LapNumber'].dropna().astype(int).tolist()
            driver_pit_laps[str(driver)] = laps

        positions = {}
        for _, row in laps_df.iterrows():
            positions[(str(row['Driver']), int(row['LapNumber']))] = self._safe_int(row.get('Position'), None)

        events = []
        seen = set()
        drivers = list(driver_pit_laps.keys())
        for i, d1 in enumerate(drivers):
            for d2 in drivers[i + 1:]:
                for p1 in driver_pit_laps[d1]:
                    for p2 in driver_pit_laps[d2]:
                        if abs(p1 - p2) > 3:
                            continue

                        first = d1 if p1 < p2 else d2
                        second = d2 if p1 < p2 else d1
                        first_pit = min(p1, p2)
                        second_pit = max(p1, p2)
                        pre_lap = max(1, first_pit - 1)
                        post_lap = second_pit + 3

                        pre_first = positions.get((first, pre_lap))
                        pre_second = positions.get((second, pre_lap))
                        post_first = positions.get((first, post_lap))
                        post_second = positions.get((second, post_lap))
                        if None in (pre_first, pre_second, post_first, post_second):
                            continue

                        key = tuple(sorted([d1, d2]) + [first_pit, second_pit])
                        if key in seen:
                            continue
                        seen.add(key)

                        if pre_first > pre_second and post_first < post_second:
                            events.append({
                                "type": "undercut",
                                "attacker": first,
                                "target": second,
                                "attacker_pit_lap": first_pit,
                                "target_pit_lap": second_pit,
                            })
                        elif pre_second > pre_first and post_second < post_first:
                            events.append({
                                "type": "overcut",
                                "attacker": second,
                                "target": first,
                                "attacker_pit_lap": second_pit,
                                "target_pit_lap": first_pit,
                            })

        return events

    def _build_driver_comparison_payload(self, laps_df: pd.DataFrame, drivers_ref: Dict[str, Dict], session, year: int, gp: str) -> Dict:
        """
        Generates driver comparison metrics, consistency, overtakes, teammate head-to-head.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
            drivers_ref (Dict): Driver reference info.
            session: fastf1 session object.
            year (int): Season year.
            gp (str): Grand Prix name.
        Returns:
            Dict with driver metrics and session breakdown.
        """
        comparison = []
        for driver, group in laps_df.groupby('Driver'):
            group = group.sort_values('LapNumber')
            pos_diff = group['Position'].diff()
            overtakes = int((pos_diff < 0).sum())

            comparison.append({
                "driver": str(driver),
                "team": drivers_ref.get(str(driver), {}).get("team", "Unknown"),
                "avg_lap_s": round(float(group['LapTimeSeconds'].mean()), 3),
                "best_lap_s": round(float(group['LapTimeSeconds'].min()), 3),
                "consistency_std_s": round(float(group['LapTimeSeconds'].std(ddof=0)), 3),
                "laps_completed": int(len(group)),
                "overtakes_estimate": overtakes,
            })

        teammate_head_to_head = []
        by_team = {}
        for d, data in drivers_ref.items():
            team = data["team"]
            by_team.setdefault(team, []).append(d)

        comp_df = pd.DataFrame(comparison)
        for team, drivers in by_team.items():
            if len(drivers) < 2:
                continue
            rows = comp_df[comp_df['driver'].isin(drivers)]
            if len(rows) < 2:
                continue
            rows = rows.sort_values('avg_lap_s')
            leader = rows.iloc[0]
            teammate = rows.iloc[1]
            teammate_head_to_head.append({
                "team": team,
                "faster_driver": str(leader['driver']),
                "slower_driver": str(teammate['driver']),
                "avg_gap_s": round(float(teammate['avg_lap_s'] - leader['avg_lap_s']), 3),
            })

        session_breakdown = {"race": comparison}
        try:
            q_session = fastf1.get_session(year, gp, 'Q')
            q_session.load(laps=True, telemetry=False, weather=False)
            q_laps = q_session.laps
            q_rows = []
            for driver, group in q_laps.groupby('Driver'):
                best = group['LapTime'].dropna()
                if best.empty:
                    continue
                q_rows.append({
                    "driver": str(driver),
                    "best_lap_s": round(float(best.min().total_seconds()), 3)
                })
            session_breakdown["qualifying"] = q_rows
        except Exception:
            session_breakdown["qualifying"] = []

        return {
            "driver_metrics": sorted(comparison, key=lambda x: x['avg_lap_s']),
            "teammate_head_to_head": teammate_head_to_head,
            "session_breakdown": session_breakdown,
        }

    def _build_weather_payload(self, session, laps_df: pd.DataFrame) -> Dict:
        """
        Extracts weather data and correlates it to laps for impact analysis.
        
        Args:
            session: fastf1 session object.
            laps_df (pd.DataFrame): Processed laps DataFrame.
        Returns:
            Dict with weather samples and lap impacts.
        """
        weather_rows = []
        weather = session.weather_data if hasattr(session, 'weather_data') else pd.DataFrame()
        if weather is not None and not weather.empty:
            for _, row in weather.iterrows():
                weather_rows.append({
                    "time_s": self._safe_float(row['Time'].total_seconds()) if not pd.isna(row.get('Time')) else None,
                    "air_temp_c": self._safe_float(row.get('AirTemp')),
                    "track_temp_c": self._safe_float(row.get('TrackTemp')),
                    "humidity": self._safe_float(row.get('Humidity')),
                    "pressure": self._safe_float(row.get('Pressure')),
                    "wind_speed": self._safe_float(row.get('WindSpeed')),
                    "wind_direction": self._safe_float(row.get('WindDirection')),
                    "rainfall": bool(row.get('Rainfall')) if row.get('Rainfall') is not None else False,
                })

        lap_weather_impact = []
        if weather_rows:
            weather_df = pd.DataFrame(weather_rows).dropna(subset=['time_s'])
            if not weather_df.empty:
                for lap_no, group in laps_df.groupby('LapNumber'):
                    leader = group[group['Position'] == 1]
                    if leader.empty:
                        continue
                    race_t = self._safe_float(leader.iloc[0]['RaceTimeSeconds'])
                    if race_t is None:
                        continue
                    nearest = weather_df.iloc[(weather_df['time_s'] - race_t).abs().argsort()[:1]]
                    if nearest.empty:
                        continue
                    nearest_row = nearest.iloc[0]
                    lap_weather_impact.append({
                        "lap": int(lap_no),
                        "leader_lap_s": round(float(leader.iloc[0]['LapTimeSeconds']), 3),
                        "track_temp_c": self._safe_float(nearest_row.get('track_temp_c')),
                        "air_temp_c": self._safe_float(nearest_row.get('air_temp_c')),
                        "wind_speed": self._safe_float(nearest_row.get('wind_speed')),
                    })

        return {
            "samples": weather_rows,
            "lap_impact": lap_weather_impact,
        }

    def _build_fuel_payload(self, laps_df: pd.DataFrame, total_laps: int) -> Dict:
        """
        Models fuel burn, remaining fuel, and detects lift-and-coast behavior.
        
        Args:
            laps_df (pd.DataFrame): Processed laps DataFrame.
            total_laps (int): Total race laps.
        Returns:
            Dict with fuel traces and strategy hints.
        """
        estimated_burn_kg_per_lap = 1.8
        starting_fuel_kg = round(total_laps * estimated_burn_kg_per_lap * 1.05, 2)
        by_driver = {}

        for driver, group in laps_df.groupby('Driver'):
            group = group.sort_values('LapNumber')
            rows = []
            for _, row in group.iterrows():
                lap_no = int(row['LapNumber'])
                remaining = max(0.0, starting_fuel_kg - (lap_no * estimated_burn_kg_per_lap))
                laps_possible = remaining / estimated_burn_kg_per_lap if estimated_burn_kg_per_lap > 0 else 0
                rows.append({
                    "lap": lap_no,
                    "est_fuel_remaining_kg": round(remaining, 2),
                    "est_laps_possible": round(laps_possible, 1),
                })

            rolling = group['LapTimeSeconds'].rolling(5, min_periods=3).median()
            lift_coast_laps = []
            for idx, lap_t in enumerate(group['LapTimeSeconds']):
                baseline = rolling.iloc[idx]
                if pd.isna(baseline):
                    continue
                if lap_t - baseline > 1.2:
                    lap_no = int(group.iloc[idx]['LapNumber'])
                    lift_coast_laps.append(lap_no)

            recommendation = "HOLD PACE"
            if len(lift_coast_laps) < max(1, total_laps // 20):
                recommendation = "CONSIDER EARLIER LIFT-AND-COAST INTO HEAVY BRAKING ZONES"
            elif len(lift_coast_laps) > max(3, total_laps // 8):
                recommendation = "FUEL SAVING ALREADY HIGH; PROTECT TIRE TEMPS"

            by_driver[str(driver)] = {
                "fuel_trace": rows,
                "lift_coast_proxy_laps": lift_coast_laps,
                "strategy_hint": recommendation,
            }

        return {
            "model": {
                "type": "proxy",
                "assumption": "constant burn model from race distance",
                "estimated_burn_kg_per_lap": estimated_burn_kg_per_lap,
                "estimated_starting_fuel_kg": starting_fuel_kg,
            },
            "drivers": by_driver,
        }

    def _build_replay_setup_payload(self, session) -> Dict:
        """
        Collects race control messages and provides replay/setup metadata.
        
        Args:
            session: fastf1 session object.
        Returns:
            Dict with timeline and setup info.
        """
        timeline = []
        try:
            messages = session.race_control_messages
            if messages is not None and not messages.empty:
                for _, row in messages.iterrows():
                    timeline.append({
                        "category": str(row.get('Category', 'RC')),
                        "message": str(row.get('Message', '')),
                        "flag": str(row.get('Flag', '')),
                        "lap": self._safe_int(row.get('Lap'), None),
                    })
        except Exception:
            timeline = []

        return {
            "replay": {
                "interactive_track_map": False,
                "video_sync": False,
                "notes": "Raw public timing feed does not expose synchronized broadcast video or complete XY traces in this endpoint.",
                "timeline": timeline,
            },
            "setup": {
                "available": False,
                "notes": "Wing/suspension/brake duct setup channels are not published in the race timing feed.",
            }
        }

    def get_race_analytics(self, year: int, gp: str) -> Dict:
        """
        Main orchestrator: aggregates all analytics (lap times, gaps, tires, pits, etc.) into a master dict.
        
        Args:
            year (int): Season year.
            gp (str): Grand Prix name.
        Returns:
            Dict with full race analytics.
        """
        session = fastf1.get_session(year, gp, 'R')
        session.load(laps=True, telemetry=False, weather=True, messages=True)

        drivers_ref = self._build_driver_reference(session)
        laps_df = self._prepare_lap_frame(session.laps)

        if laps_df.empty:
            return {
                "year": year,
                "gp": gp,
                "drivers": list(drivers_ref.values()),
                "error": "No lap timing data available for this session."
            }

        total_laps = int(laps_df['LapNumber'].max())

        lap_times = self._build_lap_times_payload(laps_df)
        gaps = self._build_gap_payload(laps_df)
        tire = self._build_tire_payload(laps_df)
        pit = self._build_pit_payload(laps_df, drivers_ref)
        undercut_overcut = self._build_undercut_overcut_payload(laps_df)
        comparisons = self._build_driver_comparison_payload(laps_df, drivers_ref, session, year, gp)
        weather = self._build_weather_payload(session, laps_df)
        fuel = self._build_fuel_payload(laps_df, total_laps)
        replay_setup = self._build_replay_setup_payload(session)

        return {
            "year": year,
            "gp": gp,
            "event_name": str(session.event['EventName']) if hasattr(session, 'event') else gp,
            "total_laps": total_laps,
            "drivers": list(drivers_ref.values()),
            "lap_times_and_splits": lap_times,
            "gaps_and_intervals": gaps,
            "tire_usage_and_strategy": {
                **tire,
                "pit_window_battles": undercut_overcut,
            },
            "fuel_consumption": fuel,
            "pit_stop_analysis": pit,
            "driver_comparisons": comparisons,
            "weather_and_track": weather,
            "session_breakdowns": comparisons.get('session_breakdown', {}),
            **replay_setup,
        }

    def get_race_insights(self, year: int, gp: str) -> Dict:
        """Processes Insight A (Stints) and Insight B (Pace)."""
        session = self._get_session(year, gp)
        laps = session.laps

        # --- Insight A: Stints (Strategy) ---
        # Grouping by driver and stint to find start/end laps and compound
        stints_df = laps.groupby(['Driver', 'Stint', 'Compound']).agg({
            'LapNumber': ['min', 'max']
        }).reset_index()

        stints_df.columns = ['Driver', 'Stint', 'Compound', 'StartLap', 'EndLap']
        stints_df = stints_df[['Driver', 'Compound', 'StartLap', 'EndLap']]
        stints_json = stints_df.to_dict(orient='records')

        # --- Insight B: Pace Evolution ---
        # Filter for 'QuickLaps' to remove SC and In/Out laps for cleaner charts
        quick_laps = laps.pick_quicklaps()
        
        # Convert LapTime (timedelta) to total seconds for charting
        pace_df = quick_laps[['LapNumber', 'Driver', 'LapTime']].copy()
        pace_df['LapTime'] = pace_df['LapTime'].dt.total_seconds()
        pace_df.columns = ['Lap', 'Driver', 'LapTime']
        pace_json = pace_df.to_dict(orient='records')

        return {
            "year": year,
            "gp": gp,
            "stints": stints_json,
            "pace_evolution": pace_json
        }

    def get_fastest_telemetry(self, year: int, gp: str, driver: str) -> List[Dict]:
        """Processes Insight C (Telemetry for the fastest lap)."""
        session = self._get_session(year, gp)
        
        # Get the fastest lap for the specific driver
        fastest_lap = session.laps.pick_driver(driver).pick_fastest()
        telemetry = fastest_lap.get_telemetry()

        # Select core channels and convert to dict
        # We use 'Distance' as the X-axis for charts
        tel_df = telemetry[['Distance', 'Speed', 'Throttle', 'Brake']].copy()
        
        return tel_df.to_dict(orient='records')

    @staticmethod
    def _downsample_indices(length: int, max_points: int = 2000) -> np.ndarray:
        if length <= max_points:
            return np.arange(length, dtype=int)
        step = int(np.ceil(length / max_points))
        return np.arange(0, length, step, dtype=int)

    @staticmethod
    def _series_to_json_list(arr) -> List:
        out = []
        for x in np.asarray(arr).flatten():
            if pd.isna(x):
                out.append(None)
            elif isinstance(x, (np.bool_, bool)):
                out.append(float(bool(x)))
            else:
                out.append(float(x))
        return out

    @staticmethod
    def _pick_lap(laps_driver, lap_number: int):
        """Return a Lap object for driver + lap number."""
        ln = int(lap_number)
        if hasattr(laps_driver, "pick_lap"):
            try:
                return laps_driver.pick_lap(ln)
            except Exception:
                pass
        try:
            filtered = laps_driver[laps_driver["LapNumber"] == ln]
        except Exception:
            filtered = laps_driver[laps_driver.LapNumber == ln]  # type: ignore[index]
        if filtered.shape[0] == 0:
            raise ValueError(f"No lap {ln} for this driver")
        return filtered.iloc[0]

    def _extract_single_lap_series(self, session, driver: str, lap_number: int) -> Dict:
        laps_driver = session.laps.pick_driver(driver)
        lap = self._pick_lap(laps_driver, lap_number)
        telemetry = lap.get_telemetry()
        if telemetry is None or telemetry.empty:
            raise ValueError(f"No telemetry samples for {driver} lap {lap_number}")

        df = telemetry.copy()

        if "Time" in df.columns:
            t0 = df["Time"].iloc[0]
            time_rel = (df["Time"] - t0).dt.total_seconds().values.astype(float)
        elif "SessionTime" in df.columns:
            t0 = df["SessionTime"].iloc[0]
            time_rel = (df["SessionTime"] - t0).dt.total_seconds().values.astype(float)
        else:
            time_rel = np.linspace(0.0, 1.0, len(df))

        dist = df["Distance"].astype(float).values

        speed = df["Speed"].astype(float).values if "Speed" in df else np.zeros(len(df))
        throttle = df["Throttle"].astype(float).values if "Throttle" in df else np.zeros(len(df))

        if "Brake" in df.columns:
            br = df["Brake"].values
            brake = np.asarray(br, dtype=float)
        else:
            brake = np.zeros(len(df))

        if "RPM" in df.columns:
            rpm = df["RPM"].astype(float).values
        elif "rpm" in df.columns:
            rpm = df["rpm"].astype(float).values
        else:
            rpm = np.zeros(len(df))

        if "nGear" in df.columns:
            gear = df["nGear"].astype(float).values
        elif "Gear" in df.columns:
            gear = df["Gear"].astype(float).values
        else:
            gear = np.zeros(len(df))

        x = df["X"].astype(float).values if "X" in df.columns else np.zeros(len(df))
        y = df["Y"].astype(float).values if "Y" in df.columns else np.zeros(len(df))

        lap_time_s = None
        try:
            lt = lap["LapTime"] if hasattr(lap, "__getitem__") else getattr(lap, "LapTime", None)
            if lt is not None and not pd.isna(lt):
                lap_time_s = float(lt.total_seconds()) if hasattr(lt, "total_seconds") else float(lt)
        except Exception:
            lap_time_s = None

        idx = self._downsample_indices(len(dist), max_points=2200)
        series = {
            "distance": self._series_to_json_list(dist[idx]),
            "time_rel_s": self._series_to_json_list(time_rel[idx]),
            "speed": self._series_to_json_list(speed[idx]),
            "throttle": self._series_to_json_list(throttle[idx]),
            "brake": self._series_to_json_list(brake[idx]),
            "rpm": self._series_to_json_list(rpm[idx]),
            "gear": self._series_to_json_list(gear[idx]),
            "x": self._series_to_json_list(x[idx]),
            "y": self._series_to_json_list(y[idx]),
        }

        return {
            "driver": str(driver),
            "lap": int(lap_number),
            "lap_time_s": lap_time_s,
            "series": series,
        }

    @staticmethod
    def _compute_delta_series(series_a: Dict, series_b: Dict) -> Dict:
        d1 = np.array(series_a["distance"], dtype=float)
        t1 = np.array(series_a["time_rel_s"], dtype=float)
        d2 = np.array(series_b["distance"], dtype=float)
        t2 = np.array(series_b["time_rel_s"], dtype=float)
        if len(d1) < 2 or len(d2) < 2:
            return {"distance": [], "delta_s": []}
        d_min = max(float(d1[0]), float(d2[0]))
        d_max = min(float(d1[-1]), float(d2[-1]))
        if d_max <= d_min:
            return {"distance": [], "delta_s": []}
        n = min(1600, len(d1) + len(d2))
        grid = np.linspace(d_min, d_max, n)
        t1_i = np.interp(grid, d1, t1)
        t2_i = np.interp(grid, d2, t2)
        return {
            "distance": grid.tolist(),
            "delta_s": (t2_i - t1_i).tolist(),
        }

    def compare_lap_telemetry(
        self,
        year: int,
        gp: str,
        lap_specs: List[Tuple[str, int]],
        colors: Optional[List[str]] = None,
    ) -> Dict:
        """
        Full per-lap telemetry for 1–2 laps (distance-aligned), plus delta when two laps are provided.
        lap_specs: list of (driver_code, lap_number)
        """
        session = self._get_session(year, gp)

        default_colors = ["#00D7B6", "#F47600"]
        palette = (colors or default_colors) + default_colors

        laps_out = []
        for i, (driver, lap_no) in enumerate(lap_specs):
            one = self._extract_single_lap_series(session, driver, lap_no)
            one["color"] = palette[i]
            laps_out.append(one)

        circuit_length_m = None
        if laps_out:
            circuit_length_m = max(max(l["series"]["distance"]) for l in laps_out)

        delta_payload = None
        if len(laps_out) == 2:
            delta_payload = self._compute_delta_series(laps_out[0]["series"], laps_out[1]["series"])

        corners_payload: List[Dict] = []
        try:
            cinfo = session.get_circuit_info()
            if cinfo is not None and hasattr(cinfo, "corners") and cinfo.corners is not None:
                cdf = cinfo.corners
                for _, row in cdf.iterrows():
                    num = row.get("Number", row.get("number", None))
                    dist_m = row.get("Distance", None)
                    corners_payload.append(
                        {
                            "number": int(num) if num is not None and not pd.isna(num) else None,
                            "distance_m": float(dist_m) if dist_m is not None and not pd.isna(dist_m) else None,
                        }
                    )
        except Exception:
            corners_payload = []

        event_name = gp
        try:
            if hasattr(session, "event") and session.event is not None:
                event_name = str(session.event.get("EventName", gp))
        except Exception:
            event_name = gp

        return {
            "year": year,
            "gp": gp,
            "event_name": event_name,
            "circuit_length_m": circuit_length_m,
            "corners": corners_payload,
            "laps": laps_out,
            "delta": delta_payload,
        }

# --- Local Testing Block ---
if __name__ == "__main__":
    processor = F1DataProcessor()
    # Testing with 2024 Bahrain GP (first race of the season)
    print("Testing Insight A & B extraction...")
    insights = processor.get_race_insights(2024, 'Bahrain')
    print(f"Extracted {len(insights['stints'])} stints.")
    
    print("Testing Telemetry extraction for VER...")
    tel = processor.get_fastest_telemetry(2024, 'Bahrain', 'VER')
    print(f"Extracted {len(tel)} telemetry data points.")