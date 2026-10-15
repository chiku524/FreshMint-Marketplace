import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MINT_LEAF_ANGLE,
  MINT_LEAF_UP,
  MINT_STEM,
} from "@/lib/brand/mint-mark";
import { mintMarkSvg } from "@/lib/brand/mint-mark-svg";
import {
  applyTitleTemplate,
  brandLogoUrl,
  listingPageMetadata,
  organizationJsonLd,
  TITLE_TEMPLATE,
  websiteJsonLd,
} from "@/lib/seo/site";

const OLD_SCALLOP = "M33.2 30C38 24 44 18 50 13";

describe("SEO title template", () => {
  it("suffixes child titles without doubling the brand", () => {
    expect(TITLE_TEMPLATE).toBe("%s — FreshMint Marketplace");
    expect(applyTitleTemplate("Creators")).toBe("Creators — FreshMint Marketplace");
    expect(applyTitleTemplate("Search: Moon ink")).toBe(
      "Search: Moon ink — FreshMint Marketplace",
    );
    expect(applyTitleTemplate("Creators")).not.toContain(
      "Creators — FreshMint Marketplace — FreshMint",
    );
  });
});

describe("brand logo URLs and JSON-LD", () => {
  it("points Organization and WebSite logo at the mint-sprig SVG", () => {
    const base = "https://freshmint.example";
    const logo = brandLogoUrl(base);
    expect(logo).toBe("https://freshmint.example/freshmint-icon.svg");
    expect(organizationJsonLd(base).logo).toBe(logo);
    expect(websiteJsonLd(base).publisher.logo.url).toBe(logo);
  });
});

describe("listing SEO privacy", () => {
  it("noindexes drafts and delisted works without a public surface", () => {
    const draft = listingPageMetadata({
      title: "Secret",
      description: "n",
      stage: "draft",
      delisted: false,
      mediaUrl: "/uploads/x.png",
    });
    expect(draft.robots).toMatchObject({ index: false });
    expect(draft.openGraph).toBeUndefined();

    const hidden = listingPageMetadata({
      title: "Gone",
      stage: "soft_launch",
      delisted: true,
      mediaUrl: null,
    });
    expect(hidden.robots).toMatchObject({ index: false });
  });

  it("indexes public listings and uses artwork as OG when present", () => {
    const meta = listingPageMetadata({
      title: "Cyan Orbit",
      description: "A plate.",
      stage: "soft_launch",
      delisted: false,
      mediaUrl: "/uploads/cyan.png",
    });
    expect(meta.title).toBe("Cyan Orbit");
    expect(meta.robots).toMatchObject({ index: true });
    expect(meta.openGraph?.images).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("/uploads/cyan.png") })]),
    );
  });
});

describe("mint-mark SVG", () => {
  it("uses ovate rotated blades, not the old scalloped pair", () => {
    const svg = mintMarkSvg();
    expect(svg).toContain(MINT_LEAF_UP);
    expect(svg).toContain(MINT_STEM);
    expect(svg).toContain(`rotate(${MINT_LEAF_ANGLE})`);
    expect(svg).toContain(`rotate(${-MINT_LEAF_ANGLE})`);
    expect(svg).not.toContain(OLD_SCALLOP);
    expect(svg).not.toContain("M33.2 30C28.5 24");
  });

  it("keeps app and public icons on the new geometry", () => {
    const appIcon = readFileSync(join(process.cwd(), "src/app/icon.svg"), "utf8");
    const publicIcon = readFileSync(
      join(process.cwd(), "public/freshmint-icon.svg"),
      "utf8",
    );
    for (const svg of [appIcon, publicIcon]) {
      expect(svg).toContain(MINT_LEAF_UP);
      expect(svg).toContain(`rotate(${MINT_LEAF_ANGLE})`);
      expect(svg).not.toContain(OLD_SCALLOP);
    }
  });
});
