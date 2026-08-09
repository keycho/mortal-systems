import type { Metadata } from "next";
import "./wall.css";
import { Gate } from "../components/wall/Gate";

export const metadata: Metadata = {
  title: "mortal systems",
  description: "identities are alive right now. watch them live out finite lifespans.",
};

/**
 * the wall is the front door: mortal.systems opens on the gate, six
 * lives on their clocks. the product page moved to /about, where the
 * gate's own "about mortal" link leads; /gate stays as an alias for
 * old links and previews.
 */
export default function Home() {
  return <Gate />;
}
