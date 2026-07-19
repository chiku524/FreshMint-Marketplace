import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import {
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  verifyBackupCode,
  verifyTotpCode,
} from "@/lib/auth/totp";

describe("totp helpers", () => {
  it("encrypts and decrypts secrets", () => {
    process.env.AUTH_SECRET = "test-auth-secret-32chars-minimum!!";
    const enc = encryptSecret("BASE32SECRETTEST");
    expect(enc).toContain(".");
    expect(decryptSecret(enc)).toBe("BASE32SECRETTEST");
  });

  it("verifies a live TOTP code", () => {
    process.env.AUTH_SECRET = "test-auth-secret-32chars-minimum!!";
    const { secretBase32 } = generateTotpSecret("tester");
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secretBase32),
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    });
    const code = totp.generate();
    expect(verifyTotpCode(secretBase32, code)).toBe(true);
    expect(verifyTotpCode(secretBase32, "000000")).toBe(false);
  });

  it("consumes backup codes once", () => {
    process.env.AUTH_SECRET = "test-auth-secret-32chars-minimum!!";
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    const hashed = JSON.stringify(codes.map(hashBackupCode));
    const first = verifyBackupCode(codes[0]!, hashed);
    expect(first.ok).toBe(true);
    const second = verifyBackupCode(codes[0]!, first.remainingHashesJson);
    expect(second.ok).toBe(false);
  });
});
