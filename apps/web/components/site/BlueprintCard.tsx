import { EnforcementChip, Tag } from "../Badge";
import type { BlueprintCard as BlueprintCardData } from "../../lib/site-data";

/**
 * one dark blueprint card: name + state dot, category, description, the
 * permission rows with their enforcement chips, and the install row.
 * "install blueprint" is not a button on the site: installing happens in
 * the desktop manager, and the landing copy says so.
 */
export function BlueprintCard({ b }: { b: BlueprintCardData }) {
  return (
    <div
      style={{
        background: "var(--dark)",
        color: "var(--bone)",
        borderRadius: "var(--r-card-dark)",
        padding: "22px 22px 20px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 18px 42px rgba(25,23,19,.16)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: b.dot }} />
        <span style={{ font: "500 14px var(--font-mono)" }}>{b.name}</span>
        <span
          style={{
            marginLeft: "auto",
            font: "400 10px var(--font-mono)",
            letterSpacing: "0.1em",
            color: "rgba(242,239,231,.4)",
          }}
        >
          {b.cat}
        </span>
      </div>
      <div
        style={{
          font: "400 12px/1.6 var(--font-body)",
          color: "rgba(242,239,231,.55)",
          marginTop: 9,
          minHeight: 56,
        }}
      >
        {b.desc}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--line-d)" }}>
        {b.rows.map((r) => (
          <div
            key={r.k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "8.5px 0",
              borderBottom: "1px solid rgba(242,239,231,.07)",
              font: "400 11.5px var(--font-mono)",
            }}
          >
            <span style={{ color: "rgba(242,239,231,.5)", flex: "none" }}>{r.k}</span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "flex-end",
                flexWrap: "wrap",
                textAlign: "right",
              }}
            >
              <span style={{ color: "rgba(242,239,231,.85)" }}>{r.v}</span>
              <EnforcementChip tid={r.tid} tone={r.tone} dark />
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flex: 1,
            border: "1px solid rgba(242,239,231,.3)",
            borderRadius: "var(--r-btn)",
            textAlign: "center",
            padding: "11px 0",
            font: "500 12px var(--font-mono)",
            color: "rgba(242,239,231,.85)",
          }}
        >
          install blueprint
        </div>
        <Tag kind="solid" dark style={{ font: "500 9px var(--font-mono)", padding: "3.5px 8px" }}>
          SIGNED · FIRST-PARTY
        </Tag>
      </div>
    </div>
  );
}
