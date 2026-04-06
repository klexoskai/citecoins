// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IProtocolTreasurySET {
    function payout(address to, uint256 amount) external;
}

interface ITopicManagerSET {
    function phase(uint256 topicId) external view returns (uint8);
    function markResolved(uint256 topicId) external;
    function getFundingPool(uint256 topicId) external view returns (uint256);
}

interface IArticleRegistrySET {
    function getTopicArticleIds(uint256 topicId) external view returns (uint256[] memory);
    function getArticleWriter(uint256 articleId) external view returns (address);
    function getArticleWriterStake(uint256 articleId) external view returns (uint256);
    function totalWriterStakeByTopic(uint256 topicId) external view returns (uint256);
}

interface ICommitRevealVotingSET {
    function getArticleVoters(uint256 topicId, uint256 articleId) external view returns (address[] memory);
    function getUserRevealedVote(uint256 topicId, address user)
        external
        view
        returns (
            uint256 articleId,
            uint256 amount,
            uint256 commitTimestamp,
            bool exists
        );
    function totalRevealedStakeByArticle(uint256 topicId, uint256 articleId) external view returns (uint256);
    function totalCommittedStakeByTopic(uint256 topicId) external view returns (uint256);
    function totalRevealedStakeByTopic(uint256 topicId) external view returns (uint256);
}

contract SettlementDemo is Ownable {
    uint256 public constant BASE_REPUTATION = 1e18;

    struct Resolution {
        bool resolved;
        uint256 winnerArticleId;
        uint256 winnerReaderPool;
        uint256 losingReaderPool;
        uint256[3] topArticleIds;
        uint256[3] topScores;
    }

    struct WriterRewardInputs {
        address[] writers;
        uint256[] stakes;
        uint256 rewardedStakeSum;
    }

    struct WriterRewardState {
        uint256 fundingPool;
        uint256 losingWriterPool;
        uint256 totalWeight;
        uint256 fundingDistributed;
        uint256 losingDistributed;
    }

    IProtocolTreasurySET public immutable treasury;
    ITopicManagerSET public immutable topicManager;
    IArticleRegistrySET public immutable articleRegistry;
    ICommitRevealVotingSET public immutable voting;

    // stored reputation is BONUS above base
    // 0 means effective rep = 1
    // 1e18 means effective rep = 2
    mapping(address => uint256) public reputation;
    mapping(uint256 => Resolution) public resolutions;
    mapping(uint256 => mapping(address => bool)) public readerClaimed;

    error WrongPhase();
    error AlreadyResolved();
    error NothingToClaim();
    error NoArticles();

    event TopicResolved(
        uint256 indexed topicId,
        uint256 winnerArticleId,
        uint256 winnerReaderPool,
        uint256 losingReaderPool
    );

    event WriterRewardPaid(
        uint256 indexed topicId,
        uint256 indexed articleId,
        address indexed writer,
        uint256 amount
    );

    event ReaderRewardClaimed(
        uint256 indexed topicId,
        uint256 indexed articleId,
        address indexed reader,
        uint256 amount
    );

    event DemoMessage(
        string action,
        address indexed user,
        uint256 indexed topicId,
        uint256 indexed articleId,
        uint256 amount
    );

    event ReputationUpdated(
        address indexed user,
        uint256 oldStoredWhole,
        uint256 newStoredWhole,
        uint256 oldEffectiveWhole,
        uint256 newEffectiveWhole,
        bool increased
    );

    constructor(
        address treasuryAddress,
        address topicManagerAddress,
        address articleRegistryAddress,
        address votingAddress
    ) Ownable(msg.sender) {
        treasury = IProtocolTreasurySET(treasuryAddress);
        topicManager = ITopicManagerSET(topicManagerAddress);
        articleRegistry = IArticleRegistrySET(articleRegistryAddress);
        voting = ICommitRevealVotingSET(votingAddress);
    }

    function resolveTopic(uint256 topicId) external onlyOwner {
        if (topicManager.phase(topicId) != 3) revert WrongPhase();

        Resolution storage r = resolutions[topicId];
        if (r.resolved) revert AlreadyResolved();

        uint256[] memory articleIds = articleRegistry.getTopicArticleIds(topicId);
        if (articleIds.length == 0) revert NoArticles();

        (uint256[] memory rankedArticleIds, uint256[] memory rankedScores) =
            _rankArticles(topicId, articleIds);

        uint256 winnerArticleId = rankedArticleIds[0];
        (uint256 winnerReaderPool, uint256 losingReaderPool) =
            _computeReaderPools(topicId, winnerArticleId);

        r.resolved = true;
        r.winnerArticleId = winnerArticleId;
        r.winnerReaderPool = winnerReaderPool;
        r.losingReaderPool = losingReaderPool;

        _storeTopThree(r, rankedArticleIds, rankedScores);

        _updateReaderReputation(topicId, articleIds, winnerArticleId);
        _payWriterRewards(topicId, rankedArticleIds);

        topicManager.markResolved(topicId);

        emit TopicResolved(topicId, winnerArticleId, winnerReaderPool, losingReaderPool);
        emit DemoMessage("Topic resolved", address(0), topicId, winnerArticleId, winnerReaderPool);
    }

    function computeArticleScore(uint256 topicId, uint256 articleId) public view returns (uint256) {
        address[] memory voters = voting.getArticleVoters(topicId, articleId);
        uint256 score = 0;

        for (uint256 i = 0; i < voters.length; i++) {
            address voter = voters[i];
            (, uint256 amount, , bool exists) = voting.getUserRevealedVote(topicId, voter);

            if (!exists || amount == 0) continue;

            uint256 rep = _effectiveReputation(voter);
            score += _voteContribution(rep, amount);
        }

        return score;
    }

    function claimReaderReward(uint256 topicId) external {
        Resolution storage r = resolutions[topicId];
        if (!r.resolved) revert WrongPhase();
        if (readerClaimed[topicId][msg.sender]) revert NothingToClaim();

        (, uint256 userStake, , bool exists) = voting.getUserRevealedVote(topicId, msg.sender);
        if (!exists) revert NothingToClaim();

        (uint256 articleId, , , ) = voting.getUserRevealedVote(topicId, msg.sender);
        if (articleId != r.winnerArticleId) revert NothingToClaim();

        readerClaimed[topicId][msg.sender] = true;

        uint256 reward = userStake;
        if (r.winnerReaderPool > 0 && r.losingReaderPool > 0) {
            reward += (r.losingReaderPool * userStake) / r.winnerReaderPool;
        }

        treasury.payout(msg.sender, reward);

        emit ReaderRewardClaimed(topicId, r.winnerArticleId, msg.sender, reward);
        emit DemoMessage("Reader received tokens", msg.sender, topicId, r.winnerArticleId, reward);
    }

    function getRankedArticles(uint256 topicId)
        external
        view
        returns (uint256[] memory rankedArticleIds, uint256[] memory rankedScores)
    {
        uint256[] memory articleIds = articleRegistry.getTopicArticleIds(topicId);
        return _rankArticles(topicId, articleIds);
    }

    function previewWriterPayouts(uint256 topicId)
        external
        view
        returns (
            uint256[] memory articleIds,
            address[] memory writers,
            uint256[] memory payouts
        )
    {
        uint256[] memory allArticleIds = articleRegistry.getTopicArticleIds(topicId);
        (uint256[] memory rankedArticleIds, ) = _rankArticles(topicId, allArticleIds);

        uint256[] memory rewardedArticleIds = _getRewardedArticleIds(topicId, rankedArticleIds);
        uint256 rewardCount = rewardedArticleIds.length;

        if (rewardCount == 0) {
            articleIds = new uint256[](0);
            writers = new address[](0);
            payouts = new uint256[](0);
            return (articleIds, writers, payouts);
        }

        articleIds = rewardedArticleIds;

        WriterRewardInputs memory data = _loadWriterRewardInputs(rewardedArticleIds, rewardCount);
        writers = data.writers;
        payouts = new uint256[](rewardCount);

        WriterRewardState memory s;
        s.fundingPool = topicManager.getFundingPool(topicId);
        s.losingWriterPool = articleRegistry.totalWriterStakeByTopic(topicId) - data.rewardedStakeSum;
        s.totalWeight = _totalWeight(rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            (uint256 fundingShare, uint256 losingShare) = _computeShares(s, rewardCount, i);

            payouts[i] = fundingShare + losingShare + data.stakes[i];

            if (i != rewardCount - 1) {
                s.fundingDistributed += fundingShare;
                s.losingDistributed += losingShare;
            }
        }
    }

    function previewWriterPayoutsInWholeTokens(uint256 topicId)
        external
        view
        returns (
            uint256[] memory articleIds,
            address[] memory writers,
            uint256[] memory wholeTokenPayouts
        )
    {
        (articleIds, writers, wholeTokenPayouts) = this.previewWriterPayouts(topicId);

        for (uint256 i = 0; i < wholeTokenPayouts.length; i++) {
            wholeTokenPayouts[i] = wholeTokenPayouts[i] / 1e18;
        }
    }

    function previewWriterPayoutsScaled2dp(uint256 topicId)
        external
        view
        returns (
            uint256[] memory articleIds,
            address[] memory writers,
            uint256[] memory payoutsScaled2dp
        )
    {
        (articleIds, writers, payoutsScaled2dp) = this.previewWriterPayouts(topicId);

        for (uint256 i = 0; i < payoutsScaled2dp.length; i++) {
            payoutsScaled2dp[i] = payoutsScaled2dp[i] / 1e16;
        }
    }

    function previewReaderReward(uint256 topicId, address reader) external view returns (uint256) {
        Resolution storage r = resolutions[topicId];
        if (!r.resolved) return 0;

        (uint256 articleId, uint256 userStake, , bool exists) = voting.getUserRevealedVote(topicId, reader);
        if (!exists) return 0;
        if (articleId != r.winnerArticleId) return 0;

        uint256 reward = userStake;
        if (r.winnerReaderPool > 0 && r.losingReaderPool > 0) {
            reward += (r.losingReaderPool * userStake) / r.winnerReaderPool;
        }

        return reward;
    }

    function previewReaderRewardWhole(uint256 topicId, address reader) external view returns (uint256) {
        uint256 reward = this.previewReaderReward(topicId, reader);
        return reward / 1e18;
    }

    function previewReaderRewardScaled2dp(uint256 topicId, address reader) external view returns (uint256) {
        uint256 reward = this.previewReaderReward(topicId, reader);
        return reward / 1e16;
    }

    // stored bonus only: 0,1,2...
    function getReputationWhole(address user) external view returns (uint256) {
        return reputation[user] / 1e18;
    }

    function getReputationRaw(address user) external view returns (uint256) {
        return reputation[user];
    }

    // effective reputation used in scoring: 1,2,3...
    function getEffectiveReputationWhole(address user) external view returns (uint256) {
        return _effectiveReputation(user) / 1e18;
    }

    function getEffectiveReputationRaw(address user) external view returns (uint256) {
        return _effectiveReputation(user);
    }

    function _rankArticles(
        uint256 topicId,
        uint256[] memory articleIds
    ) internal view returns (uint256[] memory rankedArticleIds, uint256[] memory rankedScores) {
        uint256 len = articleIds.length;
        rankedArticleIds = new uint256[](len);
        rankedScores = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            rankedArticleIds[i] = articleIds[i];
            rankedScores[i] = computeArticleScore(topicId, articleIds[i]);
        }

        for (uint256 i = 1; i < len; i++) {
            uint256 currentArticle = rankedArticleIds[i];
            uint256 currentScore = rankedScores[i];
            uint256 j = i;

            while (j > 0 && currentScore > rankedScores[j - 1]) {
                rankedArticleIds[j] = rankedArticleIds[j - 1];
                rankedScores[j] = rankedScores[j - 1];
                j--;
            }

            rankedArticleIds[j] = currentArticle;
            rankedScores[j] = currentScore;
        }
    }

    function _computeReaderPools(
        uint256 topicId,
        uint256 winnerArticleId
    ) internal view returns (uint256 winnerReaderPool, uint256 losingReaderPool) {
        uint256 totalCommitted = voting.totalCommittedStakeByTopic(topicId);
        uint256 totalRevealed = voting.totalRevealedStakeByTopic(topicId);
        winnerReaderPool = voting.totalRevealedStakeByArticle(topicId, winnerArticleId);

        uint256 unrevealedStake = totalCommitted - totalRevealed;
        uint256 losingRevealedStake = totalRevealed - winnerReaderPool;
        losingReaderPool = losingRevealedStake + unrevealedStake;
    }

    function _storeTopThree(
        Resolution storage r,
        uint256[] memory rankedArticleIds,
        uint256[] memory rankedScores
    ) internal {
        r.topArticleIds[0] = rankedArticleIds.length > 0 ? rankedArticleIds[0] : 0;
        r.topArticleIds[1] = rankedArticleIds.length > 1 ? rankedArticleIds[1] : 0;
        r.topArticleIds[2] = rankedArticleIds.length > 2 ? rankedArticleIds[2] : 0;

        r.topScores[0] = rankedScores.length > 0 ? rankedScores[0] : 0;
        r.topScores[1] = rankedScores.length > 1 ? rankedScores[1] : 0;
        r.topScores[2] = rankedScores.length > 2 ? rankedScores[2] : 0;
    }

    function _cappedRewardCount(uint256 len) internal pure returns (uint256) {
        return len > 10 ? 10 : len;
    }

    function _weightAt(uint256 rewardCount, uint256 i) internal pure returns (uint256) {
        return 1 << (rewardCount - 1 - i);
    }

    function _totalWeight(uint256 rewardCount) internal pure returns (uint256) {
        return (1 << rewardCount) - 1;
    }

    function _getRewardedArticleIds(
        uint256 topicId,
        uint256[] memory rankedArticleIds
    ) internal view returns (uint256[] memory rewardedArticleIds) {
        uint256 count = 0;

        for (uint256 i = 0; i < rankedArticleIds.length; i++) {
            if (voting.totalRevealedStakeByArticle(topicId, rankedArticleIds[i]) > 0) {
                count++;
            }
        }

        count = _cappedRewardCount(count);
        rewardedArticleIds = new uint256[](count);

        uint256 index = 0;
        for (uint256 i = 0; i < rankedArticleIds.length && index < count; i++) {
            if (voting.totalRevealedStakeByArticle(topicId, rankedArticleIds[i]) > 0) {
                rewardedArticleIds[index] = rankedArticleIds[i];
                index++;
            }
        }
    }

    function _loadWriterRewardInputs(
        uint256[] memory rewardedArticleIds,
        uint256 rewardCount
    ) internal view returns (WriterRewardInputs memory data) {
        data.writers = new address[](rewardCount);
        data.stakes = new uint256[](rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            uint256 articleId = rewardedArticleIds[i];
            data.writers[i] = articleRegistry.getArticleWriter(articleId);
            data.stakes[i] = articleRegistry.getArticleWriterStake(articleId);
            data.rewardedStakeSum += data.stakes[i];
        }
    }

    function _computeShares(
        WriterRewardState memory s,
        uint256 rewardCount,
        uint256 i
    ) internal pure returns (uint256 fundingShare, uint256 losingShare) {
        if (i == rewardCount - 1) {
            fundingShare = s.fundingPool - s.fundingDistributed;
            losingShare = s.losingWriterPool - s.losingDistributed;
        } else {
            uint256 weight = _weightAt(rewardCount, i);
            fundingShare = (s.fundingPool * weight) / s.totalWeight;
            losingShare = (s.losingWriterPool * weight) / s.totalWeight;
        }
    }

    function _payWriterRewards(
        uint256 topicId,
        uint256[] memory rankedArticleIds
    ) internal {
        uint256[] memory rewardedArticleIds = _getRewardedArticleIds(topicId, rankedArticleIds);
        uint256 rewardCount = rewardedArticleIds.length;

        if (rewardCount == 0) return;

        WriterRewardInputs memory data = _loadWriterRewardInputs(rewardedArticleIds, rewardCount);

        WriterRewardState memory s;
        s.fundingPool = topicManager.getFundingPool(topicId);
        s.losingWriterPool = articleRegistry.totalWriterStakeByTopic(topicId) - data.rewardedStakeSum;
        s.totalWeight = _totalWeight(rewardCount);

        for (uint256 i = 0; i < rewardCount; i++) {
            uint256 articleId = rewardedArticleIds[i];
            (uint256 fundingShare, uint256 losingShare) = _computeShares(s, rewardCount, i);

            uint256 payoutAmount = fundingShare + losingShare + data.stakes[i];

            treasury.payout(data.writers[i], payoutAmount);
            emit WriterRewardPaid(topicId, articleId, data.writers[i], payoutAmount);
            emit DemoMessage("Writer received tokens", data.writers[i], topicId, articleId, payoutAmount);

            if (i != rewardCount - 1) {
                s.fundingDistributed += fundingShare;
                s.losingDistributed += losingShare;
            }
        }
    }

    function _effectiveReputation(address user) internal view returns (uint256) {
        return BASE_REPUTATION + reputation[user];
    }

    function _increaseReputation(address user, uint256 amount) internal {
        uint256 oldStored = reputation[user];
        uint256 oldStoredWhole = oldStored / 1e18;
        uint256 oldEffectiveWhole = (BASE_REPUTATION + oldStored) / 1e18;

        uint256 newStored = oldStored + (amount * 1e18);
        reputation[user] = newStored;

        uint256 newStoredWhole = newStored / 1e18;
        uint256 newEffectiveWhole = (BASE_REPUTATION + newStored) / 1e18;

        emit ReputationUpdated(
            user,
            oldStoredWhole,
            newStoredWhole,
            oldEffectiveWhole,
            newEffectiveWhole,
            true
        );
    }

    function _decreaseReputation(address user, uint256 amount) internal {
        uint256 oldStored = reputation[user];
        uint256 oldStoredWhole = oldStored / 1e18;
        uint256 oldEffectiveWhole = (BASE_REPUTATION + oldStored) / 1e18;

        uint256 penalty = amount * 1e18;
        uint256 newStored;

        if (penalty >= oldStored) {
            newStored = 0;
        } else {
            newStored = oldStored - penalty;
        }

        reputation[user] = newStored;

        uint256 newStoredWhole = newStored / 1e18;
        uint256 newEffectiveWhole = (BASE_REPUTATION + newStored) / 1e18;

        emit ReputationUpdated(
            user,
            oldStoredWhole,
            newStoredWhole,
            oldEffectiveWhole,
            newEffectiveWhole,
            false
        );
    }

    function voteContribution(uint256 rep, uint256 stakeAmount) public pure returns (uint256) {
        uint256 sqrtStake = Math.sqrt(stakeAmount);
        return (rep * sqrtStake) / 1e18;
    }

    function _voteContribution(uint256 rep, uint256 stakeAmount) internal pure returns (uint256) {
        uint256 sqrtStake = Math.sqrt(stakeAmount);
        return (rep * sqrtStake) / 1e18;
    }

    function _updateReaderReputation(
        uint256 topicId,
        uint256[] memory articleIds,
        uint256 winningArticleId
    ) internal {
        for (uint256 i = 0; i < articleIds.length; i++) {
            uint256 articleId = articleIds[i];
            address[] memory voters = voting.getArticleVoters(topicId, articleId);

            for (uint256 j = 0; j < voters.length; j++) {
                address voter = voters[j];
                (, uint256 amount, , bool exists) = voting.getUserRevealedVote(topicId, voter);

                if (!exists || amount == 0) continue;

                if (articleId == winningArticleId) {
                    _increaseReputation(voter, 1);
                    emit DemoMessage("Reader reputation increased", voter, topicId, articleId, 1);
                } else {
                    _decreaseReputation(voter, 1);
                    emit DemoMessage("Reader reputation decreased", voter, topicId, articleId, 1);
                }
            }
        }
    }
}