import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getConfig } from "./config.js";

export const API_SCOPES = {
  READ: "vaults:read",
  WRITE: "vaults:write",
  EXPORT: "vaults:export",
};

function hashApiKey(rawKey, pepper) {
  return crypto.createHash("sha256").update(`${pepper}:${rawKey}`).digest("hex");
}

function getPresentedApiKey(headers) {
  const authorization = headers.authorization || headers.Authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return headers["x-api-key"] || headers["X-API-Key"] || null;
}

function parseApiKey(rawKey) {
  const parts = rawKey.split("_");
  if (parts.length !== 3 || parts[0] !== "rhk") {
    return null;
  }

  return {
    prefix: `${parts[0]}_${parts[1]}`,
    rawKey,
  };
}

export function getSupabaseAdmin() {
  const config = getConfig();

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function authenticateApiKey(event) {
  const config = getConfig();
  const supabase = getSupabaseAdmin();
  const rawKey = getPresentedApiKey(event.headers || {});
  if (!rawKey) {
    return { error: "missing_api_key" };
  }

  const parsed = parseApiKey(rawKey);
  if (!parsed) {
    return { error: "invalid_api_key_format" };
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, owner_user_id, label, key_hash, scopes, expires_at, revoked_at, api_key_vaults(vault_id)")
    .eq("key_prefix", parsed.prefix)
    .maybeSingle();

  if (error || !data) {
    return { error: "invalid_api_key" };
  }

  if (data.revoked_at) {
    return { error: "revoked_api_key", keyId: data.id };
  }

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: "expired_api_key", keyId: data.id };
  }

  const presentedHash = hashApiKey(parsed.rawKey, config.apiKeyPepper);
  const expected = Buffer.from(data.key_hash, "utf8");
  const actual = Buffer.from(presentedHash, "utf8");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { error: "invalid_api_key", keyId: data.id };
  }

  const vaultIds = (data.api_key_vaults || []).map((entry) => entry.vault_id);

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    supabase,
    principal: {
      keyId: data.id,
      userId: data.owner_user_id,
      label: data.label,
      scopes: new Set(data.scopes || []),
      restrictedVaultIds: vaultIds.length > 0 ? new Set(vaultIds) : null,
    },
  };
}

export function requireScope(principal, scope) {
  return principal.scopes.has(scope);
}

function permissionRank(permission) {
  if (permission === "owner") return 3;
  if (permission === "editor") return 2;
  return 1;
}

export async function resolveVaultAccess(supabase, principal, vaultId, requiredPermission = "viewer") {
  if (principal.restrictedVaultIds && !principal.restrictedVaultIds.has(vaultId)) {
    return { ok: false, status: 403, code: "vault_not_allowed" };
  }

  const { data: vault, error } = await supabase
    .from("vaults")
    .select("*")
    .eq("id", vaultId)
    .maybeSingle();

  if (error || !vault) {
    return { ok: false, status: 404, code: "vault_not_found" };
  }

  let permission = null;

  if (vault.user_id === principal.userId) {
    permission = "owner";
  } else {
    const { data: share } = await supabase
      .from("vault_shares")
      .select("role")
      .eq("vault_id", vaultId)
      .eq("shared_with_user_id", principal.userId)
      .maybeSingle();

    if (share?.role) {
      permission = share.role;
    } else if (vault.visibility === "public") {
      permission = "viewer";
    }
  }

  if (!permission || permissionRank(permission) < permissionRank(requiredPermission)) {
    return { ok: false, status: 403, code: "insufficient_vault_access", vault };
  }

  return { ok: true, vault, permission };
}
