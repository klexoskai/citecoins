// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEpochManager {
    enum Phase {
        NotStarted,
        Submission,
        Staking,
        Ended
    }

    function currentPhase(uint256 epochId) external view returns (Phase);
    function getEpoch(uint256 epochId) external view returns (
        uint256 bucketId,
        uint64  submissionStart,
        uint64  submissionEnd,
        uint64  stakingStart,
        uint64  stakingEnd,
        bool    finalized
    );
    function markFinalized(uint256 epochId) external;
}