// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatBytes, spaceLabel, StatePill } from "../src/components/IdentityRow.js";

afterEach(cleanup);

describe("state pill", () => {
  it("renders quiet room-status language for states", () => {
    render(<StatePill state="created" />);
    expect(screen.getByTestId("state-pill").textContent).toBe("prepared");
  });

  it("renders running as active with the status color", () => {
    render(<StatePill state="running" />);
    const pill = screen.getByTestId("state-pill");
    expect(pill.textContent).toBe("active");
    expect(pill.getAttribute("style")).toContain("--app-active");
  });

  it("renders destroyed muted", () => {
    render(<StatePill state="destroyed" />);
    expect(screen.getByTestId("state-pill").textContent).toBe("destroyed");
  });
});

describe("labels and formatting", () => {
  it("pads space labels to three digits", () => {
    expect(spaceLabel(4)).toBe("space 004");
    expect(spaceLabel(17)).toBe("space 017");
    expect(spaceLabel(123)).toBe("space 123");
  });

  it("formats byte sizes for humans", () => {
    expect(formatBytes(512)).toBe("512 b");
    expect(formatBytes(4096)).toBe("4.0 kb");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 mb");
  });
});
