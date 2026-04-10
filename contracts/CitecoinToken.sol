// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CitecoinToken is ERC20 {
    address public immutable deployer;
    mapping(address => bool) public minters;
    event MinterGranted(address indexed account);

    constructor(
        address initialHolder,
        uint256 initialSupply
    ) ERC20("Citecoin", "CITE") {
        deployer = msg.sender;
        _mint(initialHolder, initialSupply);
    }

    modifier onlyDeployer() {
        require(msg.sender == deployer, "not deployer");
        _;
    }

    modifier onlyMinter() {
        require(minters[msg.sender], "not minter");
        _;
    }

    function grantMinter(address account) external onlyDeployer {
        minters[account] = true;
        emit MinterGranted(account);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "zero address");
        _mint(to, amount);
    }

    // ── CITE-denominated helpers (for demo UI — input in whole tokens) ──

    /// @notice Transfer tokens using whole CITE units instead of wei.
    function transferCITE(address to, uint256 amount_CITE) external returns (bool) {
        return transfer(to, amount_CITE * 1e18);
    }

    /// @notice Approve spender using whole CITE units instead of wei.
    function approveCITE(address spender, uint256 amount_CITE) external returns (bool) {
        return approve(spender, amount_CITE * 1e18);
    }

    // ── Balance helpers ──

    /// @notice Returns balance in whole CITE units instead of wei.
    function balanceOfCITE(address account) external view returns (uint256) {
        return balanceOf(account) / 1e18;
    }

    /// @notice Returns balances of all 4 writers and 4 readers in whole CITE units.
    function balanceOfAll(
        address writer1,
        address writer2,
        address writer3,
        address writer4,
        address reader1,
        address reader2,
        address reader3,
        address reader4
    )
        external
        view
        returns (
            uint256 writer1_CITE,
            uint256 writer2_CITE,
            uint256 writer3_CITE,
            uint256 writer4_CITE,
            uint256 ________________,
            uint256 reader1_CITE,
            uint256 reader2_CITE,
            uint256 reader3_CITE,
            uint256 reader4_CITE
        )
    {
        writer1_CITE = balanceOf(writer1) / 1e18;
        writer2_CITE = balanceOf(writer2) / 1e18;
        writer3_CITE = balanceOf(writer3) / 1e18;
        writer4_CITE = balanceOf(writer4) / 1e18;
        ________________ = 0;
        reader1_CITE = balanceOf(reader1) / 1e18;
        reader2_CITE = balanceOf(reader2) / 1e18;
        reader3_CITE = balanceOf(reader3) / 1e18;
        reader4_CITE = balanceOf(reader4) / 1e18;
    }
}