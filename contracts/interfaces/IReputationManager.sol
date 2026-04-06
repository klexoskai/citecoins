// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationManager {
    function effectiveRep(address voter) external view returns (uint256);
    function updateRep(address voter, bool won) external;
}
