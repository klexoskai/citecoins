// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IBucketManager.sol";

contract EpochManager {

    // ── Enums ─────────────────────────────────────────────────────────────────
    enum Phase {
        NotStarted, // before submissionStart
        Submission, // writers can submit articles
        Staking,    // readers can commit + reveal votes
        Ended       // stakingEnd passed — ready to finalize
    }

    // ── Events ────────────────────────────────────────────────────────────────
    event EpochCreated(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd
    );

    // ── Storage ───────────────────────────────────────────────────────────────
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

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address bucketManagerAddress) {
        bucketManager = IBucketManager(bucketManagerAddress);
        deployer      = msg.sender;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    // ── Wiring ────────────────────────────────────────────────────────────────
    /// @notice Called once by CitecoinsProtocol to authorise Rewards contract.
    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    // ── Core: create epoch ────────────────────────────────────────────────────
    /// @notice Create a time window for submissions and voting on a bucket.
    /// @dev MVP: permissionless — any address can create an epoch for an active bucket.
    ///      Production: restrict to bucket creator only.
    /// @param bucketId        Bucket this epoch belongs to.
    /// @param submissionStart Unix timestamp — writers can submit after this.
    /// @param submissionEnd   Unix timestamp — submissions close at this point.
    /// @param stakingStart    Unix timestamp — readers can vote after this.
    /// @param stakingEnd      Unix timestamp — voting closes, epoch ready to finalize.
    function createEpoch(
        uint256 bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd
    ) external returns (uint256 epochId) {
        // Verify bucket exists and is active
        (,,, bool active) = bucketManager.getBucket(bucketId);
        require(active, "bucket inactive");

        // Time window validation
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

        emit EpochCreated(
            epochId, bucketId,
            submissionStart, submissionEnd,
            stakingStart,    stakingEnd
        );
    }

    // ── Phase query ───────────────────────────────────────────────────────────
    /// @notice Single source of truth for epoch phase.
    ///         ArticleRegistry, Staking, and Rewards all call this to gate actions.
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

    // ── Finalization flag ─────────────────────────────────────────────────────
    /// @notice Mark epoch as finalized — called by Rewards as last step.
    ///         Prevents double-finalization of the same epoch.
    function markFinalized(uint256 epochId) external onlyRewards {
        require(epochId > 0 && epochId < nextEpochId, "epoch not found");
        EpochConfig storage e = _epochs[epochId];
        require(!e.finalized, "already finalized");
        e.finalized = true;
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    /// @notice Returns epoch fields individually — avoids cross-contract struct errors.
    /// @dev Rewards.sol and ArticleRegistry.sol destructure this return.
    function getEpoch(uint256 epochId) external view returns (
        uint256 bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd,
        bool    finalized
    ) {
        EpochConfig storage e = _epochs[epochId];
        return (
            e.bucketId,
            e.submissionStart,
            e.submissionEnd,
            e.stakingStart,
            e.stakingEnd,
            e.finalized
        );
    }
}