import type { Env } from "../types";

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function bytesToBinary(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += String.fromCharCode(byte);
  return output;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export function linkSigningSecret(env: Env): string {
  return toStr(env.LINK_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
}

export async function signLinkPayload(
  env: Env,
  payload: Record<string, unknown>,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const secret = linkSigningSecret(env);
  if (!secret) throw new Error("missing_link_signing_secret");

  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + Math.max(60, expiresInSeconds),
  }));
  const signature = await hmacSha256(body, secret);
  return `${body}.${signature}`;
}
