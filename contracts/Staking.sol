// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";
import "./libraries/MathUtils.sol";
import "./EpochManager.sol";
import "./ArticleRegistry.sol";

contract Staking {
    using MathUtils for uint256;

    event Staked(uint256 indexed epochId, uint256 indexed articleId, address indexed staker, uint256 amount, uint64 timestamp);

    struct StakeTranche {
        uint256 amount;
        uint64 timestamp;
    }

    ICitecoinToken public immutable token;
    EpochManager public immutable epochManager;
    ArticleRegistry public immutable articleRegistry;

    // totals by epoch+article
    mapping(uint256 => mapping(uint256 => uint256)) public rawStakeByArticle; // epochId => articleId => raw
    mapping(uint256 => mapping(uint256 => uint256)) public effStakeByArticle; // epochId => articleId => sum sqrt(raw tranche)
    mapping(uint256 => uint256) public totalRawStakeByEpoch; // epochId => raw total

    // per-user stake
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public rawStakeOf; // epochId => articleId => staker => raw total
    mapping(uint256 => mapping(uint256 => mapping(address => StakeTranche[]))) internal tranches; // epochId => articleId => staker => tranches

    constructor(address tokenAddress, address epochManagerAddress, address articleRegistryAddress) {
        token = ICitecoinToken(tokenAddress);
        epochManager = EpochManager(epochManagerAddress);
        articleRegistry = ArticleRegistry(articleRegistryAddress);
    }

    function stake(uint256 epochId, uint256 articleId, uint256 amount) external {
        require(amount > 0, "amount");
        EpochManager.EpochConfig memory e = epochManager.epochs(epochId);
        require(e.bucketId != 0, "epoch missing");

        uint64 ts = uint64(block.timestamp);
        require(ts >= e.stakingStart && ts <= e.stakingEnd, "not in staking");

        ArticleRegistry.Article memory a = articleRegistry.articles(articleId);
        require(a.epochId == epochId, "article epoch mismatch");
        require(a.eligible, "article ineligible");

        require(token.transferFrom(msg.sender, address(this), amount), "stake transfer");

        rawStakeByArticle[epochId][articleId] += amount;
        effStakeByArticle[epochId][articleId] += MathUtils.isqrt(amount);
        totalRawStakeByEpoch[epochId] += amount;

        rawStakeOf[epochId][articleId][msg.sender] += amount;
        tranches[epochId][articleId][msg.sender].push(StakeTranche({amount: amount, timestamp: ts}));

        emit Staked(epochId, articleId, msg.sender, amount, ts);
    }

    function trancheCount(uint256 epochId, uint256 articleId, address staker) external view returns (uint256) {
        return tranches[epochId][articleId][staker].length;
    }

    function getTranche(uint256 epochId, uint256 articleId, address staker, uint256 idx)
        external
        view
        returns (uint256 amount, uint64 timestamp)
    {
        StakeTranche memory t = tranches[epochId][articleId][staker][idx];
        return (t.amount, t.timestamp);
    }

    /// @dev internal read for Rewards contract via external calls is fine for demo; can be optimized later.
    function _tranches(uint256 epochId, uint256 articleId, address staker) external view returns (StakeTranche[] memory) {
        return tranches[epochId][articleId][staker];
    }
}