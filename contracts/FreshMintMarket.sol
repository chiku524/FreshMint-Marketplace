// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-721 style marketplace skeleton for Sepolia integration.
/// Deploy with Foundry/Hardhat; FreshMint currently simulates settlement until
/// NEXT_PUBLIC_EVM_MARKET_ADDRESS points at a live deployment.
contract FreshMintMarket {
    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event Purchased(address indexed buyer, uint256 indexed tokenId, uint256 price);

    address public owner;
    uint256 public nextId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => uint256) public priceOf;

    constructor() {
        owner = msg.sender;
    }

    function mint(address to, string calldata uri, uint256 priceWei) external returns (uint256 tokenId) {
        tokenId = nextId++;
        ownerOf[tokenId] = to;
        tokenURI[tokenId] = uri;
        priceOf[tokenId] = priceWei;
        emit Minted(to, tokenId, uri);
    }

    function buy(uint256 tokenId) external payable {
        address seller = ownerOf[tokenId];
        require(seller != address(0), "missing");
        require(msg.value >= priceOf[tokenId], "price");
        ownerOf[tokenId] = msg.sender;
        priceOf[tokenId] = 0;
        (bool ok, ) = seller.call{value: msg.value}("");
        require(ok, "pay");
        emit Purchased(msg.sender, tokenId, msg.value);
    }
}
