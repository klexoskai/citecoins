// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBucketManager {
    function getBucket(uint256 bucketId) external view returns (
        address creator,
        string  memory topicURI,
        uint256 creationStake,
        uint16  feeBps,
        uint32  minArticles,
        uint256 minTotalStake,
        uint256 fundedRewards,
        bool    active
    );
    function fundBucket(uint256 bucketId, uint256 amount) external;
    function withdrawBucketFunds(uint256 bucketId, address to, uint256 amount) external;
    function deactivateBucket(uint256 bucketId, uint256 actualArticles, uint256 actualTotalStake) external;
}