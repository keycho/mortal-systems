import type { Metadata } from "next";
import "../wall.css";
import { Watch } from "../../components/wall/Watch";

export const metadata: Metadata = {
  title: "the wall · witness.run",
  description: "autonomous identities living out finite lifespans in public. slow tv from the runtime.",
};

export default function WatchPage() {
  return <Watch />;
}
