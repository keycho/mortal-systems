import type {
  BlueprintManifest,
  IdentityPermissions,
  IdentityPrivacy,
} from "@mortal/schema";
import { enforcementBadge, type Colors } from "./output.js";

/**
 * permission display shared by show / create / blueprints. every value is
 * printed with its real enforcement label from the manifest — the labels are
 * schema-constrained (a manifest cannot over-claim), and the cli never
 * reorders or rewords them.
 */

/**
 * what an identity created from this blueprint gets: the blueprint's declared
 * permissions where present, otherwise the compose defaults — mirrors
 * composeManifest in @mortal/schema exactly, including the fixed enforced
 * partitions every identity has.
 */
export function effectivePermissions(bp: BlueprintManifest): IdentityPermissions {
  return {
    filesystem: { value: "identity-partition-only", enforcement: "enforced" },
    memoryScope: { value: "identity-only", enforcement: "enforced" },
    wallet: bp.permissions?.wallet ?? { value: "none", enforcement: "advisory" },
    email: bp.permissions?.email ?? { value: "none", enforcement: "roadmap" },
    // tool scoping (G20) exists only on identities created with a toolScope;
    // blueprints do not declare it
    tools: { value: "open", enforcement: "advisory", scope: null },
    // blueprints declare network only as standard/advisory; a routed+enforced
    // network (G19) exists solely on identities created with a networkRoute
    network: bp.permissions?.network
      ? { ...bp.permissions.network, route: null }
      : { value: "standard", enforcement: "advisory", route: null },
  };
}

export function effectivePrivacy(bp: BlueprintManifest): IdentityPrivacy {
  return {
    retainHistory: bp.privacy?.retainHistory ?? { value: true, enforcement: "enforced" },
    redaction: { value: false, enforcement: "roadmap" },
  };
}

/** rows of [label, value, enforcement-badge] for formatTable */
export function permissionRows(
  c: Colors,
  permissions: IdentityPermissions,
  privacy: IdentityPrivacy
): string[][] {
  const row = (label: string, value: string | boolean, e: Parameters<typeof enforcementBadge>[1]) => [
    label,
    String(value),
    enforcementBadge(c, e),
  ];
  return [
    row("filesystem", permissions.filesystem.value, permissions.filesystem.enforcement),
    row("memory scope", permissions.memoryScope.value, permissions.memoryScope.enforcement),
    row("wallet", permissions.wallet.value, permissions.wallet.enforcement),
    row("email", permissions.email.value, permissions.email.enforcement),
    row(
      "network",
      permissions.network.value +
        (permissions.network.route !== null
          ? ` via ${permissions.network.route.label ?? permissions.network.route.proxy}`
          : ""),
      permissions.network.enforcement
    ),
    row(
      "tools",
      permissions.tools.value + (permissions.tools.scope !== null ? " (scoped)" : ""),
      permissions.tools.enforcement
    ),
    row("retain history", privacy.retainHistory.value, privacy.retainHistory.enforcement),
    row("redaction", privacy.redaction.value, privacy.redaction.enforcement),
  ];
}
