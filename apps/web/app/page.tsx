import { EnforcementChip, Tag } from "../components/Badge";
import { BlueprintCard } from "../components/site/BlueprintCard";
import { ContourMark } from "../components/site/ContourMark";
import { DownloadSection } from "../components/site/DownloadSection";
import { Grain } from "../components/site/Grain";
import { LifecycleTicker } from "../components/site/LifecycleTicker";
import { Nav } from "../components/site/Nav";
import { SectionHead } from "../components/site/SectionHead";
import { Simulator } from "../components/simulator/Simulator";
import { BLUEPRINT_CARDS, GUARANTEE_CELLS, JOBS, PROOF_BAND } from "../lib/site-data";

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
              PROGRAMMABLE IDENTITY RUNTIME
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
              Your agents should never
              <br />
              {em("inherit")} your identity.
            </h1>
            <p
              style={{
                font: "400 15.5px/1.7 var(--font-body)",
                color: "rgba(25,23,19,.7)",
                margin: "26px 0 0",
                maxWidth: "46ch",
              }}
            >
              an ai agent with your browser has your logins, your email, your accounts, your
              reach. people hand that over every day. mortal gives the agent its own identity
              instead: a real isolated browser, its own memory and files, scoped permissions, a
              finite life. when the work ends it is destroyed, and leaves only a receipt.
            </p>
            <div className="m-cta" style={{ display: "flex", gap: 14, marginTop: 36 }}>
              <a
                href="#download"
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
                try it in your browser
              </a>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                border: "1px dashed rgba(25,23,19,.3)",
                borderRadius: "var(--r-btn)",
                padding: "10px 16px",
                marginTop: 14,
              }}
            >
              <span style={{ font: "400 12.5px var(--font-mono)", color: "rgba(25,23,19,.45)" }}>
                watch an agent get an identity
              </span>
              <Tag kind="dashed">COMING</Tag>
            </div>
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
              local-first&nbsp;&nbsp;/&nbsp;&nbsp;no account&nbsp;&nbsp;/&nbsp;&nbsp;scoped
              context&nbsp;&nbsp;/&nbsp;&nbsp;enforced lifecycle
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
          ↓&nbsp;&nbsp;one task → isolated identity → real browser → enforced destruction
        </div>
      </div>
    </div>
  );
}

function JobsBand() {
  return (
    <div data-screen-label="jobs" style={{ position: "relative", borderTop: "1px solid var(--line-l)" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "60px 40px 68px" }}>
        <div
          style={{ font: "400 12px var(--font-mono)", letterSpacing: "0.18em", color: "rgba(25,23,19,.5)" }}
        >
          WHAT YOU'D USE IT FOR
        </div>
        <div
          className="m-jobs"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(0,1fr))",
            gap: 14,
            marginTop: 24,
          }}
        >
          {JOBS.map((job) => (
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

function CaptureFrame({ children, height }: { children: React.ReactNode; height?: number }) {
  return (
    <div
      style={{
        border: "1px solid var(--line-l-mid)",
        borderRadius: "var(--r-card-dark)",
        overflow: "hidden",
        boxShadow: "0 24px 56px rgba(25,23,19,.14)",
        background: "var(--frame)",
        height,
      }}
    >
      {children}
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
          <CaptureFrame>
            <img
              className="m-img"
              src="/captures/manager-home.png"
              alt="the manager, home screen · real capture"
              style={{ display: "block", width: "100%", height: 640, objectFit: "contain" }}
            />
          </CaptureFrame>
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
              the manager · real capture · alpha · home
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
            <CaptureFrame>
              <img
                className="m-img"
                src="/captures/running-identity.png"
                alt="the manager, running identity overview · real capture"
                style={{ display: "block", width: "100%", height: 400, objectFit: "contain" }}
              />
            </CaptureFrame>
            <div style={{ font: "400 11px/1.6 var(--font-mono)", marginTop: 10 }}>
              <span style={captionChip}>
                <EnforcementChip tid="G11" tone="enforced" />
              </span>
              <span style={{ color: "rgba(25,23,19,.45)" }}>
                the manager · real capture · alpha · running identity · live countdown
              </span>
              <br />
              <span style={{ color: "var(--accent)" }}>
                the countdown is enforced by the runtime · a real chromium process, never a webview
              </span>
            </div>
          </div>
          <div>
            <CaptureFrame height={400}>
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 24,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    border: "1px dashed rgba(25,23,19,.3)",
                    borderRadius: "var(--r-btn)",
                    padding: "18px 22px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    maxWidth: 380,
                    textAlign: "center",
                  }}
                >
                  <span style={{ font: "400 11px/1.6 var(--font-mono)", color: "rgba(25,23,19,.45)" }}>
                    destruction receipt · receipt id, verified outcomes, deletion counts, D0–D7
                    timeline
                  </span>
                  <Tag kind="dashed">REAL CAPTURE · COMING</Tag>
                </div>
              </div>
            </CaptureFrame>
            <div style={{ font: "400 11px/1.6 var(--font-mono)", marginTop: 10 }}>
              <span style={captionChip}>
                <EnforcementChip tid="G7" tone="enforced" />
              </span>
              <span style={{ color: "rgba(25,23,19,.45)" }}>
                the manager · real capture · alpha · destruction receipt
              </span>
              <br />
              <span style={{ color: "var(--accent)" }}>
                what remains after destruction: the receipt
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
          eyebrow="BLUEPRINTS"
          title={<>identities you can {em("install")}.</>}
          intro="a blueprint is a preconfigured identity: permissions, lifetime and enforcement, declared up front. install one and launch it: the environment is identical every time."
        />
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
              FOR AGENTS
            </div>
            <h2
              style={{
                font: "400 42px/1.12 var(--font-display)",
                margin: "14px 0 0",
                letterSpacing: "-0.01em",
                fontWeight: 400,
              }}
            >
              agents get an identity, not {em("your")} identity.
            </h2>
            <p
              style={{
                font: "400 14.5px/1.75 var(--font-body)",
                color: "rgba(25,23,19,.68)",
                margin: "22px 0 0",
                maxWidth: "44ch",
              }}
            >
              an agent that browses as you can inherit your sessions, history and logged-in
              accounts. mortal gives it a scoped environment instead: a real browser, its own
              memory and files, a finite lifetime and none of your existing browser state.
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
        <div className="m-cta" style={{ display: "flex", gap: 14, marginTop: 44, justifyContent: "center" }}>
          <a
            href="#download"
            style={{
              font: "500 14px var(--font-body)",
              background: "var(--bone)",
              color: "var(--dark)",
              padding: "15px 28px",
              borderRadius: "var(--r-btn)",
            }}
          >
            download the alpha
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
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div>
      <Hero />
      <JobsBand />
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
