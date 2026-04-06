// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArticleRegistry {
    function publishArticle(
        uint256 epochId,
        string  calldata contentCID,
        bytes32 contentHash,
        string  calldata manifestCID,
        bytes32 manifestHash,
        uint256 writerStake
    ) external returns (uint256 articleId);

    function getArticle(uint256 articleId) external view returns (
        address author,
        uint256 epochId,
        uint256 bucketId,
        string  memory contentCID,
        bytes32 contentHash,
        string  memory manifestCID,
        bytes32 manifestHash,
        uint256 writerStake,
        bool    eligible
    );

    function getEpochArticles(uint256 epochId) external view returns (uint256[] memory);
    function releaseStake(uint256 articleId, address to) external;
    function slashStake(uint256 articleId) external returns (uint256 slashed);
}