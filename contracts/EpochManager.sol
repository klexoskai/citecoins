// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BucketManager.sol";

contract EpochManager {
    event EpochCreated(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint64 submissionStart,
        uint64 submissionEnd,
        uint64 stakingStart,
        uint64 stakingEnd
    );

    struct EpochConfig {
        uint256 bucketId;
        uint64 submissionStart;
        uint64 submissionEnd;
        uint64 stakingStart;
        uint64 stakingEnd;
    }

    BucketManager public immutable bucketManager;
    uint256 public nextEpochId = 1;

    mapping(uint256 => EpochConfig) public epochs;

    constructor(address bucketManagerAddress) {
        bucketManager = BucketManager(bucketManagerAddress);
    }

    function createEpoch(
        uint256 bucketId,
        uint64 submissionStart,
        uint64 submissionEnd,
        uint64 stakingStart,
        uint64 stakingEnd
    ) external returns (uint256 epochId) {
        // v1: permissionless epoch creation, but you could restrict to bucket creator/owner later.
        BucketManager.Bucket memory b = bucketManager.buckets(bucketId);
        require(b.active, "bucket inactive");

        require(submissionStart <= submissionEnd, "submission window");
        require(stakingStart <= stakingEnd, "staking window");
        require(submissionEnd <= stakingEnd, "end ordering"); // flexible but sane

        epochId = nextEpochId++;
        epochs[epochId] = EpochConfig({
            bucketId: bucketId,
            submissionStart: submissionStart,
            submissionEnd: submissionEnd,
            stakingStart: stakingStart,
            stakingEnd: stakingEnd
        });

        emit EpochCreated(epochId, bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd);
    }
}