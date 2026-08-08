/**
 * ulid generation, dependency-free (standard `crypto.getRandomValues` only,
 * same constraint as @mortal/schema ids). monotonic within a process: same
 * millisecond increments the random component so event ids always sort in
 * append order, which the append-only store relies on for cursors.
 */

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // crockford base32
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[now % 32] + out;
    now = Math.floor(now / 32);
  }
  return out;
}

function randomDigits(): number[] {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % 32);
}

export function ulid(now = Date.now()): string {
  let digits: number[];
  if (now === lastTime) {
    // increment the previous random component (with carry) for monotonicity
    digits = [...lastRandom];
    for (let i = RANDOM_LEN - 1; i >= 0; i--) {
      const d = digits[i] as number;
      if (d < 31) {
        digits[i] = d + 1;
        break;
      }
      digits[i] = 0;
    }
  } else {
    digits = randomDigits();
  }
  lastTime = now;
  lastRandom = digits;
  return encodeTime(now) + digits.map((d) => ENCODING[d]).join("");
}
