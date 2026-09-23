export const ADMIN_SESSION_COOKIE = "gws_admin";

const SIGNATURE_PAYLOAD = "gws-admin-session";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The cookie value is an HMAC of a fixed payload, keyed by the admin password.
 * It proves the holder knew the password at some point, without storing the
 * password itself in the cookie or needing a server-side session store.
 */
async function computeAdminToken(): Promise<string> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_PASSWORD is not set");

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(SIGNATURE_PAYLOAD));
  return toHex(signature);
}

export async function isCorrectAdminPassword(password: unknown): Promise<boolean> {
  return typeof password === "string" && password.length > 0 && password === process.env.ADMIN_PASSWORD;
}

export async function issueAdminToken(): Promise<string> {
  return computeAdminToken();
}

export async function isValidAdminToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const expected = await computeAdminToken();
  return token === expected;
}
