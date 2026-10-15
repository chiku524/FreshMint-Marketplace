import { describe, expect, it } from "vitest";
import { buildEntitySitemapEntries } from "../sitemap-entries";

const listing = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  stage: "rising",
  delisted: false,
  createdAt: 1_700_000_000_000,
  ...over,
});

describe("buildEntitySitemapEntries", () => {
  it("includes collections (slug-aware), creators and public listings only", () => {
    const out = buildEntitySitemapEntries("https://fm.test/", {
      collections: [{ id: "c1", slug: "cool-cats" }, { id: "c2" }],
      creators: [{ id: "u1" }],
      listings: [listing("l1"), listing("draft", { stage: "draft" }), listing("gone", { delisted: true })],
    });
    const urls = out.map((e) => e.url);
    expect(urls).toEqual([
      "https://fm.test/collections/cool-cats",
      "https://fm.test/collections/c2",
      "https://fm.test/creators/u1",
      "https://fm.test/listings/l1",
    ]);
  });

  it("caps the number of entries", () => {
    const out = buildEntitySitemapEntries(
      "https://fm.test",
      { collections: [], creators: [{ id: "a" }, { id: "b" }, { id: "c" }], listings: [] },
      2,
    );
    expect(out).toHaveLength(2);
  });
});
