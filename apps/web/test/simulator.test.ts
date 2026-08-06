import { describe, expect, it } from "vitest";
import {
  ACT_SECONDS,
  clock,
  EXPIRING_AT,
  initialState,
  isExpiring,
  PROVISION_LINES,
  provisioned,
  reset,
  setPurpose,
  SIM_PURPOSES,
  start,
  tick,
} from "../components/simulator/machine";

describe("simulator machine", () => {
  it("starts configured with the first purpose and a full countdown", () => {
    const s = initialState();
    expect(s.phase).toBe("cfg");
    expect(s.secondsLeft).toBe(ACT_SECONDS);
    expect(s.purpose).toBe("agent task");
  });

  it("keeps the handoff's purposes, in order", () => {
    expect([...SIM_PURPOSES]).toEqual([
      "agent task",
      "client work",
      "research session",
      "new-user test",
    ]);
  });

  it("keeps the handoff's provisioning lines, in order", () => {
    expect([...PROVISION_LINES]).toEqual([
      "browser isolated",
      "memory mounted",
      "files partitioned",
      "history removed on expiry",
    ]);
  });

  it("walks cfg -> prov -> act with the countdown re-armed", () => {
    let s = start(initialState());
    expect(s.phase).toBe("prov");
    s = provisioned(s);
    expect(s.phase).toBe("act");
    expect(s.secondsLeft).toBe(ACT_SECONDS);
  });

  it("ticks the countdown down and destroys at zero", () => {
    let s = provisioned(start(initialState()));
    for (let i = 0; i < ACT_SECONDS - 1; i++) {
      s = tick(s);
      expect(s.phase).toBe("act");
    }
    expect(s.secondsLeft).toBe(1);
    s = tick(s);
    expect(s.phase).toBe("done");
    expect(s.secondsLeft).toBe(0);
  });

  it("only ticks while active", () => {
    const cfg = initialState();
    expect(tick(cfg)).toEqual(cfg);
  });

  it("flips to expiring at three seconds, not four", () => {
    let s = provisioned(start(initialState()));
    while (s.secondsLeft > EXPIRING_AT + 1) s = tick(s);
    expect(s.secondsLeft).toBe(EXPIRING_AT + 1);
    expect(isExpiring(s)).toBe(false);
    s = tick(s);
    expect(s.secondsLeft).toBe(EXPIRING_AT);
    expect(isExpiring(s)).toBe(true);
  });

  it("renders the clock as a zero-padded mm:ss under a minute", () => {
    const s = provisioned(start(initialState()));
    expect(clock(s)).toBe("00:10");
    expect(clock(tick(s))).toBe("00:09");
  });

  it("carries the chosen purpose through the whole lifecycle", () => {
    let s = setPurpose(initialState(), "client work");
    s = provisioned(start(s));
    while (s.phase === "act") s = tick(s);
    expect(s.phase).toBe("done");
    expect(s.purpose).toBe("client work");
  });

  it("resets to cfg with the countdown restored, keeping the purpose", () => {
    let s = setPurpose(initialState(), "research session");
    s = provisioned(start(s));
    s = tick(s);
    s = reset(s);
    expect(s.phase).toBe("cfg");
    expect(s.secondsLeft).toBe(ACT_SECONDS);
    expect(s.purpose).toBe("research session");
  });
});
