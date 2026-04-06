// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title CiteToken
/// @notice ERC20 token used by CiteChain for staking, rewards, and topic funding.
contract CiteToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Citecoin", "CITE") {
        _mint(msg.sender, initialSupply);
    }
}