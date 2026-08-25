import React from "react";
import { ArrowUpRight, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import "./docs.css";
import pipelineStudy from "@/assets/docs-pipeline-study.png";
import telemetryStudy from "@/assets/docs-telemetry-study.png";

const CHAPTERS = [
  { id: "story", number: "01", label: "The story" },
  { id: "architecture", number: "02", label: "The architecture" },
  { id: "cache", number: "03", label: "The cache" },
  { id: "replay", number: "04", label: "The replay" },
  { id: "telemetry", number: "05", label: "The telemetry" },
  { id: "deploy", number: "06", label: "The deployment" },
  { id: "limits", number: "07", label: "The edges" },
];

const PIPELINE = [
  ["FastF1", "source", "timing + telemetry"],
  ["FastAPI", "shape", "payloads + sockets"],
  ["Redis", "hold", "cache + pub/sub"],
  ["Redpanda", "move", "durable stream"],
  ["Browser", "see", "timing screen"],
];

function ChapterLink({ chapter, active }) {
  return (
    <a className={active ? "is-active" : ""} href={"#" + chapter.id}>
      <span>{chapter.number}</span>
      {chapter.label}
    </a>
  );
}

export default function DocsPage() {
  const [active, setActive] = React.useState("story");

  React.useEffect(() => {
    const nodes = CHAPTERS.map(({ id }) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-18% 0px -62%", threshold: [0.1, 0.5] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ps-docs">
      <header className="ps-docs-topbar">
        <Link to="/" className="ps-docs-brand">
          <span className="ps-docs-mark" />
          Purple Sector <span>/ docs</span>
        </Link>
        <div className="ps-docs-top-actions">
          <Link to="/lap-times">Open the app <ArrowUpRight size={14} /></Link>
          <a href="https://github.com/Kshitijmishradev/GridLogic" target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={13} />
          </a>
        </div>
      </header>

      <div className="ps-docs-layout">
        <aside className="ps-docs-sidebar" aria-label="Documentation chapters">
          <span className="ps-eyebrow">A race, reconstructed</span>
          <p>Read the project from the chequered flag back to the lost tenth.</p>
          <nav>
            {CHAPTERS.map((chapter) => (
              <ChapterLink key={chapter.id} chapter={chapter} active={active === chapter.id} />
            ))}
          </nav>
          <div className="ps-docs-sidebar-note">
            <span className="ps-docs-live-dot" />
            <span>2026 season bundle<br /><b>prewarmed / weekly</b></span>
          </div>
        </aside>

        <main className="ps-docs-main">
          <section className="ps-docs-hero" id="story">
            <div className="ps-docs-hero-copy">
              <span className="ps-eyebrow">Project notebook · v2</span>
              <h1>Every lap leaves a <em>trace.</em></h1>
              <p className="ps-docs-hero-lede">
                Purple Sector is a Formula 1 race analytics system that takes a
                finished session apart, puts it back on a clock, and lets you
                find where the race was won.
              </p>
              <div className="ps-docs-hero-actions">
                <a className="ps-docs-button ps-docs-button-primary" href="#architecture">Follow the trace <ChevronRight size={15} /></a>
                <Link className="ps-docs-button" to="/">Back to the canvas</Link>
              </div>
            </div>
            <div className="ps-docs-hero-art" aria-hidden="true">
              <div className="ps-docs-art-caption">SESSION / 2026 · BRITISH GP</div>
              <span className="ps-docs-hero-stroke ps-stroke-a" />
              <span className="ps-docs-hero-stroke ps-stroke-b" />
              <span className="ps-docs-hero-stroke ps-stroke-c" />
              <span className="ps-docs-hero-marker" />
            </div>
          </section>

          <section className="ps-docs-chapter" id="architecture">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">02</span>
              <div><span className="ps-eyebrow">The architecture</span><h2>A replay engine, not a recording.</h2></div>
            </div>
            <p className="ps-docs-intro">
              Formula 1 runs roughly twenty-four race weekends a year. A genuinely
              live pipeline would sit idle for most of the calendar, so Purple
              Sector replays completed races through the same infrastructure a
              live feed would use.
            </p>
            <div className="ps-docs-image-panel ps-docs-pipeline-art">
              <img src={pipelineStudy} alt="Oil pastel study of a left-to-right race data pipeline" />
              <span className="ps-docs-image-label">THE FEED / FROM SOURCE TO SCREEN</span>
            </div>
            <div className="ps-docs-pipeline-grid">
              {PIPELINE.map(([name, verb, role], index) => (
                <div className="ps-docs-pipeline-node" key={name} style={{ "--node-delay": index * 90 + "ms" }}>
                  <span className="ps-docs-node-index">0{index + 1}</span>
                  <b>{name}</b>
                  <span className="ps-docs-node-verb">{verb}</span>
                  <small>{role}</small>
                </div>
              ))}
            </div>
            <p className="ps-docs-caption">The same topics, the same consumer, the same stateful timing screen — only the clock is controlled.</p>
          </section>

          <section className="ps-docs-chapter" id="cache">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">03</span>
              <div><span className="ps-eyebrow">The cache</span><h2>Compute once. Read like timing.</h2></div>
            </div>
            <div className="ps-docs-two-col">
              <div>
                <p>
                  The expensive part is not downloading the session. It is pandas
                  turning a session into analytics payloads. Redis caches the
                  computed result, not the raw FastF1 session.
                </p>
                <p>
                  On a concurrent miss, a tokenized lock elects one worker. Every
                  other request waits for the result. A Lua release checks the
                  token before deleting the lock, so an overlong computation cannot
                  release somebody else’s lock.
                </p>
              </div>
              <div className="ps-docs-metric-card">
                <span className="ps-eyebrow">Measured / warm cache</span>
                <div className="ps-docs-big-metric">40<span>ms</span></div>
                <div className="ps-docs-meter"><i /></div>
                <div className="ps-docs-metric-foot"><span>cached</span><span>~1.0s uncached</span></div>
              </div>
            </div>
            <pre className="ps-docs-code"><code>{"browser → FastAPI → Redis\n                       ├─ hit  → response (~5ms)\n                       └─ miss → SET NX lock → pandas → cache → response"}</code></pre>
          </section>

          <section className="ps-docs-chapter" id="replay">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">04</span>
              <div><span className="ps-eyebrow">The replay</span><h2>Put the finished race back on the clock.</h2></div>
            </div>
            <p className="ps-docs-intro">
              A replay starts with an HTTP request and ends as a live browser
              stream. The producer keys events by driver, Kafka preserves order
              within partitions, and the consumer derives standings, gaps and
              tyre age before Redis pub/sub fans the frame out to connected sockets.
            </p>
            <div className="ps-docs-replay-line" aria-label="Replay flow">
              {[
                ["POST", "start replay"], ["producer", "schedule laps"], ["f1.timing", "ordered events"], ["consumer", "derive state"], ["WebSocket", "paint frame"],
              ].map(([name, detail], index) => (
                <React.Fragment key={name}>
                  <div className="ps-docs-replay-step"><b>{name}</b><span>{detail}</span></div>
                  {index < 4 && <span className="ps-docs-replay-arrow">→</span>}
                </React.Fragment>
              ))}
            </div>
            <div className="ps-docs-note ps-docs-note-purple"><b>The subtle bug:</b> the clock uses the absolute <code>race_time_s</code> in the source data. Accumulating lap durations puts drivers with missing lap times in the wrong place on the tower.</div>
          </section>

          <section className="ps-docs-chapter" id="telemetry">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">05</span>
              <div><span className="ps-eyebrow">The telemetry</span><h2>Find the tenth where the lines diverge.</h2></div>
            </div>
            <div className="ps-docs-telemetry-grid">
              <div className="ps-docs-image-panel ps-docs-telemetry-art">
                <img src={telemetryStudy} alt="Oil pastel study of a circuit and layered telemetry traces" />
                <span className="ps-docs-image-label">DISTANCE AXIS / TWO LAPS / ONE ANSWER</span>
              </div>
              <div className="ps-docs-telemetry-copy">
                <p>Telemetry is the investigative layer: pick two drivers and two laps, then line speed, throttle, brake, RPM and gear up on a shared distance axis.</p>
                <ul>
                  <li><b>Speed</b><span>where the car carries momentum</span></li>
                  <li><b>Throttle + brake</b><span>where commitment changes</span></li>
                  <li><b>Delta</b><span>where the tenth appears</span></li>
                </ul>
                <div className="ps-docs-cost"><span>lap-compare</span><b>621 MB peak RSS</b><small>the reason this path stays on demand</small></div>
              </div>
            </div>
          </section>

          <section className="ps-docs-chapter" id="deploy">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">06</span>
              <div><span className="ps-eyebrow">The deployment</span><h2>Ship the evidence, not the compute.</h2></div>
            </div>
            <p className="ps-docs-intro">The free MVP precomputes five completed races on GitHub Actions, commits the validated bundle, and serves it through a small static-data API. The frontend stays static; replay runs locally in the browser.</p>
            <div className="ps-docs-deploy-grid">
              <div className="ps-docs-deploy-card"><span>01</span><b>Prewarm</b><p>FastF1 + pandas run in CI and write validated compressed payloads.</p></div>
              <div className="ps-docs-deploy-card"><span>02</span><b>Serve</b><p>Cloudflare Pages serves the interface; Render reads the compressed files without live computation.</p></div>
              <div className="ps-docs-deploy-card"><span>03</span><b>Refresh</b><p>A weekly workflow rebuilds the latest five races and republishes the bundle.</p></div>
            </div>
            <pre className="ps-docs-code"><code>{"python scripts/build_demo_bundle.py\nnpm run build\n# frontend → Cloudflare Pages\n# API      → Render Free"}</code></pre>
            <div className="ps-docs-deploy-note">
              <b>Two URLs, one trust boundary</b>
              <p>Set <code>VITE_API_URL</code> in Cloudflare Pages to the Render API URL. Set <code>ALLOWED_ORIGINS</code> in Render to the stable Cloudflare Pages origin, such as <code>https://purple-sector.pages.dev</code>.</p>
              <p>Cloudflare preview deployments use generated origins. If you test one, add that exact preview origin temporarily or test the production URL. The Render free instance may sleep between visits, so its first request can be slower.</p>
            </div>
          </section>

          <section className="ps-docs-chapter" id="limits">
            <div className="ps-docs-chapter-heading">
              <span className="ps-docs-number">07</span>
              <div><span className="ps-eyebrow">The edges</span><h2>Know what this system is — and is not.</h2></div>
            </div>
            <div className="ps-docs-limits">
              <div><b>Five races</b><p>The MVP exposes the latest five completed races in its committed bundle.</p></div>
              <div><b>Client replay</b><p>Playback is browser-controlled and uses precomputed frames instead of a live socket.</p></div>
              <div><b>Free-tier wake-up</b><p>The Render API can sleep between visits, so the first request may be slower.</p></div>
              <div><b>Telemetry is the heavy path</b><p>It remains on demand because combinations grow faster than the season bundle.</p></div>
            </div>
            <div className="ps-docs-endnote"><span className="ps-docs-endline" />The flag falls. The trace remains.<span className="ps-docs-endline" /></div>
          </section>
        </main>
      </div>
    </div>
  );
}
