import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM at rest for Slack bot tokens (qa-agent-spec.md REQ-127).
// Supabase Vault (pgsodium) would be the alternative, but this project has
// no linked Supabase CLI / direct Postgres access this session, so
// reliably provisioning a Vault-backed column isn't scriptable here —
// see the note in supabase/migrations/0007_slack_connections.sql.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce size for GCM

function getKey(): Buffer {
  const raw = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SLACK_TOKEN_ENCRYPTION_KEY is not set — required to encrypt/decrypt stored Slack tokens."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SLACK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key)."
    );
  }
  return key;
}

// Stored as "<iv>:<authTag>:<ciphertext>", each base64 — a single text
// column value, no separate columns needed for the nonce/tag.
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

export function decryptToken(stored: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token — expected '<iv>:<authTag>:<ciphertext>'.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
