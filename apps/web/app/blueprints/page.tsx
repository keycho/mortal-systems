import type { Metadata } from "next";
import { BlueprintCard } from "../../components/site/BlueprintCard";
import { Nav } from "../../components/site/Nav";
import { SiteFooter } from "../../components/site/SiteFooter";
import { BLUEPRINT_CARDS } from "../../lib/site-data";

export const metadata: Metadata = {
  title: "blueprints · mortal systems",
  description: "preconfigured identities: permissions, lifetime and enforcement, declared up front.",
};

/**
 * blueprint previews — the same three cards the landing page shows,
 * from the same data. the cards are previews, not the installable
 * artifacts: the site may import types from @mortal/schema only
 * (architecture rule), and install happens in the desktop manager with a
 * full preview and explicit confirm.
 */
export default function Blueprints() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "36px 40px 40px" }}>
        <Nav />
        <div style={{ maxWidth: 880, margin: "84px 0 0" }}>
          <div
            style={{ font: "400 12px var(--font-mono)", letterSpacing: "0.18em", color: "rgba(25,23,19,.5)" }}
          >
            BLUEPRINTS
          </div>
          <h1
            style={{
              font: "400 42px/1.12 var(--font-display)",
              margin: "14px 0 0",
              letterSpacing: "-0.01em",
              fontWeight: 400,
            }}
          >
            identities you can <em style={{ fontStyle: "italic" }}>install</em>.
          </h1>
          <p
            style={{
              font: "400 13.5px/1.75 var(--font-mono)",
              color: "rgba(25,23,19,.6)",
              margin: "22px 0 0",
            }}
          >
            blueprints are configuration only: bookmarks, ai instructions, permissions with
            enforcement labels, and a lifetime. no cookies, no sessions, no credentials, no
            executable code; the schema makes those unrepresentable. install happens in the
            desktop manager with a full preview and explicit confirm.
          </p>
        </div>
        <div
          className="m-grid3"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 44 }}
        >
          {BLUEPRINT_CARDS.map((b) => (
            <BlueprintCard key={b.name} b={b} />
          ))}
        </div>
        <div style={{ font: "400 11px var(--font-mono)", color: "rgba(25,23,19,.45)", marginTop: 14 }}>
          these three blueprints ship with the alpha. blueprint sharing is roadmap.
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}
