import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "../../components/Badge";
import { Grain } from "../../components/site/Grain";
import { Wordmark } from "../../components/Wordmark";

export const metadata: Metadata = {
  title: "the mortal manifesto · witness.run",
  description: "the internet made identity permanent. that was a mistake we can now undo.",
};

/**
 * the manifesto: a single long editorial scroll. five movements, each
 * opened by the page's only motif (a numbered 64x2 rule with an accent
 * fill that advances 20% per movement). two of the compositions are
 * designed to crop self-contained for sharing: the dark discipline band
 * and the hairline-framed closing card.
 */

const em = (s: string) => <em style={{ fontStyle: "italic" }}>{s}</em>;

const essay = {
  font: "400 17px/1.85 var(--font-body)",
  color: "rgba(242,239,231,.78)",
  margin: "26px 0 0",
  maxWidth: "58ch",
  textWrap: "pretty",
} as const;

function Movement({
  n,
  fill,
  label,
  dark = false,
  style,
}: {
  n: string;
  fill: string;
  label: string;
  dark?: boolean;
  style?: React.CSSProperties;
}) {
  const dim = dark ? "rgba(242,239,231,.4)" : "rgba(242,239,231,.45)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, ...style }}>
      <span style={{ font: "500 11px var(--font-mono)", color: dim }}>{n}</span>
      <span
        style={{
          display: "inline-block",
          width: 64,
          height: 2,
          background: dark ? "rgba(242,239,231,.16)" : "rgba(242,239,231,.14)",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: fill,
            background: dark ? "var(--accent-flare)" : "var(--accent)",
          }}
        />
      </span>
      <span style={{ font: "400 11px var(--font-mono)", letterSpacing: "0.16em", color: dim }}>
        {label}
      </span>
    </div>
  );
}

export default function Manifesto() {
  return (
    <div data-screen-label="manifesto" style={{ position: "relative", minHeight: "100vh" }}>
      <Grain />
      <div style={{ position: "relative", maxWidth: 840, margin: "0 auto", padding: "36px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Wordmark variant="nav" />
          <Link href="/" style={{ font: "400 12px var(--font-mono)", color: "rgba(242,239,231,.5)" }}>
            witness.run →
          </Link>
        </div>
        <div className="mf-open" style={{ padding: "190px 0 170px" }}>
          <div
            style={{ font: "400 11px var(--font-mono)", letterSpacing: "0.2em", color: "rgba(242,239,231,.5)" }}
          >
            THE MORTAL MANIFESTO
          </div>
          <h1
            className="mf-a"
            style={{
              font: "400 58px/1.18 var(--font-display)",
              fontWeight: 400,
              margin: "26px 0 0",
              letterSpacing: "-0.01em",
              maxWidth: "17em",
              textWrap: "pretty",
            }}
          >
            the internet made identity permanent. that was a mistake we can now {em("undo")}.
          </h1>
        </div>

        <Movement n="01" fill="20%" label="THE PROBLEM" />
        <p style={essay}>
          every login, every task, every conversation accretes onto one permanent digital self.
          one browser, one set of sessions, one memory that never forgets. for people, that is a
          privacy tax. for autonomous agents, it is a liability: an agent that browses as you
          inherits your sessions, your logins, your history, your reach. we handed software our
          whole identity and called it convenience.
        </p>

        <Movement n="02" fill="40%" label="THE DEFAULT" style={{ marginTop: 110 }} />
        <p style={essay}>
          the danger is not that identity is stored. it is that identity is{" "}
          <em>permanent and shared by default</em>. one self, one context, everything linkable,
          nothing disposable. as agents act on our behalf, "operate as the user" becomes the
          default and the exposure. that default has to end.
        </p>

        <Movement n="03" fill="60%" label="THE STANCE" style={{ marginTop: 110 }} />
        <p style={essay}>
          identity should be disposable. it should be something you provision for a purpose,
          scope to exactly what it needs, and destroy when the work is done. not a profile you
          manage forever. a compartment you create and end. every task, every agent, gets its
          own: its own browser, memory, files, permissions, and a finite life. when it ends, it
          leaves a receipt and nothing else.
        </p>
      </div>

      <div
        className="mf-band grain-d"
        style={{ position: "relative", background: "var(--dark)", marginTop: 130, padding: "110px 40px" }}
      >
        <div style={{ maxWidth: 840, margin: "0 auto", color: "var(--bone)" }}>
          <Movement n="04" fill="80%" label="THE DISCIPLINE" dark />
          <div
            className="mf-q"
            style={{
              font: "400 46px/1.25 var(--font-display)",
              margin: "40px 0 0",
              letterSpacing: "-0.01em",
              maxWidth: "16em",
              textWrap: "pretty",
            }}
          >
            we do not sell controls that do not exist.
          </div>
          <p
            style={{
              font: "400 15.5px/1.85 var(--font-body)",
              color: "rgba(242,239,231,.68)",
              margin: "38px 0 0",
              maxWidth: "58ch",
              textWrap: "pretty",
            }}
          >
            every guarantee mortal makes is labeled by what it actually enforces. what is real is
            marked enforced. what is intended is marked advisory or coming. mortal does not make
            you anonymous, and says so. the whole product is a refusal to lie about what
            isolation means.
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 44, flexWrap: "wrap", alignItems: "center" }}>
            <Tag kind="solid" dark style={{ font: "500 10px var(--font-mono)", padding: "4px 10px", borderRadius: 4 }}>
              ENFORCED
            </Tag>
            <Tag kind="outline" dark style={{ font: "500 10px var(--font-mono)", padding: "3.5px 9px", borderRadius: 4 }}>
              ADVISORY
            </Tag>
            <Tag kind="dashed" dark style={{ font: "500 10px var(--font-mono)", padding: "3.5px 9px", borderRadius: 4, color: "rgba(242,239,231,.65)" }}>
              COMING
            </Tag>
            <Wordmark variant="smallDark" style={{ marginLeft: "auto" }} />
          </div>
        </div>
      </div>

      <div style={{ position: "relative", maxWidth: 840, margin: "0 auto", padding: "0 40px" }}>
        <Movement n="05" fill="100%" label="THE SHAPE OF THE THING" style={{ marginTop: 120 }} />
        <p style={essay}>
          mortal is a programmable identity runtime. local-first. no account. no telemetry. it
          launches real isolated browsers, not simulations. it destroys them on a schedule and
          proves it. it is built so an agent can be given an identity that is not yours, do real
          work inside it, and disappear.
        </p>

        <div
          className="mf-frame"
          style={{
            border: "1px solid rgba(242,239,231,.22)",
            borderRadius: 4,
            marginTop: 130,
            padding: "76px 56px",
            textAlign: "center",
            background: "var(--surface)",
          }}
        >
          <div
            className="mf-a"
            style={{
              font: "400 50px/1.22 var(--font-display)",
              letterSpacing: "-0.01em",
              maxWidth: "16em",
              margin: "0 auto",
              textWrap: "pretty",
            }}
          >
            a task should never inherit more of you than it {em("needs")}.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
              marginTop: 44,
              flexWrap: "wrap",
            }}
          >
            <Wordmark variant="smallLight" />
            <span
              style={{
                font: "400 11px var(--font-mono)",
                color: "rgba(242,239,231,.45)",
                letterSpacing: "0.05em",
              }}
            >
              local-first / no account / no telemetry
            </span>
          </div>
        </div>

        <div
          className="mf-foot"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(242,239,231,.12)",
            marginTop: 110,
            padding: "26px 0 40px",
          }}
        >
          <Wordmark variant="footer" />
          <Link href="/guarantees" style={{ font: "500 13px var(--font-mono)" }}>
            read the guarantees →
          </Link>
        </div>
      </div>
    </div>
  );
}
