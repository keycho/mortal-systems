const pad = (n: number) => String(n).padStart(2, "0");

/**
 * countdown formatting, mirrored from @liminal/schema's formatRemaining.
 * duplicated deliberately: the companion bundle stays dependency-free so the
 * stamped template never carries workspace code it does not need. the shared
 * unit test in test/format.test.ts pins both implementations to the same
 * vectors.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "00m 00s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 3600) {
    return `${pad(Math.floor(totalSeconds / 60))}m ${pad(totalSeconds % 60)}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 1440) {
    return `${pad(Math.floor(totalMinutes / 60))}h ${pad(totalMinutes % 60)}m`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  return `${pad(Math.floor(totalHours / 24))}d ${pad(totalHours % 24)}h`;
}
