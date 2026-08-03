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
      case "identity.createFromBlueprint":
      case "blueprint.validate":
      case "blueprint.install":
      case "blueprint.export":
      case "blueprint.list":
        throw errors.notImplemented(
          `"${method}" is day-5 scope of the poc build and not implemented yet`
        );
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
