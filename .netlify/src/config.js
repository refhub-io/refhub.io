const DEFAULT_MAX_BULK_ITEMS = 50;

function readRequired(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getConfig() {
  return {
    supabaseUrl: readRequired("SUPABASE_URL"),
    supabaseServiceRoleKey: readRequired("SUPABASE_SERVICE_ROLE_KEY"),
    apiKeyPepper: readRequired("REFHUB_API_KEY_PEPPER"),
    maxBulkItems: Number(process.env.REFHUB_API_MAX_BULK_ITEMS || DEFAULT_MAX_BULK_ITEMS),
    auditDisabled: process.env.REFHUB_API_AUDIT_DISABLED === "true",
  };
}
