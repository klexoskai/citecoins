// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TimeHelper {
    function now_()            external view returns (uint64) { return uint64(block.timestamp); }
    function inOneMinute()     external view returns (uint64) { return uint64(block.timestamp + 1 minutes); }
    function inTwoMinutes()    external view returns (uint64) { return uint64(block.timestamp + 2 minutes); }
    function inThreeMinutes()  external view returns (uint64) { return uint64(block.timestamp + 3 minutes); }
    function inFourMinutes()   external view returns (uint64) { return uint64(block.timestamp + 4 minutes); }
}
