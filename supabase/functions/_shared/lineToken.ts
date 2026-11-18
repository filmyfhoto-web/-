// Resolves the LINE channel access token. Environment variables win; the
// public.line_credentials row is only a fallback while values are being moved
// into the environment (and should be purged once they are).
import { envCredentials } from "./lineChannels.ts";

export async function resolveLineToken(admin: any): Promise<string | undefined> {
  const env = envCredentials("default").token || undefined;
  if (env) return env;
  try {
    const { data } = await admin
      .from("line_credentials")
      .select("channel_access_token")
      .eq("id", "default")
      .maybeSingle();
    const dbToken = (data?.channel_access_token as string | null) || null;
    if (dbToken && dbToken.length > 40) return dbToken;
  } catch (e) {
    console.warn("resolveLineToken failed, using env", e);
  }
  return env;
}

/**
 * Token of ONE specific store. A reply must always go out on the channel the
 * customer wrote to — never with another store's token.
 */
export async function resolveStoreLineToken(
  admin: any,
  storeId: string | null | undefined,
): Promise<string | undefined> {
  const id = (storeId || "default").trim() || "default";
  const env = envCredentials(id).token;
  if (env) return env;
  try {
    const { data } = await admin
      .from("line_credentials")
      .select("channel_access_token")
      .eq("id", id)
      .maybeSingle();
    const token = (data?.channel_access_token as string | null) || null;
    if (token && token.length > 40) return token;
  } catch (e) {
    console.warn("resolveStoreLineToken failed", e);
  }
  return undefined;
}
