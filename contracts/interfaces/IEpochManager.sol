// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEpochManager {
    enum Phase {
        NotStarted,
        Submission,
        BetweenPhases,
        Staking,
        Ended
    }

    struct EpochConfig {
        uint256 bucketId;
        uint64  submissionStart;
        uint64  submissionEnd;
        uint64  stakingStart;
        uint64  stakingEnd;
        bool    finalized;
    }

    function currentPhase(uint256 epochId) external view returns (Phase);
    function getEpoch(uint256 epochId) external view returns (EpochConfig memory);
    function markFinalized(uint256 epochId) external;
    function isFinalized(uint256 epochId) external view returns (bool);
}