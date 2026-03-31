// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IBucketManager.sol";

contract EpochManager {
    enum Phase {
        NotStarted,     // before submissionStart
        Submission,     // writers can submit articles
        BetweenPhases,  // submission closed, staking not yet open
        Staking,        // readers can commit + reveal votes
        Ended           // stakingEnd passed — ready to finalize
    }

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
        uint64  submissionStart;
        uint64  submissionEnd;
        uint64  stakingStart;
        uint64  stakingEnd;
        bool    finalized;       // set by Rewards.sol after payout completes
    }

    IBucketManager public immutable bucketManager;
    address public rewards;                          // set by CitecoinsProtocol
    address public immutable deployer;

    uint256 public nextEpochId = 1;
    mapping(uint256 => EpochConfig) public epochs;

    constructor(address bucketManagerAddress) {
        bucketManager = IBucketManager(bucketManagerAddress);
        deployer = msg.sender;
    }

    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    function createEpoch(
        uint256 bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd
    ) external returns (uint256 epochId) {
        (address creator,,,,,,,bool active) = bucketManager.getBucket(bucketId);
        require(active,              "bucket inactive");
        require(msg.sender == creator, "only bucket creator");

        // submissionStart must be in the future
        require(submissionStart >= uint64(block.timestamp), "start in past");

        // Submission window must be valid
        require(submissionStart < submissionEnd, "empty submission window");
        require(submissionEnd <= stakingStart, "staking must open after submission closes");

        // Staking window must be valid
        require(stakingStart < stakingEnd, "empty staking window");

        epochId = nextEpochId++;
        epochs[epochId] = EpochConfig({
            bucketId:        bucketId,
            submissionStart: submissionStart,
            submissionEnd:   submissionEnd,
            stakingStart:    stakingStart,
            stakingEnd:      stakingEnd,
            finalized:       false
        });

        emit EpochCreated(
            epochId, bucketId,
            submissionStart, submissionEnd,
            stakingStart, stakingEnd
        );
    }

    function currentPhase(uint256 epochId) external view returns (Phase) {
        EpochConfig storage e = epochs[epochId];

        // epochId 0 is invalid — nextEpochId starts at 1
        require(epochId > 0 && epochId < nextEpochId, "epoch not found");

        uint64 t = uint64(block.timestamp);

        if (t < e.submissionStart) return Phase.NotStarted;
        if (t <= e.submissionEnd)  return Phase.Submission;
        if (t < e.stakingStart)    return Phase.BetweenPhases;
        if (t <= e.stakingEnd)     return Phase.Staking;
        return Phase.Ended;
    }

    function markFinalized(uint256 epochId) external onlyRewards {
        EpochConfig storage e = epochs[epochId];
        require(epochId > 0 && epochId < nextEpochId, "epoch not found");
        require(!e.finalized, "already finalized");
        e.finalized = true;
    }

    function getEpoch(uint256 epochId) external view returns (EpochConfig memory) {
        return epochs[epochId];
    }

    function isFinalized(uint256 epochId) external view returns (bool) {
        return epochs[epochId].finalized;
    }
}