import { describe, expect, it } from "vitest";
import { isValidAvatarUrl } from "@/lib/auth/account";
import { creatorInitials } from "@/components/CreatorAvatar";

describe("isValidAvatarUrl", () => {
  it("accepts https and /uploads paths", () => {
    expect(isValidAvatarUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isValidAvatarUrl("/uploads/123-abcd.jpg")).toBe(true);
  });

  it("rejects http, relative junk, and oversized values", () => {
    expect(isValidAvatarUrl("http://insecure.example/a.png")).toBe(false);
    expect(isValidAvatarUrl("/uploads/../etc/passwd")).toBe(false);
    expect(isValidAvatarUrl("not-a-url")).toBe(false);
    expect(isValidAvatarUrl("")).toBe(false);
    expect(isValidAvatarUrl(`https://x.com/${"a".repeat(2100)}`)).toBe(false);
  });
});

describe("creatorInitials fallback", () => {
  it("builds initials from display name", () => {
    expect(creatorInitials("Ada Lovelace")).toBe("AL");
    expect(creatorInitials("Beyonce")).toBe("BE");
    expect(creatorInitials("   ")).toBe("?");
  });
});
