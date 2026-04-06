// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HashHelper {
    function getCommitHash(
        uint256 topicId,
        uint256 articleId,
        uint256 amount,
        bytes32 salt,
        address voter
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(topicId, articleId, amount, salt, voter));
    }
}