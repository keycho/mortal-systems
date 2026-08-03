"use client";

import { useEffect, useRef, useState } from "react";
import { formatRemaining } from "@mortal/schema";

/**
 * the hero artifact: three space cards with genuinely ticking countdowns.
 * when the expiring card hits zero on the visitor's screen it runs the
 * destruction sequence, leaves an empty numbered slot, and a new space
 * provisions into it. the product thesis, happening in front of the visitor.
 *
 * preview only — labeled as such. state is react memory; nothing persists.
 */

type Phase = "steady" | "grace" | "destroying" | "vacant" | "provisioning";

interface WallCard {
  spaceNumber: number;
  name: string;
  stateLabel: string;
  color: string;
  /** ms remaining at seed; null = persistent */
  remainingMs: number | null;
  phase: Phase;
}

const REPROVISION_ROTATION = [
  { name: "agent research", ms: 75_000 },
  { name: "competitor teardown", ms: 90_000 },
  { name: "incident review", ms: 60_000 },
];

function seedCards(): WallCard[] {
  return [
    {
      spaceNumber: 4,
      name: "onchain investigator",
      stateLabel: "active",
      color: "var(--state-active)",
      remainingMs: 4 * 3_600_000 + 18 * 60_000 + Math.floor(Math.random() * 40_000),
      phase: "steady",
    },
    {
      spaceNumber: 11,
      name: "client acme",
      stateLabel: "persistent",
      color: "var(--state-persistent)",
      remainingMs: null,
      phase: "steady",
    },
    {
      spaceNumber: 17,
      name: "agent research",
      stateLabel: "expiring",
      color: "var(--state-expiring)",
      remainingMs: 42_000,
      phase: "steady",
    },
  ];
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function LiveWall() {
  const [cards, setCards] = useState<WallCard[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const rotationIndex = useRef(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setCards(seedCards());
  }, []);

  useEffect(() => {
    if (cards === null) return;
    const timer = setInterval(() => {
      setCards((previous) => {
        if (previous === null) return previous;
        return previous.map((card) => {
          if (card.phase !== "steady" || card.remainingMs === null) return card;
          const next = Math.max(0, card.remainingMs - 1_000);
          if (next === 0) {
            setAnnouncement(`space ${pad(card.spaceNumber)} expired; running the deletion contract`);
            return { ...card, remainingMs: 0, phase: "grace" as Phase, stateLabel: "expiring" };
          }
          return { ...card, remainingMs: next };
        });
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [cards === null]);

  // phase advancement: grace -> destroying -> vacant -> provisioning -> steady
  useEffect(() => {
    if (cards === null) return;
    const active = cards.find((c) => c.phase !== "steady");
    if (!active) return;
    const delays: Record<Phase, number> = {
      steady: 0,
      grace: reducedMotion ? 400 : 1_600,
      destroying: reducedMotion ? 400 : 2_200,
      vacant: 2_600,
      provisioning: reducedMotion ? 200 : 700,
    };
    const timeout = setTimeout(() => {
      setCards((previous) => {
        if (previous === null) return previous;
        return previous.map((card) => {
          if (card.phase === "steady") return card;
          switch (card.phase) {
            case "grace":
              return { ...card, phase: "destroying", stateLabel: "destroying", color: "var(--state-destroying)" };
            case "destroying":
              setAnnouncement(`space ${pad(card.spaceNumber)} destroyed; slot vacant`);
              return { ...card, phase: "vacant", stateLabel: "vacant" };
            case "vacant": {
              const next = REPROVISION_ROTATION[rotationIndex.current % REPROVISION_ROTATION.length]!;
              rotationIndex.current += 1;
              setAnnouncement(`space ${pad(card.spaceNumber)} provisioning ${next.name}`);
              return {
                ...card,
                phase: "provisioning",
                name: next.name,
                stateLabel: "provisioning",
                color: "var(--state-active)",
                remainingMs: next.ms,
              };
            }
            case "provisioning":
              return { ...card, phase: "steady", stateLabel: "active" };
            default:
              return card;
          }
        });
      });
    }, delays[active.phase]);
    return () => clearTimeout(timeout);
  }, [cards, reducedMotion]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] tracking-widest uppercase text-mute">
        preview · real functionality requires the desktop manager
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-hidden={false}>
        {(cards ?? seedPlaceholder()).map((card) => (
          <WallCardView key={card.spaceNumber} card={card} reducedMotion={reducedMotion} />
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** server-render a stable frame so hydration causes no layout shift */
function seedPlaceholder(): WallCard[] {
  return seedCards().map((c) => ({ ...c, remainingMs: c.remainingMs === null ? null : 0 }));
}

const pad = (n: number) => String(n).padStart(3, "0");

function WallCardView({ card, reducedMotion }: { card: WallCard; reducedMotion: boolean }) {
  if (card.phase === "vacant") {
    return (
      <div className="border border-dashed border-line p-4 min-h-[124px] flex flex-col justify-between">
        <span className="text-[10px] tracking-widest uppercase text-mute">
          space {pad(card.spaceNumber)}
        </span>
        <span className="text-[11px] text-mute">vacant</span>
      </div>
    );
  }

  const expiringSoon =
    card.phase === "steady" && card.remainingMs !== null && card.remainingMs <= 60_000;

  return (
    <div
      className={[
        "relative border border-line bg-panel p-4 min-h-[124px] flex flex-col gap-2",
        card.phase === "destroying" && !reducedMotion ? "anim-collapse" : "",
        card.phase === "provisioning" && !reducedMotion ? "anim-provision" : "",
        expiringSoon && !reducedMotion ? "anim-decay" : "",
      ].join(" ")}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0"
        style={{ width: "var(--rail)", background: card.color }}
      />
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] tracking-widest uppercase text-mute">
          space {pad(card.spaceNumber)}
        </span>
        <span className="text-[10px] border border-line px-2 py-0.5" style={{ color: card.color }}>
          {card.stateLabel}
        </span>
      </div>
      <span className="text-[13px]">{card.name}</span>
      <div className="text-[11px] text-mute mt-auto tabular-nums">
        {card.phase === "grace" && <span style={{ color: "var(--state-expiring)" }}>grace notice · closing</span>}
        {card.phase === "destroying" && (
          <span style={{ color: "var(--state-destroying)" }}>running deletion contract D0-D7</span>
        )}
        {card.phase === "provisioning" && <span>provisioning partition</span>}
        {card.phase === "steady" &&
          (card.remainingMs === null ? (
            <span>no expiry scheduled</span>
          ) : (
            <span suppressHydrationWarning className={expiringSoon ? "text-ink" : ""}>
              {formatRemaining(card.remainingMs)} remaining
            </span>
          ))}
      </div>
    </div>
  );
}
