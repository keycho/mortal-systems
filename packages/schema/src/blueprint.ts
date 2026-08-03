import { z } from "zod";
import { PERSISTENT, lifetimeSchema } from "./duration.js";
import {
  SCHEMA_VERSION,
  hexColorSchema,
  identityNameSchema,
  publisherSchema,
  semverSchema,
  WEBSTORE_ID_RE,
} from "./manifest.js";

/**
 * the blueprint manifest: an identity manifest minus ids, runtime paths,
 * timestamps and state, plus blueprintVersion / description / category /
 * recommendedLifetime.
 *
 * banned content (cookies, sessions, passwords, api keys, private keys, seed
 * phrases, account data) is schema-impossible rather than regex-filtered:
 * there is no field where such data could live, and unknown keys are rejected
 * at every level by .strict().
 */

export const BLUEPRINT_MAX_BYTES = 256 * 1024;

/** http(s) urls only; no data:/file:/javascript:; no credentials in the url */
export const httpUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((raw, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return issue("must be an absolute url");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return issue(`only http(s) urls are allowed, got "${url.protocol}"`);
    }
    if (url.username !== "" || url.password !== "") {
      return issue("credentials embedded in urls are not allowed");
    }
  });

/** punycode hosts are allowed but must be surfaced to the user before install */
export function urlContainsPunycode(raw: string): boolean {
  try {
    return new URL(raw).hostname.split(".").some((label) => label.startsWith("xn--"));
  } catch {
    return false;
  }
}

export const bookmarkTemplateSchema = z
  .object({
    title: z.string().min(1).max(100),
    url: httpUrlSchema,
    folder: z.string().min(1).max(60).optional(),
  })
  .strict();

/** extension recommendations are chrome web store ids only, shown for consent, never auto-installed */
export const recommendedExtensionSchema = z
  .object({
    id: z.string().regex(WEBSTORE_ID_RE, "must be a 32-char chrome web store id"),
    name: z.string().min(1).max(60),
    note: z.string().max(200).optional(),
  })
  .strict();

export const noteTemplateSchema = z
  .object({
    title: z.string().min(1).max(100),
    bodyMd: z.string().max(20_000),
  })
  .strict();

export const blueprintManifestSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    blueprintVersion: semverSchema,
    name: identityNameSchema,
    description: z.string().min(1).max(500),
    category: z.string().min(1).max(40).regex(/^[a-z][a-z-]*$/, "lowercase words and hyphens only"),
    recommendedLifetime: lifetimeSchema,
    theme: hexColorSchema,
    lifecycle: z
      .object({ onExpiry: z.enum(["destroy", "suspend", "archive"]) })
      .strict()
      .optional(),
    bookmarks: z.array(bookmarkTemplateSchema).max(100).optional(),
    /** empty bookmark folders to scaffold (e.g. per-client folders) */
    bookmarkFolders: z.array(z.string().min(1).max(60)).max(20).optional(),
    notes: z.array(noteTemplateSchema).max(10).optional(),
    recommendedExtensions: z.array(recommendedExtensionSchema).max(10).optional(),
    ai: z
      .object({ systemInstructions: z.string().max(8000) })
      .strict()
      .optional(),
    permissions: z
      .object({
        wallet: z
          .object({ value: z.enum(["none", "read-intent", "declared"]), enforcement: z.literal("advisory") })
          .strict()
          .optional(),
        email: z
          .object({ value: z.enum(["none", "temporary", "dedicated"]), enforcement: z.literal("roadmap") })
          .strict()
          .optional(),
        network: z
          .object({ value: z.literal("standard"), enforcement: z.literal("advisory") })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    privacy: z
      .object({
        retainHistory: z
          .object({ value: z.boolean(), enforcement: z.literal("enforced") })
          .strict(),
      })
      .strict()
      .optional(),
    publisher: publisherSchema,
  })
  .strict()
  .superRefine((bp, ctx) => {
    if (bp.recommendedLifetime === PERSISTENT && bp.lifecycle?.onExpiry === "destroy") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lifecycle", "onExpiry"],
        message: 'onExpiry "destroy" requires a non-persistent recommendedLifetime',
      });
    }
  });

export type BlueprintManifest = z.infer<typeof blueprintManifestSchema>;
export type BookmarkTemplate = z.infer<typeof bookmarkTemplateSchema>;
export type NoteTemplate = z.infer<typeof noteTemplateSchema>;
