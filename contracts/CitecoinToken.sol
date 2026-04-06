// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CitecoinToken is ERC20 {

    address public immutable deployer;
    mapping(address => bool) public minters;

    event MinterGranted(address indexed account);

    constructor(address initialHolder, uint256 initialSupply) ERC20("Citecoin", "CITE") {
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
}
