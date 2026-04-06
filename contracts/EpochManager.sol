// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IBucketManager.sol";

contract EpochManager {

    enum Phase {
        NotStarted, // before submissionStart, or gap between submissionEnd and stakingStart
        Submission, // writers can publish articles
        Staking,    // readers can commit votes
        Ended       // past stakingEnd, ready to finalize
    }

    event EpochCreated(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd
    );

    struct EpochConfig {
        uint256 bucketId;
        uint64  submissionStart;
        uint64  submissionEnd;
        uint64  stakingStart;
        uint64  stakingEnd;
        bool    finalized;
    }

    IBucketManager public immutable bucketManager;
    address        public immutable deployer;
    address        public rewards;

    uint256 public nextEpochId = 1;
    mapping(uint256 => EpochConfig) internal _epochs;

    constructor(address bucketManagerAddress) {
        bucketManager = IBucketManager(bucketManagerAddress);
        deployer      = msg.sender;
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
        (,,,, bool active) = bucketManager.getBucket(bucketId);
        require(active, "bucket inactive");

        require(submissionStart >= uint64(block.timestamp), "start in past");
        require(submissionStart <  submissionEnd,           "empty submission window");
        require(submissionEnd   <= stakingStart,            "staking must open after submission closes");
        require(stakingStart    <  stakingEnd,              "empty staking window");

        epochId = nextEpochId++;
        _epochs[epochId] = EpochConfig({
            bucketId:        bucketId,
            submissionStart: submissionStart,
            submissionEnd:   submissionEnd,
            stakingStart:    stakingStart,
            stakingEnd:      stakingEnd,
            finalized:       false
        });

        emit EpochCreated(epochId, bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd);
    }

    // Single source of truth for phase — ArticleRegistry, Staking, and Rewards all gate on this.
    function currentPhase(uint256 epochId) external view returns (Phase) {
        require(epochId > 0 && epochId < nextEpochId, "epoch not found");

        EpochConfig storage e = _epochs[epochId];
        uint64 t = uint64(block.timestamp);

        if (t <  e.submissionStart) return Phase.NotStarted;
        if (t <= e.submissionEnd)   return Phase.Submission;
        if (t <  e.stakingStart)    return Phase.NotStarted;
        if (t <= e.stakingEnd)      return Phase.Staking;
        return Phase.Ended;
    }

    function markFinalized(uint256 epochId) external onlyRewards {
        require(epochId > 0 && epochId < nextEpochId, "epoch not found");
        EpochConfig storage e = _epochs[epochId];
        require(!e.finalized, "already finalized");
        e.finalized = true;
    }

    function getEpoch(uint256 epochId) external view returns (
        uint256 bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd,
        bool    finalized
    ) {
        EpochConfig storage e = _epochs[epochId];
        return (e.bucketId, e.submissionStart, e.submissionEnd, e.stakingStart, e.stakingEnd, e.finalized);
    }
}
