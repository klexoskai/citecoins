// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Time weighting for redistribution share (NOT extra emissions).
/// Uses basis points scaling (1.00x = 10000).
library TimeWeight {
    /// @dev Linear decay from maxBps to minBps across [start,end].
    function weightBps(
        uint64 t,
        uint64 start,
        uint64 end,
        uint256 maxBps,
        uint256 minBps
    ) internal pure returns (uint256) {
        if (end <= start) return minBps;
        if (t <= start) return maxBps;
        if (t >= end) return minBps;

        uint256 remaining = uint256(end - t);
        uint256 duration = uint256(end - start);
        uint256 span = maxBps - minBps;

        // min + span * remaining/duration
        return minBps + (span * remaining) / duration;
    }
}