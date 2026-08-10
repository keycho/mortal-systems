import type { Metadata } from "next";
import { DESTROYED_MEANS, ENFORCEMENT_TABLE, NON_GUARANTEES } from "@mortal/schema";
import { Tag } from "../../components/Badge";
import { Nav } from "../../components/site/Nav";
import { SiteFooter } from "../../components/site/SiteFooter";

export const metadata: Metadata = {
  title: "guarantees · witness.run",
  description: "every guarantee, labeled honestly: enforced, advisory, or roadmap.",
};

const KIND: Record<string, "solid" | "outline" | "dashed"> = {
  enforced: "solid",
  advisory: "outline",
  roadmap: "dashed",
};

/** generated from the same enforcement table the runtime and both uis read.
 * every "enforced" row maps to at least one automated test or the build fails. */
export default function Guarantees() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ maxWidth: 1296, margin: "0 auto", padding: "36px 40px 40px" }}>
        <Nav />
        <div style={{ maxWidth: 880, margin: "84px 0 0" }}>
          <div
            style={{ font: "400 12px var(--font-mono)", letterSpacing: "0.18em", color: "rgba(242,239,231,.5)" }}
          >
            GUARANTEES
          </div>
          <h1
            style={{
              font: "400 42px/1.12 var(--font-display)",
              margin: "14px 0 0",
              letterSpacing: "-0.01em",
              fontWeight: 400,
            }}
          >
            the guarantees, labeled <em style={{ fontStyle: "italic" }}>honestly</em>.
          </h1>
          <p
            style={{
              font: "400 13.5px/1.75 var(--font-mono)",
              color: "rgba(242,239,231,.6)",
              margin: "22px 0 0",
            }}
          >
            every control carries exactly one label. enforced means a passing automated test
            backs it, and the build fails if that mapping breaks. advisory means a declaration
            shown in the ui, not a technical control. roadmap means not built, and the product
            says so. a control marked conditional is enforced only for identities configured for
            it: a network route attached, a tool scope declared. the identity&apos;s own manifest
            is what tells you whether it applies.
          </p>
        </div>

        <div style={{ overflowX: "auto", marginTop: 44 }}>
          <table
            style={{
              font: "400 12.5px var(--font-mono)",
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 640,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "rgba(242,239,231,.5)",
                  font: "500 10px var(--font-mono)",
                  letterSpacing: "0.18em",
                }}
              >
                <th style={{ padding: "8px 16px 8px 0", fontWeight: 500 }}>CONTROL</th>
                <th style={{ padding: "8px 16px 8px 0", fontWeight: 500 }}>VALUE</th>
                <th style={{ padding: "8px 16px 8px 0", fontWeight: 500 }}>LABEL</th>
                <th style={{ padding: "8px 0", fontWeight: 500 }}>TESTS</th>
              </tr>
            </thead>
            <tbody>
              {ENFORCEMENT_TABLE.map((row) => (
                <tr key={row.field} style={{ borderTop: "1px solid var(--line-l)", verticalAlign: "top" }}>
                  <td style={{ padding: "14px 16px 14px 0" }}>
                    <div style={{ font: "500 13px var(--font-body)" }}>{row.label}</div>
                    <div
                      style={{
                        font: "400 12px/1.6 var(--font-body)",
                        color: "rgba(242,239,231,.6)",
                        maxWidth: 460,
                        marginTop: 4,
                      }}
                    >
                      {row.description}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px 14px 0", color: "rgba(242,239,231,.6)" }}>{row.value}</td>
                  <td style={{ padding: "14px 16px 14px 0" }}>
                    <Tag
                      kind={KIND[row.enforcement]}
                      style={{ font: "500 9.5px var(--font-mono)", padding: "3.5px 9px", borderRadius: 4 }}
                    >
                      {row.enforcement.toUpperCase()}
                    </Tag>
                    {row.conditional !== undefined && (
                      <div
                        style={{
                          color: "rgba(242,239,231,.55)",
                          font: "400 11px/1.6 var(--font-mono)",
                          paddingTop: 6,
                          maxWidth: 240,
                        }}
                      >
                        conditional · {row.conditional}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "14px 0", color: "rgba(242,239,231,.55)", font: "400 11.5px var(--font-mono)" }}>
                    {row.plannedTests.join(" ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 64, maxWidth: 880 }}>
          <h2 style={{ font: "400 24px var(--font-display)", fontWeight: 400, margin: 0 }}>
            what witness.run does not guarantee
          </h2>
          <ul
            style={{
              margin: "16px 0 0",
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 7,
              font: "400 12.5px/1.7 var(--font-mono)",
              color: "rgba(242,239,231,.65)",
            }}
          >
            {NON_GUARANTEES.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </div>

        <div style={{ marginTop: 56, maxWidth: 880 }}>
          <h2 style={{ font: "400 24px var(--font-display)", fontWeight: 400, margin: 0 }}>
            what destroyed means
          </h2>
          <p
            style={{
              font: "400 13px/1.75 var(--font-body)",
              color: "rgba(242,239,231,.7)",
              margin: "16px 0 0",
              border: "1px solid rgba(242,239,231,.12)",
              borderRadius: "var(--r-card)",
              background: "var(--surface)",
              padding: "18px 22px",
            }}
          >
            {DESTROYED_MEANS}
          </p>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
