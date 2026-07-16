import crypto from "crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // recommended IV length for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // fixed GCM auth tag length

function getKeyBuffer() {
  return Buffer.from(env.credentialsEncryptionKey, "base64");
}

/**
 * Encrypts a plaintext credential value with AES-256-GCM (.context/final-plan.md
 * §6.3/§11.8): a fresh random IV per call, never reused across records. The
 * GCM auth tag is appended to the ciphertext rather than stored in its own
 * field — `Credential`'s documented shape only has `passwordEncrypted` and
 * `passwordIv` (§6.3), so this keeps the schema exactly as specified instead
 * of adding an undocumented third field.
 */
export function encryptCredential(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKeyBuffer(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    passwordEncrypted: Buffer.concat([ciphertext, authTag]).toString("base64"),
    passwordIv: iv.toString("base64"),
  };
}

/**
 * Decrypts a previously-encrypted credential value. Only ever called from the
 * explicit "reveal" action in customer.service.js — never during list/detail
 * fetches, per §7.2's "the reveal endpoint is the only place plaintext ever
 * leaves the service layer."
 */
export function decryptCredential({ passwordEncrypted, passwordIv }) {
  const combined = Buffer.from(passwordEncrypted, "base64");
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH_BYTES);
  const ciphertext = combined.subarray(0, combined.length - AUTH_TAG_LENGTH_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKeyBuffer(), Buffer.from(passwordIv, "base64"));
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString("utf8");
}
