import type { Metadata } from "next";
import "../wall.css";
import { Gate } from "../../components/wall/Gate";

export const metadata: Metadata = {
  title: "witness.run",
  description: "identities are alive right now. watch them live out finite lifespans.",
};

/**
 * an alias for the front door: the root serves the gate outright now
 * (the product page moved to /about), and this route survives for old
 * links and previews.
 */
export default function GatePage() {
  return <Gate />;
}
