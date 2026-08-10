import type { Metadata } from "next";
import "../wall.css";
import { Gate } from "../../components/wall/Gate";

export const metadata: Metadata = {
  title: "the wall · witness.run",
  description: "identities are alive right now. watch them live out finite lifespans.",
};

/**
 * the wall's own address. the root opened on the gate for a while and
 * this route was its alias; the landing page is the front door again, so
 * this is where the wall lives now and where the hero's "watch the live
 * agents" leads.
 */
export default function GatePage() {
  return <Gate />;
}
