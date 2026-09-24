import { readFileSync, writeFileSync } from "fs";

const art = JSON.parse(
  readFileSync("contracts/out/FreshMintERC721.sol/FreshMintERC721.json", "utf8")
);
const bytecode = art.bytecode?.object || art.bytecode;
if (!bytecode || !String(bytecode).startsWith("0x")) {
  throw new Error("no bytecode in forge artifact");
}
const out =
  "/** Compiled FreshMintERC721 creation bytecode (forge). */\n" +
  "export const FRESHMINT_ERC721_BYTECODE = " +
  JSON.stringify(bytecode) +
  " as const;\n";
writeFileSync("src/lib/onchain/evm-artifacts/freshMintErc721Bytecode.ts", out);
console.log("wrote bytecode bytes", (bytecode.length - 2) / 2);
