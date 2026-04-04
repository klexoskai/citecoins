// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStaking {
    function getStakers(uint256 epochId, uint256 articleId) 
        external view returns (address[] memory);
    
    function getCommit(uint256 epochId, address voter) 
        external view returns (
            bytes32 commitHash,
            uint256 rawStake,
            bool    revealed,
            uint256 articleId,
            uint256 effectiveStake
        );
    
    function getTally(uint256 epochId, uint256 articleId) 
        external view returns (uint256 supportWeight);
    
    function releaseStake(uint256 epochId, uint256 articleId, address to) external;
    
    function slashStake(uint256 epochId, uint256 articleId, address voter) 
        external returns (uint256 slashed);
}