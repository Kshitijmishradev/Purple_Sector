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

const STORY = [
  {
    index: "01",
    eyebrow: "The race is over",
    title: "Start with the trace.",
    body: "A chequered flag ends the broadcast, not the story. Purple Sector takes the finished session apart — every lap, tyre, sector and gap — and keeps the evidence intact.",
    signal: "DATA / SESSION CLOSED",
  },
  {
    index: "02",
    eyebrow: "The clock starts again",
    title: "Put the race back on the clock.",
    body: "The replay engine turns a completed grand prix into a live timing feed. Kafka carries the laps, the consumer rebuilds the standings, and the browser watches the race unfold again.",
    signal: "STREAM / REPLAY 10×",
  },
  {
    index: "03",
    eyebrow: "The race begins to separate",
    title: "See where the strategy moved.",
    body: "Stints, compounds, pit windows and gaps become visible as a sequence of decisions. The undercut is no longer a theory — it has a lap, a cost and a shape.",
    signal: "STRATEGY / STINT 03",
  },
  {
    index: "04",
    eyebrow: "The tenth is hiding",
    title: "Find it in the telemetry.",
    body: "Line up two laps on the same distance axis. Braking, throttle, RPM, gear and speed show the exact corner where time appeared — or disappeared.",
    signal: "TRACE / DELTA −0.184s",
  },
  {
    index: "05",
    eyebrow: "One sector turns purple",
    title: "Every tenth, accounted for.",
    body: "The finished race is no longer a result on a page. It is a living record you can replay, compare and understand down to the fastest sector.",
    signal: "RESULT / PURPLE SECTOR",
  },
];

function StoryCard({ chapter, index }) {
  const ref = React.useRef(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <article
      ref={ref}
      className={`ps-story-card ${visible ? "is-visible" : ""}`}
      style={{ "--story-delay": `${index * 100}ms` }}
    >
      <div className="ps-story-copy">
        <span className="ps-story-index">{chapter.index}</span>
        <span className="ps-eyebrow">{chapter.eyebrow}</span>
        <h3>{chapter.title}</h3>
        <p>{chapter.body}</p>
        <span className="ps-story-signal">{chapter.signal}</span>
      </div>
      <div className={`ps-story-art ps-story-art-${index + 1}`} aria-hidden="true">
        <span className="ps-art-orbit" />
        <span className="ps-art-track" />
        <span className="ps-art-track ps-art-track-secondary" />
        <span className="ps-art-marker" />
        <span className="ps-art-pastel" />
      </div>
    </article>
  );
}

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
          <Link to="/docs" className="ps-btn">
            Read the docs
          </Link>
        </div>
      </nav>

      <header className="ps-hero">
        <div className="ps-wrap">
          <span className="ps-eyebrow">Formula 1 race analytics</span>
          <h1>
            Chase the <em>lost tenth</em>.
          </h1>
          <p>
            A finished race is only the beginning. Rewind the session, watch it
            move through a live timing pipeline, then follow the data into the
            corner where the fastest sector was made.
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

      <section className="ps-story" aria-labelledby="story-heading">
        <div className="ps-wrap">
          <span className="ps-eyebrow">A race, reconstructed</span>
          <h2 id="story-heading">Every lap leaves a trace.</h2>
          <p className="ps-section-lede">
            Purple Sector follows the race after the flag falls — from raw
            timing data to a replay you can inspect, interrupt and understand.
          </p>
          <div className="ps-story-list">
            {STORY.map((chapter, index) => (
              <StoryCard key={chapter.index} chapter={chapter} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="ps-section">
        <div className="ps-wrap">
          <span className="ps-eyebrow">Inside the trace</span>
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
