import type { BlueprintManifest } from "@liminal/schema";

export const clientOperations: BlueprintManifest = {
  schemaVersion: "2.0",
  blueprintVersion: "1.0.0",
  name: "Client Operations",
  description:
    "a persistent space scoped to a single client engagement. notes, links and ai context stay inside the engagement and never bleed into other clients.",
  category: "client-work",
  recommendedLifetime: "persistent",
  lifecycle: { onExpiry: "archive" },
  theme: "#F59E0B",
  bookmarkFolders: ["client docs", "deliverables", "meetings"],
  notes: [
    {
      title: "meeting notes",
      bodyMd:
        "# meeting notes\n\n## {date} · {attendees}\n\n### agenda\n\n- \n\n### decisions\n\n- \n\n### actions\n\n- [ ] \n",
    },
  ],
  ai: {
    systemInstructions:
      "you are an assistant scoped to this client engagement only. never reference other clients, other engagements, or anything outside this space. keep summaries factual and attributable to the meeting or document they came from.",
  },
  permissions: {
    wallet: { value: "none", enforcement: "advisory" },
    network: { value: "standard", enforcement: "advisory" },
    email: { value: "none", enforcement: "roadmap" },
  },
  privacy: { retainHistory: { value: true, enforcement: "enforced" } },
  publisher: { id: "liminal.first-party", reviewTier: "standard" },
};
