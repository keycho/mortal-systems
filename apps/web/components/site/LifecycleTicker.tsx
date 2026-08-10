"use client";

import { useEffect, useState } from "react";
import { Tag } from "../Badge";

/**
 * the lifecycle, as a diagram — explicitly not a product screen. a 34
 * second staged loop: 1s request, 6s assembly, 17s active (the countdown
 * ticks), 5s teardown line sequence to DESTROYING · 00:00, 5s destroyed
 * hold with the receipt line, then it loops. this is the second of the
 * page's two ambient animations. under prefers-reduced-motion the loop
 * does not run and the diagram holds a representative ACTIVE frame.
 */

const CYCLE = 34;

const STEPS: Array<{ n: string; s: string; coming: boolean }> = [
  { n: "01", s: "identity created", coming: false },
  { n: "02", s: "chromium isolated · real process", coming: false },
  { n: "03", s: "memory mounted", coming: false },
  { n: "04", s: "files partitioned", coming: false },
  { n: "05", s: "permissions applied", coming: false },
  { n: "06", s: "agent attached", coming: true },
];

const DONE_LINES = [
  "agent complete",
  "→ report exported",
  "→ local session state removed",
  "→ profile deleted",
  "→ identity destroyed",
  "→ receipt retained",
];

const GREY = "var(--state-neutral)";
const OLIVE = "var(--state-active-l)";
const RED = "var(--state-expiring-l)";

const pad = (n: number) => String(n).padStart(2, "0");
const ms = (s: number) => pad(Math.floor(s / 60)) + ":" + pad(s % 60);

interface Frame {
  steps: typeof STEPS;
  done: string[];
  dead: boolean;
  status: string;
  color: string;
  remain: string;
}

function frame(ph: number): Frame {
  if (ph < 1) return { steps: [], done: [], dead: false, status: "REQUEST", color: GREY, remain: "·" };
  if (ph < 7)
    return {
      steps: STEPS.slice(0, ph),
      done: [],
      dead: false,
      status: "PROVISIONING",
      color: GREY,
      remain: "·",
    };
  if (ph < 24)
    return {
      steps: STEPS,
      done: [],
      dead: false,
      status: "ACTIVE",
      color: OLIVE,
      remain: ms(2321 - (ph - 7)) + " REMAINING",
    };
  if (ph < 30)
    return {
      steps: [],
      done: DONE_LINES.slice(0, ph - 23),
      dead: false,
      status: "DESTROYING",
      color: RED,
      remain: "00:00",
    };
  return { steps: [], done: [], dead: true, status: "DESTROYED", color: GREY, remain: "RECEIPT RETAINED" };
}

/** representative frame for server render and reduced motion: mid ACTIVE */
const STATIC_PHASE = 12;

export function LifecycleTicker() {
  const [t, setT] = useState(STATIC_PHASE);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setT(0);
    const iv = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const f = frame(t % CYCLE);

  return (
    <div>
      <div
        style={{
          height: 236,
          marginTop: 22,
          borderLeft: "2px solid rgba(242,239,231,.15)",
          paddingLeft: 26,
          overflow: "hidden",
        }}
        aria-live="off"
      >
        {f.steps.length > 0 && (
          <div>
            {f.steps.map((st) => (
              <div
                key={st.n}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "baseline",
                  padding: "6px 0",
                  font: "400 14px var(--font-mono)",
                }}
              >
                <span style={{ color: "rgba(242,239,231,.35)" }}>{st.n}</span>
                <span style={{ color: "rgba(242,239,231,.8)" }}>{st.s}</span>
                {st.coming && (
                  <Tag kind="dashed" style={{ font: "500 9px var(--font-mono)", padding: "2px 7px" }}>
                    COMING
                  </Tag>
                )}
              </div>
            ))}
          </div>
        )}
        {f.done.length > 0 && (
          <div>
            {f.done.map((dl) => (
              <div
                key={dl}
                style={{ padding: "6px 0", font: "400 14px var(--font-mono)", color: "rgba(242,239,231,.8)" }}
              >
                {dl}
              </div>
            ))}
          </div>
        )}
        {f.dead && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 40 }}>
            <span style={{ font: "400 16px var(--font-mono)", color: "var(--ink)" }}>
              identity 008 destroyed
            </span>
            <span style={{ font: "400 13px var(--font-mono)", color: "rgba(242,239,231,.5)" }}>
              managed state removed · receipt retained
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
              <span style={{ font: "400 13px var(--font-mono)", color: "var(--state-persistent-l)" }}>
                client operations unaffected
              </span>
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(242,239,231,.15)",
          paddingTop: 14,
          marginTop: 10,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: f.color }} />
          <span
            style={{ font: "500 12px var(--font-mono)", letterSpacing: "0.14em", color: f.color }}
          >
            {f.status}
          </span>
        </span>
        <span style={{ font: "500 13px var(--font-mono)", letterSpacing: "0.08em", color: f.color }}>
          {f.remain}
        </span>
      </div>
    </div>
  );
}
