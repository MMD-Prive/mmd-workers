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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return btoa(bytesToBinary(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecode(value: string): string {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  return new TextDecoder().decode(binaryToBytes(atob(normalized)));
}

function hexToBytes(value: string): Uint8Array | null {
  const normalized = toStr(value).toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) return null;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
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

async function verifyHmacSha256(value: string, signatureHex: string, secret: string): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("HMAC", key, toArrayBuffer(signature), toArrayBuffer(encoder.encode(value)));
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

export async function verifyLinkPayload<T extends Record<string, unknown> = Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T> {
  if (!secret) throw new Error("missing_link_signing_secret");

  const parts = toStr(token).split(".");
  if (parts.length !== 2) throw new Error("invalid_token_format");

  const [body, signature] = parts;
  if (!await verifyHmacSha256(body, signature, secret)) {
    throw new Error("invalid_token_signature");
  }

  const payload = JSON.parse(base64UrlDecode(body)) as T;
  const exp = Number(payload.exp || 0);
  if (exp > 0 && exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("expired_token");
  }

  return payload;
}
