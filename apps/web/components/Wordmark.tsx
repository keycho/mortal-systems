/**
 * inline svg wordmark: the site mono, with the space between words as a thin
 * timer bar (the countdown-colon motif). no illustration in v1; a slot for a
 * real mark later.
 */
export function Wordmark({ height = 16 }: { height?: number }) {
  const width = height * 10.5;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 168 16"
      role="img"
      aria-label="mortal systems"
      className="shrink-0"
    >
      <text
        x="0"
        y="12.5"
        fontFamily="inherit"
        fontSize="13"
        letterSpacing="1.5"
        fill="currentColor"
      >
        mortal
      </text>
      <rect x="62" y="10.5" width="14" height="2" fill="var(--state-active)">
        <animate
          attributeName="width"
          values="14;3;14"
          dur="8s"
          repeatCount="indefinite"
        />
      </rect>
      <text
        x="82"
        y="12.5"
        fontFamily="inherit"
        fontSize="13"
        letterSpacing="1.5"
        fill="currentColor"
      >
        systems
      </text>
    </svg>
  );
}
