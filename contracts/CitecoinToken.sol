// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CitecoinToken is ERC20 {

    // ── Roles ─────────────────────────────────────────────────────────────────
    address public immutable deployer;
    mapping(address => bool) public minters;

    // ── Events ────────────────────────────────────────────────────────────────
    event MinterGranted(address indexed account);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address initialHolder, uint256 initialSupply) ERC20("Citecoin", "CITE") {
        deployer = msg.sender;
        _mint(initialHolder, initialSupply);
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
    /// @notice Grant minter role to an address.
    ///         Called once by CitecoinsProtocol to authorise Rewards.sol.
    function grantMinter(address account) external onlyDeployer {
        minters[account] = true;
        emit MinterGranted(account);
    }

    // ── Minting ───────────────────────────────────────────────────────────────
    /// @notice Mint tokens for reward payouts.
    ///         Only callable by Rewards.sol via minter role.
    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "zero address");
        _mint(to, amount);
    }

}