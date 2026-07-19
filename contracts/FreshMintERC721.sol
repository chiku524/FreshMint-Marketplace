// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-721 for FreshMint primary mints across EVM testnets/mainnets.
/// Compatible with OpenZeppelin-style interfaces without requiring forge install in CI.
contract FreshMintERC721 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event Listed(uint256 indexed tokenId, uint256 priceWei);
    event Purchased(address indexed buyer, uint256 indexed tokenId, uint256 price);

    string public name;
    string public symbol;
    address public owner;
    uint256 public nextId = 1;

    mapping(uint256 => address) private _ownerOf;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => uint256) public priceOf;

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
        owner = msg.sender;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f || // ERC721Metadata
            interfaceId == 0x01ffc9a7; // ERC165
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _ownerOf[tokenId];
        require(o != address(0), "missing");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "missing");
        return _tokenURIs[tokenId];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        require(msg.sender == o || _operatorApprovals[o][msg.sender], "auth");
        _tokenApprovals[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "missing");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "auth");
        require(ownerOf(tokenId) == from, "from");
        require(to != address(0), "zero");
        delete _tokenApprovals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    /// @notice Mint a new token to `to` with metadata URI and optional primary price.
    function safeMint(address to, string calldata uri, uint256 priceWei) external returns (uint256 tokenId) {
        require(to != address(0), "zero");
        tokenId = nextId++;
        _ownerOf[tokenId] = to;
        _balances[to] += 1;
        _tokenURIs[tokenId] = uri;
        priceOf[tokenId] = priceWei;
        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, uri);
        if (priceWei > 0) emit Listed(tokenId, priceWei);
    }

    function setPrice(uint256 tokenId, uint256 priceWei) external {
        require(ownerOf(tokenId) == msg.sender, "auth");
        priceOf[tokenId] = priceWei;
        emit Listed(tokenId, priceWei);
    }

    function buy(uint256 tokenId) external payable {
        address seller = ownerOf(tokenId);
        uint256 price = priceOf[tokenId];
        require(price > 0, "not listed");
        require(msg.value >= price, "price");
        priceOf[tokenId] = 0;
        delete _tokenApprovals[tokenId];
        _balances[seller] -= 1;
        _balances[msg.sender] += 1;
        _ownerOf[tokenId] = msg.sender;
        emit Transfer(seller, msg.sender, tokenId);
        (bool ok, ) = seller.call{value: msg.value}("");
        require(ok, "pay");
        emit Purchased(msg.sender, tokenId, msg.value);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address o = ownerOf(tokenId);
        return spender == o || _tokenApprovals[tokenId] == spender || _operatorApprovals[o][spender];
    }
}
