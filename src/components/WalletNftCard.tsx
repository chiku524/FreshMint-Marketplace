import type { WalletNft } from "@/lib/wallet/inventory";

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % 360;
  return h;
}

export function WalletNftCard({ nft }: { nft: WalletNft }) {
  const hue = hueFromId(nft.id);
  const href = nft.explorerUrl;
  const media = nft.mediaUrl;

  return (
    <article className="work-tile work-tile--compact" data-tile="compact">
      <a href={href} className="work-tile__media-link" tabIndex={-1} aria-hidden>
        <div
          className="work-media"
          style={
            media
              ? {
                  backgroundImage: `url(${media})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  background: `
            linear-gradient(145deg, hsla(${hue}, 45%, 42%, 0.55), transparent 50%),
            linear-gradient(320deg, hsla(${(hue + 40) % 360}, 35%, 35%, 0.4), var(--bg-deep))
          `,
                }
          }
        />
      </a>
      <div className="work-tile__caption">
        <h3 className="display work-tile__title">
          <a href={href} target="_blank" rel="noreferrer">
            {nft.title}
          </a>
        </h3>
        <p className="work-tile__meta">
          {nft.networkLabel}
          {nft.chain === "evm" ? ` · #${nft.tokenId}` : ""}
        </p>
      </div>
    </article>
  );
}
