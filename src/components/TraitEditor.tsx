"use client";

import type { NftTrait } from "@/lib/discovery/types";

export function TraitEditor({
  traits,
  onChange,
}: {
  traits: NftTrait[];
  onChange: (traits: NftTrait[]) => void;
}) {
  function update(index: number, patch: Partial<NftTrait>) {
    onChange(
      traits.map((trait, i) => (i === index ? { ...trait, ...patch } : trait)),
    );
  }

  return (
    <div className="trait-editor">
      {traits.map((trait, index) => (
        <div key={`${index}-${trait.trait_type}`} className="trait-editor__row">
          <input
            aria-label="Trait type"
            placeholder="Trait (Background)"
            value={trait.trait_type}
            className="fm-field fm-field--compact"
            onChange={(e) => update(index, { trait_type: e.target.value })}
          />
          <input
            aria-label="Trait value"
            placeholder="Value (Gold)"
            value={trait.value}
            className="fm-field fm-field--compact"
            onChange={(e) => update(index, { value: e.target.value })}
          />
          <button
            type="button"
            className="badge"
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() => onChange(traits.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      {traits.length < 24 ? (
        <button
          type="button"
          className="badge"
          style={{ cursor: "pointer", background: "transparent", justifySelf: "start" }}
          onClick={() => onChange([...traits, { trait_type: "", value: "" }])}
        >
          Add trait
        </button>
      ) : null}
    </div>
  );
}
