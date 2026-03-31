// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArticleRegistry {
    function publishArticle(
        uint256 epochId,
        string  calldata contentCID,
        string  calldata manifestCID,
        bytes32 contentHash,
        bytes32 manifestHash,
        uint256 writerStake
    ) external returns (uint256 articleId);

    function getArticle(uint256 articleId) external view returns (
        address author,
        uint256 epochId,
        uint256 bucketId,
        string  memory contentCID,
        string  memory manifestCID,
        bytes32 contentHash,
        bytes32 manifestHash,
        uint64  publishedAt,
        uint256 writerStake,
        bool    eligible
    );

    function getEpochArticles(uint256 epochId) external view returns (uint256[] memory);
    function eligibleArticleCount(uint256 epochId) external view returns (uint256);
    function releaseStake(uint256 articleId, address to) external;
    function slashStake(uint256 articleId) external returns (uint256 slashed);
    function setEligibility(uint256 articleId, bool eligible) external;
}