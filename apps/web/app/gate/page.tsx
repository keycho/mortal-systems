import type { Metadata } from "next";
import "../wall.css";
import { Gate } from "../../components/wall/Gate";

export const metadata: Metadata = {
  title: "mortal systems",
  description: "identities are alive right now. watch them live out finite lifespans.",
};

/**
 * the gate, always reachable here for previews. the root route serves it
 * instead of the landing page when the site is built with
 * NEXT_PUBLIC_WALL_GATE=1 (see DECISIONS.md).
 */
export default function GatePage() {
  return <Gate />;
}
