// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Small helper math functions for v1.
///         NOTE: integer sqrt is used for quadratic influence only.
library MathUtils {
    function isqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        // Babylonian method
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @notice Clamp winners count: nPaid = min(clamp(A,3,10), A)
    function winnersCount(uint256 A) internal pure returns (uint8) {
        if (A == 0) return 0;
        uint256 n = A;
        if (n < 3) n = 3;
        if (n > 10) n = 10;
        if (n > A) n = A;
        return uint8(n);
    }
}