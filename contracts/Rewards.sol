// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";
import "./interfaces/IBucketManager.sol";
import "./interfaces/IEpochManager.sol";
import "./interfaces/IArticleRegistry.sol";
import "./interfaces/IStaking.sol";
import "./libraries/MathUtils.sol";

contract Rewards {

    // ── Events ────────────────────────────────────────────────────────────────
    event EpochFinalized(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint8   nPaid,
        uint256 readerPool
    );

    event WriterClaimed(
        uint256 indexed epochId,
        uint256 indexed articleId,
        address indexed author,
        uint256 amount
    );

    event ReaderClaimed(
        uint256 indexed epochId,
        address indexed reader,
        uint256 amount
    );

    // ── Storage ───────────────────────────────────────────────────────────────
    struct EpochResult {
        bool      finalized;
        uint8     nPaid;
        uint256[] winners;    // articleIds ordered rank 1..nPaid
        uint256   writerPool; // funded from bucket at finalize time
        uint256   readerPool; // losing reader stakes redistributed to winners
    }

    ICitecoinToken   public immutable token;
    IBucketManager   public immutable bucketManager;
    IEpochManager    public immutable epochManager;
    IArticleRegistry public immutable articleRegistry;
    IStaking         public immutable staking;

    mapping(uint256 => EpochResult)              public results;
    mapping(uint256 => mapping(uint256 => bool)) public writerClaimed;
    mapping(uint256 => mapping(address => bool)) public readerClaimed;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address tokenAddress,
        address bucketManagerAddress,
        address epochManagerAddress,
        address articleRegistryAddress,
        address stakingAddress
    ) {
        token           = ICitecoinToken(tokenAddress);
        bucketManager   = IBucketManager(bucketManagerAddress);
        epochManager    = IEpochManager(epochManagerAddress);
        articleRegistry = IArticleRegistry(articleRegistryAddress);
        staking         = IStaking(stakingAddress);
    }

    // ── Finalization ──────────────────────────────────────────────────────────
    function finalizeEpoch(uint256 epochId, uint256 writerPoolAmount) external {
        EpochResult storage r = results[epochId];
        require(!r.finalized, "already finalized");
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Ended,
            "epoch not ended yet"
        );

        (uint256 bucketId,,,,,) = epochManager.getEpoch(epochId);

        // Step 1: collect eligible articles
        uint256[] memory articleIds = articleRegistry.getEpochArticles(epochId);
        uint256 eligibleCount = 0;

        for (uint256 i = 0; i < articleIds.length; i++) {
            (,,,,,,,, bool el) = articleRegistry.getArticle(articleIds[i]);
            if (el) eligibleCount++;
        }

        // No eligible articles, slash bucket creator stake for bad topic, then exit
        if (eligibleCount == 0) {
            bucketManager.slashBucketStake(bucketId);
            epochManager.markFinalized(epochId);
            r.finalized = true;
            emit EpochFinalized(epochId, bucketId, 0, 0);
            return;
        }

        uint256[] memory eligible = new uint256[](eligibleCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < articleIds.length; i++) {
            (,,,,,,,, bool el) = articleRegistry.getArticle(articleIds[i]);
            if (el) eligible[idx++] = articleIds[i];
        }

        // Step 2: rank top-n by support only
        uint8 nPaid = MathUtils.winnersCount(eligibleCount);
        uint256[] memory winners = _selectTopKByEffStake(
            epochId,
            eligible,
            eligibleCount,
            nPaid
        );

        // Steps 3-7
        uint256 readerPool = _finalizeInner(
            epochId,
            bucketId,
            articleIds,
            winners,
            writerPoolAmount
        );

        // Step 8: mark finalized
        epochManager.markFinalized(epochId);

        // Step 9: store results
        r.finalized  = true;
        r.nPaid      = nPaid;
        r.winners    = winners;
        r.writerPool = writerPoolAmount;
        r.readerPool = readerPool;

        emit EpochFinalized(epochId, bucketId, nPaid, readerPool);
    }

    function _finalizeInner(
        uint256          epochId,
        uint256          bucketId,
        uint256[] memory articleIds,
        uint256[] memory winners,
        uint256          writerPoolAmount
    ) internal returns (uint256 readerPool) {
        // Step 3: compute pools
        uint256 S_win = 0;
        for (uint256 i = 0; i < winners.length; i++) {
            S_win += _rawStakeOnArticle(epochId, winners[i]);
        }

        uint256 S_lose = 0;
        for (uint256 i = 0; i < articleIds.length; i++) {
            if (_rankOf(winners, articleIds[i]) == 0) {
                S_lose += _rawStakeOnArticle(epochId, articleIds[i]);
            }
        }

        uint256 feeTaken = (S_lose * bucketManager.FEE_BPS()) / 10_000;
        readerPool = S_lose - feeTaken;

        // Step 4: slash losing readers
        _slashLosers(epochId, articleIds, winners);

        // Step 5: settle writer stakes
        uint8 nPaid = uint8(winners.length);
        _settleWriterStakes(articleIds, winners, nPaid);

        // Step 6: pull writer pool from bucket
        if (writerPoolAmount > 0) {
            bucketManager.withdrawBucketFunds(bucketId, address(this), writerPoolAmount);
        }

        // Step 7: deactivate bucket
        bucketManager.deactivateBucket(bucketId);
    }

    // ── Writer claim ──────────────────────────────────────────────────────────
    function claimWriter(uint256 epochId, uint256 articleId) external {
        EpochResult storage r = results[epochId];
        require(r.finalized, "not finalized");
        require(!writerClaimed[epochId][articleId], "already claimed");

        (address author, uint256 artEpochId,,,,,,,) = articleRegistry.getArticle(articleId);
        require(artEpochId == epochId, "epoch mismatch");
        require(author == msg.sender, "not author");

        uint256 rank = _rankOf(r.winners, articleId);
        require(rank != 0, "article not a winner");

        uint256 payout = _writerPayout(r.writerPool, uint8(rank), r.nPaid);
        require(payout > 0, "zero payout");

        writerClaimed[epochId][articleId] = true;
        require(token.transfer(msg.sender, payout), "transfer failed");

        emit WriterClaimed(epochId, articleId, msg.sender, payout);
    }

    // ── Reader claim ──────────────────────────────────────────────────────────
    function claimReader(uint256 epochId) external {
        EpochResult storage r = results[epochId];

        require(r.finalized, "not finalized");
        require(!readerClaimed[epochId][msg.sender], "already claimed");

        (uint256 userWeighted, uint256 totalWeighted) =
            _computeWeightedStakes(epochId, r.winners, msg.sender);

        readerClaimed[epochId][msg.sender] = true;

        if (userWeighted == 0) {
            emit ReaderClaimed(epochId, msg.sender, 0);
            return;
        }

        uint256 rewardShare = 0;
        if (totalWeighted > 0 && r.readerPool > 0) {
            rewardShare = (userWeighted * r.readerPool) / totalWeighted;
        }

        // Stake sits in Staking contract, release it directly to the voter
        (,uint256 rawStake,, uint256 articleId,) = staking.getCommit(epochId, msg.sender);
        staking.releaseStake(epochId, articleId, msg.sender);

        // Only the rewardShare portion comes from Rewards
        if (rewardShare > 0) {
            require(token.transfer(msg.sender, rewardShare), "transfer failed");
        }

        emit ReaderClaimed(epochId, msg.sender, rawStake + rewardShare);
    }

    // ── Internal: finalization helpers ───────────────────────────────────────
    function _slashLosers(
        uint256          epochId,
        uint256[] memory allArticles,
        uint256[] memory winners
    ) internal {
        for (uint256 i = 0; i < allArticles.length; i++) {
            uint256 articleId = allArticles[i];
            if (_rankOf(winners, articleId) != 0) continue;

            address[] memory stakers = staking.getStakers(epochId, articleId);
            for (uint256 j = 0; j < stakers.length; j++) {
                (, uint256 rawStake,, uint256 committedArticleId,) =
                    staking.getCommit(epochId, stakers[j]);

                if (rawStake > 0 && committedArticleId == articleId) {
                    staking.slashStake(epochId, articleId, stakers[j]);
                }
            }
        }
    }

    function _settleWriterStakes(
        uint256[] memory allArticles,
        uint256[] memory winners,
        uint8            nPaid
    ) internal {
        for (uint256 i = 0; i < allArticles.length; i++) {
            uint256 articleId = allArticles[i];
            uint256 rank = _rankOf(winners, articleId);

            (address author,,,,,,, uint256 writerStake,) = articleRegistry.getArticle(articleId);

            if (writerStake == 0) continue;

            if (rank != 0 && rank <= nPaid) {
                articleRegistry.releaseStake(articleId, author);
            } else {
                articleRegistry.slashStake(articleId);
            }
        }
    }

    function _computeWeightedStakes(
        uint256          epochId,
        uint256[] memory winners,
        address          user
    ) internal view returns (uint256 userWeighted, uint256 totalWeighted) {
        for (uint256 i = 0; i < winners.length; i++) {
            (uint256 uw, uint256 tw) = _computeArticleWeights(epochId, winners[i], user);
            userWeighted  += uw;
            totalWeighted += tw;
        }
    }

    function _computeArticleWeights(
        uint256 epochId,
        uint256 articleId,
        address user
    ) internal view returns (uint256 userWeighted, uint256 totalWeighted) {
        address[] memory stakers = staking.getStakers(epochId, articleId);

        for (uint256 j = 0; j < stakers.length; j++) {
            (, , bool revealed, uint256 committedArticleId, uint256 effectiveStake) =
                staking.getCommit(epochId, stakers[j]);

            if (!revealed) continue;
            if (committedArticleId != articleId) continue;

            totalWeighted += effectiveStake;
            if (stakers[j] == user) userWeighted += effectiveStake;
        }
    }

    function _rawStakeOnArticle(uint256 epochId, uint256 articleId)
        internal view returns (uint256 total)
    {
        address[] memory stakers = staking.getStakers(epochId, articleId);
        for (uint256 i = 0; i < stakers.length; i++) {
            (, uint256 rawStake,, uint256 committedArticleId,) =
                staking.getCommit(epochId, stakers[i]);

            if (committedArticleId == articleId) {
                total += rawStake;
            }
        }
    }

    // ── Internal: math ────────────────────────────────────────────────────────
    function _rankOf(uint256[] memory winners, uint256 articleId)
        internal pure returns (uint256)
    {
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == articleId) return i + 1;
        }
        return 0;
    }

    function _writerPayout(uint256 pool, uint8 rank, uint8 nPaid)
        internal pure returns (uint256)
    {
        if (pool == 0 || rank == 0 || rank > nPaid) return 0;

        uint256 sumScaled = 0;
        for (uint8 k = 1; k <= nPaid; k++) {
            sumScaled += (1 << (nPaid - k));
        }

        uint256 weightScaled = (1 << (nPaid - rank));
        return (pool * weightScaled) / sumScaled;
    }

    /// @dev Insertion sort to find top-k articles by support stake.
    ///      Tie-break 1: higher raw stake. Tie-break 2: lower articleId.
    function _selectTopKByEffStake(
        uint256          epochId,
        uint256[] memory eligible,
        uint256          eligibleCount,
        uint8            k
    ) internal view returns (uint256[] memory winners) {
        winners                  = new uint256[](k);
        uint256[] memory scores  = new uint256[](k);
        uint256[] memory rawTies = new uint256[](k);

        for (uint256 i = 0; i < eligibleCount; i++) {
            uint256 articleId = eligible[i];

            uint256 score = staking.getTally(epochId, articleId);
            uint256 raw   = _rawStakeOnArticle(epochId, articleId);

            uint256 pos = k;
            for (uint256 j = 0; j < k; j++) {
                if (
                    score > scores[j] ||
                    (score == scores[j] && raw > rawTies[j]) ||
                    (score == scores[j] && raw == rawTies[j] && articleId < winners[j])
                ) {
                    pos = j;
                    break;
                }
            }

            if (pos < k) {
                for (uint256 s = k - 1; s > pos; s--) {
                    winners[s] = winners[s - 1];
                    scores[s]  = scores[s - 1];
                    rawTies[s] = rawTies[s - 1];
                }
                winners[pos] = articleId;
                scores[pos]  = score;
                rawTies[pos] = raw;
            }
        }
    }
}