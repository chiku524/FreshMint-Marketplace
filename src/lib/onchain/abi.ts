export const freshMintErc721Abi = [
  {
    type: "function",
    name: "safeMint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
      { name: "priceWei", type: "uint256" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "tokenURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeesDistributed",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "treasury", type: "address", indexed: true },
      { name: "operatorWallet", type: "address", indexed: true },
      { name: "treasuryFee", type: "uint256", indexed: false },
      { name: "operatorFee", type: "uint256", indexed: false },
      { name: "sellerAmount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "operatorWallet",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setFeeRecipients",
    stateMutability: "nonpayable",
    inputs: [
      { name: "treasury_", type: "address" },
      { name: "operatorWallet_", type: "address" },
    ],
    outputs: [],
  },
] as const;

/** @deprecated alias — prefer freshMintErc721Abi */
export const freshMintMarketAbi = freshMintErc721Abi;
