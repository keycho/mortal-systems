import type { Metadata } from "next";
import "../wall.css";
import { Graveyard } from "../../components/wall/Graveyard";

export const metadata: Metadata = {
  title: "the graveyard · witness.run",
  description: "every identity that lived on the wall and is gone. frozen archives, teardown receipts.",
};

export default function GraveyardPage() {
  return <Graveyard />;
}
