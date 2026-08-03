import { z, ZodError } from "zod";
import {
  identityIdSchema,
  identityStateSchema,
  RESERVED_METHODS,
  toValidationIssues,
} from "@liminal/schema";
import { errors, RuntimeError } from "../errors.js";
import type { LiminalRuntime } from "../runtime.js";

const createParams = z.object({ manifest: z.unknown() }).strict();
const idParams = z.object({ id: identityIdSchema }).strict();
const destroyParams = z
  .object({ id: identityIdSchema, reason: z.string().max(500).optional() })
  .strict();
const listParams = z
  .object({
    filter: z
      .object({ state: z.array(identityStateSchema).min(1).optional() })
      .strict()
      .optional(),
  })
  .strict();
const activityParams = z
  .object({ identityId: identityIdSchema, limit: z.number().int().min(1).max(1000).optional() })
  .strict();
const blueprintIdSchema = z.string().regex(/^bpt_[A-Za-z0-9_-]{10,32}$/);
const blueprintIdParams = z.object({ id: blueprintIdSchema }).strict();
const blueprintInstallParams = z
  .object({ manifestJson: z.string().min(2), source: z.string().min(1).max(300) })
  .strict();
const blueprintValidateParams = z.object({ manifestJson: z.string() }).strict();
const blueprintExportParams = z.object({ identityId: identityIdSchema }).strict();
const createFromBlueprintParams = z
  .object({
    blueprintId: blueprintIdSchema,
    overrides: z
      .object({
        name: z.string().min(1).max(64).optional(),
        color: z.string().optional(),
        lifetime: z.string().optional(),
        onExpiry: z.enum(["destroy", "suspend", "archive"]).optional(),
        aiProvider: z.enum(["user-key", "none"]).optional(),
        consentedExtensionIds: z.array(z.string()).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * dispatch one rpc call against the runtime. throws RuntimeError for every
 * failure mode; the http layer maps those onto the wire envelope.
 */
export async function dispatchRpc(
  runtime: LiminalRuntime,
  method: string,
  params: unknown
): Promise<unknown> {
  if ((RESERVED_METHODS as readonly string[]).includes(method)) {
    throw errors.notImplemented(
      `"${method}" is reserved in the contract and not implemented in the poc. feature-detect via runtime.capabilities().`
    );
  }

  const input = params ?? {};
  try {
    switch (method) {
      case "identity.create": {
        const p = createParams.parse(input);
        return runtime.identities.create({ manifest: p.manifest });
      }
      case "identity.get": {
        const p = idParams.parse(input);
        return runtime.identities.get(p.id);
      }
      case "identity.list": {
        const p = listParams.parse(input);
        return runtime.identities.list(p.filter);
      }
      case "identity.launch": {
        const p = idParams.parse(input);
        return await runtime.launch(p.id);
      }
      case "identity.suspend": {
        const p = idParams.parse(input);
        await runtime.suspend(p.id);
        return null;
      }
      case "identity.resume": {
        const p = idParams.parse(input);
        return await runtime.resume(p.id);
      }
      case "identity.expire": {
        const p = idParams.parse(input);
        await runtime.expire(p.id);
        return null;
      }
      case "identity.destroy": {
        const p = destroyParams.parse(input);
        return await runtime.destroyIdentity(p.id, { reason: p.reason });
      }
      case "identity.createFromBlueprint": {
        const p = createFromBlueprintParams.parse(input);
        return runtime.blueprints.createIdentity(p);
      }
      case "blueprint.validate": {
        const p = blueprintValidateParams.parse(input);
        return runtime.blueprints.validate(p.manifestJson);
      }
      case "blueprint.install": {
        const p = blueprintInstallParams.parse(input);
        return runtime.blueprints.install(p);
      }
      case "blueprint.export": {
        const p = blueprintExportParams.parse(input);
        return runtime.blueprints.export(p.identityId);
      }
      case "blueprint.list":
        return runtime.blueprints.list();
      case "blueprint.get": {
        const p = blueprintIdParams.parse(input);
        return runtime.blueprints.get(p.id);
      }
      case "activity.read": {
        const p = activityParams.parse(input);
        return runtime.readActivity(p.identityId, p.limit);
      }
      case "runtime.status":
        return runtime.status();
      case "runtime.capabilities":
        return runtime.capabilities();
      default:
        throw new RuntimeError("NOT_FOUND", `unknown rpc method "${method}"`);
    }
  } catch (err) {
    if (err instanceof ZodError) {
      throw errors.validation("invalid rpc params", toValidationIssues(err));
    }
    throw err;
  }
}
