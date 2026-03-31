// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CitecoinToken is ERC20 {

    // ── Roles ────────────────────────────────────────────────────────────────
    address public immutable deployer;
    mapping(address => bool) public minters;

    // ── Inflation ─────────────────────────────────────────────────────────────
    uint256 public constant ANNUAL_RATE_BPS = 250;   // 2.5% per year
    uint256 public constant YEAR            = 365 days;
    uint256 public lastInflationMint;                // timestamp of last inflation mint

    // ── Events ────────────────────────────────────────────────────────────────
    event MinterGranted(address indexed account);
    event MinterRevoked(address indexed account);
    event InflationMinted(address indexed treasury, uint256 amount, uint256 newSupply);
    event TokensBurned(address indexed from, uint256 amount);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(uint256 initialSupply) ERC20("Citecoin", "CITE") {
        deployer = msg.sender;
        lastInflationMint = block.timestamp;
        _mint(msg.sender, initialSupply);
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyDeployer() {
        require(msg.sender == deployer, "not deployer");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    // ── Role management ───────────────────────────────────────────────────────
    function grantMinter(address account) external onlyDeployer {
        minters[account] = true;
        emit MinterGranted(account);
    }

    function revokeMinter(address account) external onlyDeployer {
        minters[account] = false;
        emit MinterRevoked(account);
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /// @notice Mint tokens for reward payouts. Only callable by authorised
    ///         contracts (Rewards.sol). Used when reward pool is topped up
    ///         via inflation rather than funded stake.
    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "zero address");
        _mint(to, amount);
    }

    /// @notice Annual inflation mint — callable by anyone once per year.
    ///         Mints 2.5% of current supply to treasury.
    ///         Permissionless so no single party controls when it fires.
    function mintAnnualInflation(address treasury) external {
        require(treasury != address(0), "zero address");
        require(
            block.timestamp >= lastInflationMint + YEAR,
            "too early: 1 year cooldown"
        );

        lastInflationMint = block.timestamp;

        uint256 amount = (totalSupply() * ANNUAL_RATE_BPS) / 10_000;
        _mint(treasury, amount);

        emit InflationMinted(treasury, amount, totalSupply());
    }

    // ── Burning ───────────────────────────────────────────────────────────────

    /// @notice Burn tokens from an address — called by Rewards.sol during
    ///         slash execution. Requires prior approval OR onlyMinter.
    ///         Using onlyMinter here so Rewards can slash without needing
    ///         the slashed user to have pre-approved the burn.
    function burn(address from, uint256 amount) external onlyMinter {
        require(from != address(0), "zero address");
        require(amount > 0, "zero amount");
        _burn(from, amount);
        emit TokensBurned(from, amount);
    }

    /// @notice Self-burn — any holder can burn their own tokens.
    function burnSelf(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
}