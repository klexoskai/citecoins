// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBucketManager {
    function getBucket(uint256 bucketId) external view returns (
        address creator,
        string  memory topicURI,
        uint256 fundedRewards,
        uint256 creatorStake,
        bool    active
    );
    function FEE_BPS() external view returns (uint16);
    function fundBucket(uint256 bucketId, uint256 amount) external;
    function withdrawBucketFunds(uint256 bucketId, address to, uint256 amount) external;
    function deactivateBucket(uint256 bucketId) external;
    function slashBucketStake(uint256 bucketId) external returns (uint256 slashed);
}