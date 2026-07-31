import React from "react";
import { Link } from "react-router-dom";

import { SpeedTrace } from "./SpeedTrace";
import "@/styles/tokens.css";
import "./landing.css";

const CAPABILITIES = [
  {
    index: "01",
    title: "Timing tower",
    body: "Position, gap, interval, sector splits and tyre age for all twenty cars. Purple for fastest in session, green for a personal best — the same colours the FIA feed uses, so there's nothing to learn.",
  },
  {
    index: "02",
    title: "Strategy",
    body: "Stint lengths, compound choices and pit windows laid side by side. Undercut and overcut attempts are picked out automatically, with the lap they were decided.",
  },
  {
    index: "03",
    title: "Telemetry",
    body: "Speed, throttle, brake, gear and RPM for any lap, with a delta trace between two drivers so you can see exactly where the time went.",
  },
];

const PIPELINE = [
  { name: "FastF1", role: "Official timing and telemetry, parsed into lap frames." },
  { name: "Redis", role: "Computed payloads cached with a distributed lock, so concurrent cold requests never duplicate the work." },
  { name: "Kafka", role: "A finished race replayed as a live event stream, partitioned by driver to guarantee ordering." },
  { name: "WebSocket", role: "Standings pushed to the browser as each lap completes." },
];

export default function LandingPage() {
  return (
    <div className="ps-landing">
      <nav className="ps-nav">
        <div className="ps-wrap ps-nav-inner">
          <Link to="/" className="ps-logo">
            <span className="ps-logo-mark" />
            Purple Sector
          </Link>
          <Link to="/lap-times" className="ps-btn">
            Open the app
          </Link>
        </div>
      </nav>

      <header className="ps-hero">
        <div className="ps-wrap">
          <span className="ps-eyebrow">Formula 1 race analytics</span>
          <h1>
            Every tenth, <em>accounted for</em>.
          </h1>
          <p>
            Lap-by-lap analysis of every Formula 1 session since 2018 — tyre
            strategy, sector deltas, pit windows and full car telemetry. Plus a
            replay engine that streams a finished race back through a live
            timing pipeline, so you can watch it unfold on any day of the year.
          </p>
          <div className="ps-hero-actions">
            <Link to="/live" className="ps-btn" data-variant="primary">
              Start a replay
            </Link>
            <Link to="/lap-times" className="ps-btn">
              Explore a race
            </Link>
          </div>

          <div className="ps-trace-shell">
            <SpeedTrace />
          </div>
        </div>
      </header>

      <section className="ps-section">
        <div className="ps-wrap">
          <span className="ps-eyebrow">What you get</span>
          <h2>Built for people who already know the sport.</h2>
          <p className="ps-section-lede">
            No explanatory tooltips on what an undercut is. Dense tables,
            tabular figures, and the colour conventions you already read on a
            broadcast timing screen.
          </p>
          <div className="ps-grid">
            {CAPABILITIES.map((item) => (
              <article className="ps-cell" key={item.index}>
                <span className="ps-cell-index">{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ps-section">
        <div className="ps-wrap">
          <span className="ps-eyebrow">How it works</span>
          <h2>A replay engine, not a recording.</h2>
          <p className="ps-section-lede">
            Formula 1 runs on roughly twenty-four weekends a year. Rather than
            build a live feed that sits idle the rest of the time, Purple Sector
            replays completed races through the same pipeline a live feed would
            use — the same topics, the same consumers, on a clock you control.
          </p>

          <div className="ps-pipeline">
            {PIPELINE.map((stage) => (
              <div className="ps-stage" key={stage.name}>
                <div className="ps-stage-name">{stage.name}</div>
                <p className="ps-stage-role">{stage.role}</p>
              </div>
            ))}
          </div>

          <div className="ps-stat-row">
            <div className="ps-stat">
              <div className="ps-stat-value">69ms</div>
              <p className="ps-stat-label">
                Cached response for a full race analytics payload, down from
                1.3&nbsp;seconds uncached.
              </p>
            </div>
            <div className="ps-stat">
              <div className="ps-stat-value">60×</div>
              <p className="ps-stat-label">
                Maximum replay speed. A full grand prix in under two minutes, or
                real time if you prefer.
              </p>
            </div>
            <div className="ps-stat">
              <div className="ps-stat-value">2018→</div>
              <p className="ps-stat-label">
                Every session with full timing and telemetry coverage, race,
                qualifying and practice.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="ps-wrap ps-footer">
        <span>
          Purple Sector — an independent project. Not affiliated with Formula 1
          or the FIA.
        </span>
        <span>
          <a
            href="https://github.com/Kshitijmishradev/GridLogic"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
