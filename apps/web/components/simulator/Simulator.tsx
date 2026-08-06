"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EnforcementChip } from "../Badge";
import {
  clock,
  initialState,
  isExpiring,
  PROVISION_LINES,
  PROVISION_MS,
  provisioned,
  reset,
  setPurpose,
  SIM_PURPOSES,
  start,
  tick,
  type SimState,
} from "./machine";

/**
 * the #try simulator: one 520px card with the real state machine. it is a
 * preview, not the product — the honest note under the cta says exactly
 * that, and the countdown note says the real default lifetime out loud.
 * chips or the free input set the purpose; the selection persists into the
 * active and destroyed states as the identity's purpose line.
 */

const bodyFont = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 0",
  borderBottom: "1px solid rgba(25,23,19,.07)",
  font: `400 13.5px ${bodyFont}`,
};

const receiptRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "11px 0",
  borderBottom: "1px solid rgba(25,23,19,.07)",
  font: `400 13.5px ${bodyFont}`,
  color: "rgba(25,23,19,.7)",
};

const secondaryBtn: CSSProperties = {
  flex: 1,
  textAlign: "center",
  font: `500 14px ${bodyFont}`,
  border: "1px solid rgba(25,23,19,.25)",
  padding: "13px 0",
  borderRadius: 9,
  cursor: "pointer",
  background: "transparent",
  color: "var(--ink)",
};

const downloadBtn: CSSProperties = {
  flex: 1,
  textAlign: "center",
  font: `500 14px ${bodyFont}`,
  background: "var(--ink)",
  color: "var(--ground)",
  padding: "13px 0",
  borderRadius: 9,
};

export function Simulator() {
  const [state, setState] = useState<SimState>(initialState);
  const [typed, setTyped] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  useEffect(() => clearTimers, []);

  const begin = () => {
    clearTimers();
    setState((s) => start(s));
    timeoutRef.current = setTimeout(() => {
      setState((s) => provisioned(s));
      intervalRef.current = setInterval(() => {
        setState((s) => {
          const next = tick(s);
          if (next.phase === "done" && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return next;
        });
      }, 1000);
    }, PROVISION_MS);
  };

  const startOver = () => {
    clearTimers();
    setState((s) => reset(s));
  };

  const pickChip = (label: string) => {
    setTyped("");
    setState((s) => setPurpose(s, label));
  };

  const typePurpose = (value: string) => {
    setTyped(value);
    setState((s) => setPurpose(s, value.trim() === "" ? SIM_PURPOSES[0] : value.trim()));
  };

  const expiring = isExpiring(state);
  const statusColor = expiring ? "var(--state-expiring-l)" : "var(--state-active-l)";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
        <div
          style={{
            width: 520,
            maxWidth: "100%",
            minHeight: 520,
            background: "var(--surface)",
            border: "1px solid rgba(25,23,19,.12)",
            borderRadius: 16,
            boxShadow: "0 24px 56px rgba(25,23,19,.14)",
            padding: "30px 32px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {state.phase === "cfg" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ font: `500 19px ${bodyFont}`, letterSpacing: "-0.01em" }}>
                create a private identity
              </div>
              <div style={{ font: `400 13.5px/1.5 ${bodyFont}`, color: "rgba(25,23,19,.6)", marginTop: 6 }}>
                configure its browser, memory, files and lifetime.
              </div>
              <div style={{ font: `500 12.5px ${bodyFont}`, marginTop: 22 }}>
                what needs its own identity?
              </div>
              <input
                value={typed}
                onChange={(e) => typePurpose(e.target.value)}
                placeholder="an agent task, a client, a test…"
                aria-label="what needs its own identity?"
                style={{
                  marginTop: 9,
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1px solid rgba(25,23,19,.2)",
                  borderRadius: 9,
                  padding: "13px 14px",
                  font: `400 14px ${bodyFont}`,
                  background: "#fff",
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {SIM_PURPOSES.map((label) => {
                  const selected = typed === "" && state.purpose === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => pickChip(label)}
                      style={{
                        font: `400 12.5px ${bodyFont}`,
                        border: `1px solid ${selected ? "var(--accent)" : "rgba(25,23,19,.25)"}`,
                        background: selected ? "rgba(166,67,31,.08)" : "transparent",
                        color: selected ? "var(--accent)" : "rgba(25,23,19,.7)",
                        padding: "6px 13px",
                        borderRadius: 99,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 18,
                }}
              >
                <span style={{ font: `500 12.5px ${bodyFont}` }}>lifetime</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      font: `400 13px ${bodyFont}`,
                      border: "1px solid rgba(25,23,19,.2)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      color: "rgba(25,23,19,.8)",
                    }}
                  >
                    45 minutes&nbsp;&nbsp;▾
                  </span>
                  <EnforcementChip tid="G11" tone="enforced" />
                </span>
              </div>
              <button
                type="button"
                onClick={begin}
                style={{
                  marginTop: "auto",
                  background: "var(--accent)",
                  color: "#fff",
                  textAlign: "center",
                  font: `500 14.5px ${bodyFont}`,
                  padding: "15px 0",
                  borderRadius: 9,
                  cursor: "pointer",
                  border: "none",
                  width: "100%",
                }}
              >
                preview this identity
              </button>
              <div
                style={{
                  font: `400 11.5px/1.5 ${bodyFont}`,
                  color: "rgba(25,23,19,.5)",
                  marginTop: 11,
                  textAlign: "center",
                }}
              >
                the desktop manager is required to create the real isolated chromium identity.
              </div>
            </div>
          )}

          {state.phase === "prov" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              <div style={{ font: `500 17px ${bodyFont}`, textAlign: "center" }}>
                provisioning identity…
              </div>
              <div
                style={{
                  margin: "24px auto 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  font: `400 14px ${bodyFont}`,
                  color: "rgba(25,23,19,.75)",
                }}
              >
                {PROVISION_LINES.map((line, i) => (
                  <span
                    key={line}
                    className="anim-in"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      animationDelay: `${i * 0.5}s`,
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
          )}

          {state.phase === "act" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ font: "600 13px var(--font-mono)", letterSpacing: "0.08em" }}>
                  PREVIEW IDENTITY
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor }}
                  />
                  <span
                    style={{
                      font: "500 11.5px var(--font-mono)",
                      letterSpacing: "0.1em",
                      color: statusColor,
                    }}
                  >
                    {expiring ? "EXPIRING" : "ACTIVE"}
                  </span>
                </span>
              </div>
              <div style={{ font: `400 13px ${bodyFont}`, color: "rgba(25,23,19,.55)", marginTop: 6 }}>
                {state.purpose}
              </div>
              <div style={{ marginTop: 18, borderTop: "1px solid rgba(25,23,19,.1)" }}>
                <div style={rowStyle}>
                  <span style={{ color: "rgba(25,23,19,.7)" }}>browser</span>
                  <span>isolated</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: "rgba(25,23,19,.7)" }}>memory</span>
                  <span>mounted</span>
                </div>
                <div style={rowStyle}>
                  <span style={{ color: "rgba(25,23,19,.7)" }}>files</span>
                  <span>partitioned</span>
                </div>
                <div style={{ ...rowStyle, borderBottom: "none" }}>
                  <span style={{ color: "rgba(25,23,19,.7)" }}>history</span>
                  <span>removed on expiry</span>
                </div>
              </div>
              <div style={{ textAlign: "center", marginTop: 20 }}>
                <div
                  style={{
                    font: "500 46px var(--font-mono)",
                    letterSpacing: "0.02em",
                    color: expiring ? "var(--state-expiring-l)" : "var(--ink)",
                  }}
                >
                  {clock(state)}
                </div>
                <div style={{ font: `400 11.5px ${bodyFont}`, color: "rgba(25,23,19,.5)", marginTop: 4 }}>
                  the preview runs in seconds · the real default lifetime is 45 minutes
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                <button type="button" onClick={startOver} style={secondaryBtn}>
                  start over
                </button>
                <a href="#download" style={downloadBtn}>
                  download the alpha
                </a>
              </div>
            </div>
          )}

          {state.phase === "done" && (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span
                  style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(25,23,19,.35)" }}
                />
                <span style={{ font: "600 13px var(--font-mono)", letterSpacing: "0.08em" }}>
                  DESTRUCTION COMPLETE
                </span>
              </div>
              <div style={{ font: `400 13px ${bodyFont}`, color: "rgba(25,23,19,.55)", marginTop: 6 }}>
                preview identity · {state.purpose}
              </div>
              <div style={{ marginTop: 20, borderTop: "1px solid rgba(25,23,19,.1)" }}>
                <div style={receiptRow}>
                  <span>browser profile</span>
                  <span>removed</span>
                </div>
                <div style={receiptRow}>
                  <span>managed files</span>
                  <span>removed</span>
                </div>
                <div style={receiptRow}>
                  <span>local memory</span>
                  <span>removed</span>
                </div>
                <div style={{ ...receiptRow, borderBottom: "none", color: undefined }}>
                  <span style={{ color: "rgba(25,23,19,.7)" }}>receipt</span>
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>retained</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                <button type="button" onClick={startOver} style={secondaryBtn}>
                  run it again
                </button>
                <a href="#download" style={downloadBtn}>
                  download the alpha
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          font: "400 11px var(--font-mono)",
          color: "rgba(25,23,19,.45)",
          marginTop: 14,
        }}
      >
        interactive preview · simulated in this page · nothing is installed
      </div>
    </div>
  );
}
