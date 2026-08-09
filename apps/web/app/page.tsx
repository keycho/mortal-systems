import "./wall.css";
import { Gate as WallGate } from "../components/wall/Gate";
import { EnforcementChip, Tag } from "../components/Badge";
import { BlueprintCard } from "../components/site/BlueprintCard";
import { ContourMark } from "../components/site/ContourMark";
import { DownloadSection } from "../components/site/DownloadSection";
import { Grain } from "../components/site/Grain";
import { LifecycleTicker } from "../components/site/LifecycleTicker";
import { Nav } from "../components/site/Nav";
import { SectionHead } from "../components/site/SectionHead";
import { Simulator } from "../components/simulator/Simulator";
import { WalkthroughVideo } from "../components/site/WalkthroughVideo";
import {
  ALPHA_INSTALL_NOTE,
  BLUEPRINT_CARDS,
  BLUEPRINT_DISPLAY,
  GUARANTEE_CELLS,
  MACOS_ALPHA_DMG_URL,
  PROOF_BAND,
  USE_CASES,
} from "../lib/site-data";

/**
 * the landing page, recreated from the design handoff. copy is the
 * handoff's, verbatim; the three data corrections against the schema are
 * documented in lib/site-data.ts. every product frame is a real capture of
 * the alpha (nothing is redrawn); the lifecycle is an explicitly abstract
 * diagram; agent surfaces carry COMING until they ship.
 */

const em = (s: string) => <em style={{ fontStyle: "italic" }}>{s}</em>;

const captionChip = { display: "inline-flex", verticalAlign: "middle", marginRight: 10 } as const;

function Hero() {
  return (
    <div data-screen-label="hero" id="top" style={{ position: "relative" }}>
      <Grain />
      <div style={{ position: "relative", maxWidth: 1296, margin: "0 auto", padding: "36px 40px 0" }}>
        <Nav home />
        <div
          className="m-hero-grid"
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "46fr 54fr",
            gap: 44,
            marginTop: 64,
            alignItems: "center",
          }}
        >
          <span
            className="m-rule"
            style={{
              position: "absolute",
              left: 0,
              right: -40,
              bottom: 46,
              height: 1,
              background: "rgba(25,23,19,.16)",
            }}
          />
          <div>
            <div
              style={{
                font: "400 11px var(--font-mono)",
                letterSpacing: "0.2em",
                color: "rgba(25,23,19,.52)",
              }}
            >
              PROGRAMMABLE IDENTITY INFRASTRUCTURE
            </div>
            <h1
              className="m-h1"
              style={{
                font: "400 66px/1.07 var(--font-display)",
                margin: "22px 0 0",
                letterSpacing: "-0.012em",
                color: "var(--ink-display)",
                fontWeight: 400,
              }}
            >
              Your agents are already operating the internet.
              <br />
              Never as you.
            </h1>
            <p
              style={{
                font: "400 15.5px/1.7 var(--font-body)",
                color: "rgba(25,23,19,.7)",
                margin: "26px 0 0",
                maxWidth: "46ch",
              }}
            >
              AI agents are browsing websites, opening accounts, conducting research, moving
              assets and completing work through browsers built for humans. Most inherit the
              operator&apos;s sessions, logins, files and digital reach. Mortal gives every agent
              an identity of its own: a real isolated browser, private memory and files, scoped
              permissions, a network route you attach and a lifetime you define. Disposable for
              one task. Persistent for ongoing work. Destroyed when its purpose ends.
            </p>
            <div className="m-cta" style={{ display: "flex", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
              <a
                href={MACOS_ALPHA_DMG_URL}
                style={{
                  font: "500 14px var(--font-body)",
                  background: "var(--ink)",
                  color: "var(--ground)",
                  padding: "15px 26px",
                  borderRadius: "var(--r-btn)",
                  boxShadow: "var(--shadow-cta)",
                }}
              >
                download the alpha
              </a>
              <a
                href="/gate"
                style={{
                  font: "500 14px var(--font-body)",
                  border: "1px solid rgba(25,23,19,.28)",
                  background: "rgba(255,255,255,.6)",
                  padding: "15px 26px",
                  borderRadius: "var(--r-btn)",
                  color: "var(--ink)",
                }}
              >
                watch the live agents
              </a>
              <a
                href="#try"
                style={{
                  font: "500 14px var(--font-body)",
                  border: "1px solid rgba(25,23,19,.28)",
                  background: "rgba(255,255,255,.6)",
                  padding: "15px 26px",
                  borderRadius: "var(--r-btn)",
                  color: "var(--ink)",
                }}
              >
                launch an identity
              </a>
            </div>
            <p
              style={{
                font: "400 12.5px/1.65 var(--font-mono)",
                color: "rgba(25,23,19,.55)",
                margin: "14px 0 0",
                maxWidth: "56ch",
              }}
            >
              {ALPHA_INSTALL_NOTE}
            </p>
            <p
              style={{
                font: "400 16.5px/1.5 var(--font-display)",
                fontStyle: "italic",
                color: "rgba(25,23,19,.64)",
                margin: "28px 0 0",
              }}
            >
              a task should never inherit more of you than it needs.
            </p>
            <div
              style={{
                font: "400 11.5px var(--font-mono)",
                color: "rgba(25,23,19,.5)",
                marginTop: 14,
                letterSpacing: "0.05em",
              }}
            >
              local-first&nbsp;&nbsp;/&nbsp;&nbsp;isolated&nbsp;chromium&nbsp;&nbsp;/&nbsp;&nbsp;scoped&nbsp;context&nbsp;&nbsp;/&nbsp;&nbsp;enforced&nbsp;lifecycle
            </div>
          </div>
          <div className="m-mark" style={{ display: "flex", justifyContent: "flex-end", marginRight: -40 }}>
            <ContourMark />
          </div>
        </div>
        <div
          style={{
            textAlign: "center",
            font: "400 11px var(--font-mono)",
            color: "rgba(25,23,19,.4)",
            marginTop: 44,
            paddingBottom: 56,
            letterSpacing: "0.06em",
          }}
        >
          ↓&nbsp;&nbsp;one agent → one identity → one controlled surface on the internet
        </div>
      </div>
    </div>
  );
}

function AgentsNeedIdentities() {
  const receives = [
    "its own browser",
    "its own memory",
    "its own files",
    "its own permissions",
    "its own network route",
    "its own lifetime",
  ];
  return (
    <div
      data-screen-label="agents need identities"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="AGENTS NEED IDENTITIES"
          title="An agent without its own identity operates as whoever launched it."
          intro="It inherits their browser state, authenticated sessions, accounts, history and access. That works for demos. It does not work for autonomous systems operating continuously across clients, markets, accounts and workflows."
        />
        <div
          className="m-life-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,640px) minmax(280px,1fr)",
            gap: 48,
            marginTop: 44,
            alignItems: "start",
          }}
        >
          <div>
            <p
              style={{
                font: "400 15.5px/1.7 var(--font-body)",
                color: "rgba(25,23,19,.7)",
                margin: 0,
                maxWidth: "52ch",
              }}
            >
              Mortal places a programmable identity between the agent and the internet. The agent
              receives exactly what it needs:
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: "12px 24px",
                marginTop: 24,
                maxWidth: 520,
              }}
            >
              {receives.map((line) => (
                <span
                  key={line}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    font: "400 13.5px var(--font-mono)",
                    color: "rgba(25,23,19,.75)",
                  }}
                >
                  <span
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }}
                  />
                  {line}
                </span>
              ))}
            </div>
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(25,23,19,.12)",
              borderRadius: "var(--r-card)",
              padding: "22px 24px",
              alignSelf: "center",
            }}
          >
            <p style={{ font: "500 15px/1.6 var(--font-body)", margin: 0 }}>
              Your identity remains outside the environment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperateAcrossRegions() {
  const bullets = [
    "research the local web from another region",
    "test how a product behaves in another country",
    "operate separate international campaigns",
    "give agents environments specific to their market",
    "keep regional activity isolated from your personal browser",
  ];
  return (
    <div
      data-screen-label="operate across regions"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="OPERATE ACROSS REGIONS"
          title="Launch identities configured for different markets, languages, timezones and network routes."
          intro="Mortal does not sell documents, accounts, credentials or fabricated people. It provisions controlled environments. You provide any credentials and network routes required by the workflow."
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            marginTop: 40,
            font: "400 13px/1.7 var(--font-mono)",
            color: "rgba(25,23,19,.7)",
          }}
        >
          {bullets.map((line) => (
            <span key={line} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ color: "rgba(25,23,19,.35)" }}>·</span>
              {line}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UseCasesBand() {
  return (
    <div data-screen-label="use cases" style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "60px 40px 68px" }}>
        <div
          style={{ font: "400 12px var(--font-mono)", letterSpacing: "0.18em", color: "rgba(25,23,19,.5)" }}
        >
          WHAT YOU WOULD USE IT FOR
        </div>
        <div
          className="m-jobs"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3,minmax(0,1fr))",
            gap: 14,
            marginTop: 24,
          }}
        >
          {USE_CASES.map((job) => (
            <div
              key={job.label}
              style={{
                background: "var(--surface)",
                border: "1px solid rgba(25,23,19,.12)",
                borderRadius: "var(--r-card)",
                padding: 20,
              }}
            >
              <div
                style={{
                  font: "500 10.5px var(--font-mono)",
                  letterSpacing: "0.14em",
                  color: "rgba(25,23,19,.5)",
                }}
              >
                {job.label}
              </div>
              <p
                style={{
                  font: "400 13.5px/1.7 var(--font-body)",
                  color: "rgba(25,23,19,.75)",
                  margin: "10px 0 0",
                  textWrap: "pretty",
                }}
              >
                {job.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrySection() {
  return (
    <div
      data-screen-label="try it"
      id="try"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="TRY IT IN YOUR BROWSER"
          title={<>create an identity. watch it {em("end")}.</>}
          intro="this simulator runs in the page with real logic: configure, provision, operate, destroy, receipt. it is a preview, not the product. real isolation requires the desktop manager."
        />
        <Simulator />
      </div>
    </div>
  );
}

function ManagerSection() {
  return (
    <div data-screen-label="the manager" id="manager" style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "72px 40px 84px" }}>
        <SectionHead
          eyebrow="THE MANAGER"
          title={<>one place to launch, operate and {em("end")} identities.</>}
          intro={
            <>
              every identity gets its own chromium profile, memory, files and permissions. the
              manager runs them side by side, enforces their lifetimes and records what was
              destroyed when they end.
              <br />
              <br />
              every product frame below is a direct capture of the alpha. nothing is redrawn.
              diagrams and coming features are labeled as such.
            </>
          }
        />
        <div style={{ marginTop: 42 }}>
          {/* no frame and no fixed height: the recording keeps its own
              aspect ratio rather than being letterboxed into a still's box */}
          <WalkthroughVideo
            src="/captures/manager-walkthrough.mp4"
            poster="/captures/manager-walkthrough-poster.jpg"
            label="the manager, recorded walkthrough of the alpha"
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "6px 24px",
              marginTop: 10,
              font: "400 11px var(--font-mono)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(25,23,19,.45)" }}>
              <EnforcementChip tid="G1" tone="enforced" />
              the manager · real capture · alpha · recorded walkthrough
            </span>
            <span style={{ color: "var(--accent)" }}>
              an active identity counts down in the sidebar while a persistent one waits:
              compartments side by side
            </span>
          </div>
        </div>
        <div
          className="m-cap-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: 24,
            marginTop: 32,
          }}
        >
          <div>
            {/* unframed, and both captures are the same 1704x980 so the pair
                renders identically side by side */}
            <img
              className="m-img"
              src="/captures/identity-overview.png"
              alt="the manager, an identity's overview with destroy behind a menu · real capture"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
            <div style={{ font: "400 11px/1.6 var(--font-mono)", marginTop: 10 }}>
              <span style={captionChip}>
                <EnforcementChip tid="G1" tone="enforced" />
              </span>
              <span style={{ color: "rgba(25,23,19,.45)" }}>
                the manager · real capture · alpha · identity overview
              </span>
              <br />
              <span style={{ color: "var(--accent)" }}>
                its own chromium profile, its own memory and files · destruction sits behind a menu,
                never a stray click
              </span>
            </div>
          </div>
          <div>
            <img
              className="m-img"
              src="/captures/destruction-receipt.png"
              alt="the manager, a real destruction receipt · real capture"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
            <div style={{ font: "400 11px/1.6 var(--font-mono)", marginTop: 10 }}>
              <span style={captionChip}>
                <EnforcementChip tid="G12" tone="enforced" />
              </span>
              <span style={{ color: "rgba(25,23,19,.45)" }}>
                the manager · real capture · alpha · destruction receipt
              </span>
              <br />
              <span style={{ color: "var(--accent)" }}>
                what remains after destruction: receipt id, verified outcomes, deletion counts
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LifecycleSection() {
  return (
    <div
      data-screen-label="the lifecycle"
      id="lifecycle"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="THE LIFECYCLE"
          title={<>provisioned, operated, {em("destroyed")}. on a schedule you set.</>}
          intro="watch one identity live and end. this is a diagram, not a product screen. a task arrives, an identity is assembled around it, it operates, and when the work ends its managed state is destroyed."
        />
        <div
          className="m-life-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,640px) minmax(280px,1fr)",
            gap: 48,
            marginTop: 44,
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                font: "400 10.5px var(--font-mono)",
                letterSpacing: "0.14em",
                color: "rgba(25,23,19,.45)",
              }}
            >
              THE LIFECYCLE, AS A DIAGRAM · IDENTITY 008
            </div>
            <p
              style={{
                font: "400 20px/1.5 var(--font-display)",
                fontStyle: "italic",
                color: "rgba(25,23,19,.72)",
                margin: "14px 0 0",
              }}
            >
              compile a due-diligence report on one vendor from public filings
            </p>
            <LifecycleTicker />
            <div
              style={{
                font: "400 11px var(--font-mono)",
                color: "rgba(25,23,19,.45)",
                marginTop: 12,
              }}
            >
              <span style={captionChip}>
                <EnforcementChip tid="G11" tone="enforced" />
              </span>
              the lifecycle, as a diagram · staged sequence · not a screen: agent attachment ships
              later and is labeled coming
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid rgba(25,23,19,.12)",
                borderRadius: "var(--r-card)",
                padding: "18px 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ font: "400 13px var(--font-mono)", color: "rgba(25,23,19,.75)" }}>
                003 · client operations
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--state-persistent-l)",
                  }}
                />
                <span
                  style={{
                    font: "500 10.5px var(--font-mono)",
                    letterSpacing: "0.12em",
                    color: "var(--state-persistent-l)",
                  }}
                >
                  PERSISTENT
                </span>
                <span style={{ font: "400 12px var(--font-mono)", color: "rgba(25,23,19,.45)" }}>
                  · unaffected
                </span>
              </span>
            </div>
            <p style={{ font: "400 14px/1.75 var(--font-body)", color: "rgba(25,23,19,.65)", margin: 0 }}>
              identities are compartments. while 008 lives and ends, your other identities do not
              react: no shared cookies, no shared history, no shared files. destruction is scoped
              to the one identity that ends.
            </p>
            <div
              style={{
                borderTop: "1px solid rgba(25,23,19,.12)",
                paddingTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 9,
                font: "400 12px var(--font-mono)",
                color: "rgba(25,23,19,.6)",
              }}
            >
              {(
                [
                  ["var(--state-neutral)", "provisioning · the environment is assembled"],
                  ["var(--state-active-l)", "active · a real chromium process runs inside the compartment"],
                  ["var(--state-expiring-l)", "destroying · local session state removed, profile deleted"],
                  ["var(--state-neutral)", "destroyed · a receipt records what was removed"],
                ] as const
              ).map(([color, text]) => (
                <span key={text}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      marginRight: 9,
                    }}
                  />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuaranteesSection() {
  return (
    <div
      data-screen-label="what gets separated"
      id="guarantees"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="GUARANTEES"
          title={<>what gets {em("separated")}.</>}
          intro="every guarantee has a test id and a label. enforced means the runtime imposes it. advisory means it is a default you can change. nothing here is marketing language."
        />
        <div
          className="m-grid3"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginTop: 40 }}
        >
          {GUARANTEE_CELLS.map((g) => (
            <div
              key={g.name}
              style={{
                background: "var(--surface)",
                border: "1px solid rgba(25,23,19,.12)",
                borderRadius: "var(--r-card)",
                padding: "18px 20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <EnforcementChip tid={g.id} tone={g.tone} size="md" idHref="/guarantees" />
              </div>
              <div style={{ font: "500 15px var(--font-body)", marginTop: 13 }}>{g.name}</div>
              <div
                style={{
                  font: "400 12.5px/1.6 var(--font-body)",
                  color: "rgba(25,23,19,.6)",
                  marginTop: 5,
                }}
              >
                {g.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProofBand() {
  return (
    <div data-screen-label="proof" style={{ borderTop: "1px solid var(--line-l)" }}>
      <div
        style={{
          maxWidth: 1296,
          margin: "0 auto",
          padding: "26px 40px",
          display: "flex",
          justifyContent: "center",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          font: "400 12px var(--font-mono)",
          color: "rgba(25,23,19,.55)",
          letterSpacing: "0.05em",
        }}
      >
        {PROOF_BAND.map((item, i) => (
          <span key={item} style={{ display: "contents" }}>
            {i > 0 && <span style={{ color: "rgba(25,23,19,.3)" }}>·</span>}
            <span>{item}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HonestyBlock() {
  return (
    <div data-screen-label="honesty block" id="honesty" style={{ background: "var(--dark)", position: "relative" }}>
      <Grain dark />
      <div
        style={{
          position: "relative",
          maxWidth: 1296,
          margin: "0 auto",
          padding: "92px 40px",
          color: "var(--bone)",
        }}
      >
        <div style={{ maxWidth: 880 }}>
          <div
            style={{
              font: "400 12px var(--font-mono)",
              letterSpacing: "0.18em",
              color: "rgba(242,239,231,.45)",
            }}
          >
            WHAT MORTAL IS / IS NOT
          </div>
          <p style={{ font: "400 30px/1.5 var(--font-display)", margin: "24px 0 0", color: "var(--bone)" }}>
            mortal separates browser state, files and context. it does not provide anonymity in
            version one. identities running on the same machine share the host’s ip address and
            hardware characteristics. every guarantee is labeled {em("enforced")}, {em("advisory")}{" "}
            or {em("roadmap")}. we do not sell controls that do not exist.
          </p>
        </div>
        <div style={{ display: "flex", gap: 36, marginTop: 44, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <Tag kind="solid" dark style={{ font: "500 10px var(--font-mono)", padding: "4px 10px", borderRadius: 4 }}>
              ENFORCED
            </Tag>
            <span style={{ font: "400 12.5px var(--font-mono)", color: "rgba(242,239,231,.55)" }}>
              isolation the runtime imposes
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <Tag kind="outline" dark style={{ font: "500 10px var(--font-mono)", padding: "3.5px 9px", borderRadius: 4 }}>
              ADVISORY
            </Tag>
            <span style={{ font: "400 12.5px var(--font-mono)", color: "rgba(242,239,231,.55)" }}>
              a default you can change
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <Tag kind="dashed" dark style={{ font: "500 10px var(--font-mono)", padding: "3.5px 9px", borderRadius: 4, color: "rgba(242,239,231,.65)" }}>
              ROADMAP
            </Tag>
            <span style={{ font: "400 12.5px var(--font-mono)", color: "rgba(242,239,231,.55)" }}>
              planned · not yet built · never sold as built
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BlueprintsSection() {
  return (
    <div data-screen-label="blueprints" id="blueprints" style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <SectionHead
          eyebrow="IDENTITY BLUEPRINTS"
          title="Install a complete operating environment for an agent."
          intro="A blueprint defines the browser setup, permissions, memory, files, region, route, lifetime and destruction policy before the identity launches."
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: 36,
            font: "400 13.5px var(--font-mono)",
            color: "rgba(25,23,19,.75)",
          }}
        >
          {BLUEPRINT_DISPLAY.map((b) => (
            <span key={b.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--state-neutral)" }}
              />
              {b.name} · {b.region}
            </span>
          ))}
        </div>
        <p
          style={{
            font: "400 14px/1.75 var(--font-body)",
            color: "rgba(25,23,19,.68)",
            margin: "28px 0 0",
            maxWidth: "56ch",
          }}
        >
          Inspect every permission before launch. See which controls are enforced, which are
          configurable and what the identity can access.
        </p>
        <div
          style={{
            font: "400 12.5px var(--font-mono)",
            color: "rgba(25,23,19,.55)",
            marginTop: 10,
            letterSpacing: "0.02em",
          }}
        >
          install the configuration. bring your own credentials. launch the identity.
        </div>
        <div
          className="m-grid3"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 40 }}
        >
          {BLUEPRINT_CARDS.map((b) => (
            <BlueprintCard key={b.name} b={b} />
          ))}
        </div>
        <div style={{ font: "400 11px var(--font-mono)", color: "rgba(25,23,19,.45)", marginTop: 14 }}>
          these three blueprints ship with the alpha. blueprint sharing is roadmap.
        </div>
      </div>
    </div>
  );
}

function ForAgentsSection() {
  const sdkComment = { color: "rgba(242,239,231,.4)" } as const;
  return (
    <div
      data-screen-label="for agents"
      id="agents"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <div
          className="m-agents-grid"
          style={{ display: "grid", gridTemplateColumns: "46fr 54fr", gap: 64, alignItems: "center" }}
        >
          <div>
            <div
              style={{
                font: "400 12px var(--font-mono)",
                letterSpacing: "0.18em",
                color: "rgba(25,23,19,.5)",
              }}
            >
              THE INTERNET ALREADY HAS AGENTS
            </div>
            <h2
              style={{
                font: "400 42px/1.12 var(--font-display)",
                margin: "14px 0 0",
                letterSpacing: "-0.01em",
                fontWeight: 400,
              }}
            >
              What it does not have is an identity model built for them.
            </h2>
            <p
              style={{
                font: "400 14.5px/1.75 var(--font-body)",
                color: "rgba(25,23,19,.68)",
                margin: "22px 0 0",
                maxWidth: "44ch",
              }}
            >
              Companies will operate fleets of agents across research, support, procurement,
              finance, development and online operations. Those agents cannot all inherit the
              identity of the person who launched them. Mortal is the runtime that decides where
              an agent operates, what it remembers, what it can access and how long it is
              allowed to exist.
            </p>
            <p
              style={{
                font: "400 12.5px/1.7 var(--font-mono)",
                color: "rgba(25,23,19,.5)",
                margin: "20px 0 0",
              }}
            >
              agent assignment and the sdk are not included in the alpha. every agent surface
              remains labeled coming until it ships.
            </p>
          </div>
          <div>
            <div
              style={{
                background: "var(--dark)",
                borderRadius: "var(--r-card)",
                padding: "20px 24px",
                boxShadow: "0 24px 56px rgba(25,23,19,.2)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    font: "400 10.5px var(--font-mono)",
                    letterSpacing: "0.14em",
                    color: "rgba(242,239,231,.45)",
                  }}
                >
                  MORTAL SDK
                </span>
                <Tag kind="dashed" dark style={{ font: "500 9.5px var(--font-mono)", padding: "3px 9px", borderRadius: 4 }}>
                  COMING
                </Tag>
              </div>
              <pre
                style={{
                  margin: "16px 0 0",
                  font: "400 12.5px/1.75 var(--font-mono)",
                  color: "rgba(242,239,231,.85)",
                  whiteSpace: "pre",
                  overflowX: "auto",
                }}
              >
                {`const identity = await mortal.identity.launch({
  blueprint:   'vendor-audit',
  lifetime:    '12h',
  permissions: { network: 'standard', downloads: 'scoped' }
});

await identity.enforcement();
`}
                <span style={sdkComment}>{`// → { browser: 'enforced', memory: 'enforced',
//     files: 'enforced', network: 'advisory',
//     lifetime: 'enforced' }`}</span>
                {`

await identity.destroy();
`}
                <span style={sdkComment}>{`// → receipt retained`}</span>
              </pre>
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <EnforcementChip tid="G1" tone="enforced" dark />
                <EnforcementChip tid="G9" tone="enforced" dark />
                <EnforcementChip tid="G11" tone="enforced" dark />
              </div>
            </div>
            <div style={{ font: "400 11px var(--font-mono)", color: "rgba(25,23,19,.45)", marginTop: 11 }}>
              designed preview · api shape is illustrative and labeled coming · enforcement is
              introspectable, never assumed
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WhoSection() {
  return (
    <div
      data-screen-label="who it's for"
      id="who"
      style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}
    >
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "84px 40px" }}>
        <div
          style={{ font: "400 12px var(--font-mono)", letterSpacing: "0.18em", color: "rgba(25,23,19,.5)" }}
        >
          WHO IT'S FOR
        </div>
        <div
          className="m-grid3"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 28 }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(25,23,19,.12)",
              borderRadius: "var(--r-card)",
              padding: "24px 24px 22px",
            }}
          >
            <div style={{ font: "400 24px var(--font-display)" }}>consultants</div>
            <p style={{ font: "400 13px/1.7 var(--font-body)", color: "rgba(25,23,19,.65)", margin: "10px 0 0" }}>
              one persistent identity per client. notes, links and context stay inside the
              engagement and never bleed into other clients.
            </p>
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(25,23,19,.12)",
              borderRadius: "var(--r-card)",
              padding: "24px 24px 22px",
            }}
          >
            <div style={{ font: "400 24px var(--font-display)" }}>crypto operators</div>
            <p style={{ font: "400 13px/1.7 var(--font-body)", color: "rgba(25,23,19,.65)", margin: "10px 0 0" }}>
              one identity per investigation. sessions, files and history end when the work
              closes.
            </p>
          </div>
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(25,23,19,.12)",
              borderRadius: "var(--r-card)",
              padding: "24px 24px 22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ font: "400 24px var(--font-display)" }}>researchers & agents</span>
              <Tag kind="dashed" style={{ font: "500 9px var(--font-mono)", padding: "2.5px 7px", color: "rgba(25,23,19,.6)" }}>
                AGENTS · COMING
              </Tag>
            </div>
            <p style={{ font: "400 13px/1.7 var(--font-body)", color: "rgba(25,23,19,.65)", margin: "10px 0 0" }}>
              short-lived identities for fieldwork today. assigning them to agents ships later,
              and is labeled coming until it does.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosingSection() {
  return (
    <div data-screen-label="closing" id="closing" style={{ background: "var(--dark)", position: "relative" }}>
      <Grain dark />
      <div
        style={{
          position: "relative",
          maxWidth: 1296,
          margin: "0 auto",
          padding: "110px 40px 96px",
          color: "var(--bone)",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            font: "400 54px/1.15 var(--font-display)",
            margin: "0 auto",
            maxWidth: "18em",
            letterSpacing: "-0.01em",
            fontWeight: 400,
          }}
        >
          launch isolated identities that {em("disappear")} when their work is done.
        </h2>
        <div
          className="m-cta"
          style={{ display: "flex", gap: 14, marginTop: 44, justifyContent: "center", flexWrap: "wrap" }}
        >
          <a
            href="#try"
            style={{
              font: "500 14px var(--font-body)",
              background: "var(--bone)",
              color: "var(--dark)",
              padding: "15px 28px",
              borderRadius: "var(--r-btn)",
            }}
          >
            launch the first identity
          </a>
          <a
            href={MACOS_ALPHA_DMG_URL}
            style={{
              font: "500 14px var(--font-body)",
              border: "1px solid rgba(242,239,231,.35)",
              padding: "15px 28px",
              borderRadius: "var(--r-btn)",
              color: "var(--bone)",
            }}
          >
            download the alpha
          </a>
          <a
            href="/gate"
            style={{
              font: "500 14px var(--font-body)",
              border: "1px solid rgba(242,239,231,.35)",
              padding: "15px 28px",
              borderRadius: "var(--r-btn)",
              color: "var(--bone)",
            }}
          >
            watch the live agents
          </a>
          <a
            href="#guarantees"
            style={{
              font: "500 14px var(--font-body)",
              border: "1px solid rgba(242,239,231,.35)",
              padding: "15px 28px",
              borderRadius: "var(--r-btn)",
              color: "var(--bone)",
            }}
          >
            read the guarantees
          </a>
        </div>
        <div
          style={{
            font: "400 11.5px var(--font-mono)",
            color: "rgba(242,239,231,.45)",
            marginTop: 30,
            letterSpacing: "0.05em",
          }}
        >
          local-first&nbsp;&nbsp;/&nbsp;&nbsp;no account&nbsp;&nbsp;/&nbsp;&nbsp;no telemetry
        </div>
        <div
          style={{
            font: "400 11.5px/1.6 var(--font-mono)",
            color: "rgba(242,239,231,.45)",
            marginTop: 12,
            maxWidth: "62ch",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {ALPHA_INSTALL_NOTE}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  // the wall spec puts the gate at the root; the switch is a build-time
  // flag so the product landing survives until the wall is live in
  // production (recorded in DECISIONS.md). the gate is always previewable
  // at /gate either way.
  if (process.env.NEXT_PUBLIC_WALL_GATE === "1") {
    return <WallGate />;
  }
  return (
    <div>
      <Hero />
      <AgentsNeedIdentities />
      <OperateAcrossRegions />
      <UseCasesBand />
      <TrySection />
      <ManagerSection />
      <LifecycleSection />
      <GuaranteesSection />
      <ProofBand />
      <HonestyBlock />
      <BlueprintsSection />
      <ForAgentsSection />
      <WhoSection />
      <ClosingSection />
      <DownloadSection />
    </div>
  );
}
