import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import * as OTPAuth from "otpauth";

const PENDING_TTL = "10m";
const BACKUP_COUNT = 10;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set (min 16 chars)");
  }
  return secret;
}

function encKey(): Buffer {
  return scryptSync(authSecret(), "freshmint-totp-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("invalid_secret_blob");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encKey(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}

export function generateTotpSecret(accountName: string): {
  secretBase32: string;
  otpauthUrl: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: process.env.NEXT_PUBLIC_APP_NAME ?? "FreshMint",
    label: accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secretBase32: secret.base32,
    otpauthUrl: totp.toString(),
  };
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: process.env.NEXT_PUBLIC_APP_NAME ?? "FreshMint",
    label: "verify",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  const delta = totp.validate({ token: trimmed, window: 1 });
  return delta !== null;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_COUNT; i++) {
    codes.push(randomBytes(5).toString("hex"));
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code.toLowerCase(), salt, 32);
  return `${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export function verifyBackupCode(
  code: string,
  storedHashesJson: string | null | undefined,
): { ok: boolean; remainingHashesJson?: string } {
  if (!storedHashesJson) return { ok: false };
  let hashes: string[];
  try {
    hashes = JSON.parse(storedHashesJson) as string[];
  } catch {
    return { ok: false };
  }
  const normalized = code.trim().toLowerCase().replace(/\s+/g, "");
  const next: string[] = [];
  let matched = false;
  for (const entry of hashes) {
    const [saltB64, hashB64] = entry.split(".");
    if (!saltB64 || !hashB64) {
      next.push(entry);
      continue;
    }
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const actual = scryptSync(normalized, salt, expected.length);
    if (!matched && actual.length === expected.length && timingSafeEqual(actual, expected)) {
      matched = true;
      continue; // consume
    }
    next.push(entry);
  }
  if (!matched) return { ok: false };
  return { ok: true, remainingHashesJson: JSON.stringify(next) };
}

function pendingKey() {
  return new TextEncoder().encode(authSecret());
}

export async function createPending2faToken(userId: string): Promise<string> {
  return new SignJWT({
    uid: userId,
    purpose: "2fa_login",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(PENDING_TTL)
    .setIssuedAt()
    .sign(pendingKey());
}

export async function readPending2faToken(
  token: string,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, pendingKey());
    if (payload.purpose !== "2fa_login") return null;
    const userId = String(payload.uid ?? "");
    if (!userId) return null;
    return { userId };
  } catch {
    return null;
  }
}

/** In-memory TOTP state for demo/memory mode users. */
type MemoryTotp = {
  totpEnabled: boolean;
  totpSecretEnc: string | null;
  backupCodesHash: string | null;
  pendingSecretEnc?: string | null;
};

const g = globalThis as unknown as {
  __freshmintTotp?: Map<string, MemoryTotp>;
};

export function memoryTotpStore(): Map<string, MemoryTotp> {
  if (!g.__freshmintTotp) g.__freshmintTotp = new Map();
  return g.__freshmintTotp;
}

export function getMemoryTotp(userId: string): MemoryTotp {
  const store = memoryTotpStore();
  const existing = store.get(userId);
  if (existing) return existing;
  const fresh: MemoryTotp = {
    totpEnabled: false,
    totpSecretEnc: null,
    backupCodesHash: null,
  };
  store.set(userId, fresh);
  return fresh;
}

export function fingerprintSecret(enc: string): string {
  return createHash("sha256").update(enc).digest("hex").slice(0, 12);
}
