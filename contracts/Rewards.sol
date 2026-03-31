// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";
import "./interfaces/IBucketManager.sol";
import "./interfaces/IEpochManager.sol";
import "./interfaces/IArticleRegistry.sol";
import "./interfaces/IStaking.sol";
import "./libraries/MathUtils.sol";
import "./libraries/TimeWeight.sol";

contract Rewards {

    // ── Events ────────────────────────────────────────────────────────────────
    event EpochFinalized(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint8   nPaid,
        uint256 S_win,
        uint256 S_lose,
        uint256 feeTaken
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
        uint256   S_win;      // total raw stake on winning articles
        uint256   S_lose;     // total raw stake on losing articles
        uint256   feeTaken;   // platform fee taken from S_lose
        uint256   writerPool; // funded from bucket at finalize-time
        uint256   readerPool; // S_lose - feeTaken — redistributed to winning readers
    }

    ICitecoinToken   public immutable token;
    IBucketManager   public immutable bucketManager;
    IEpochManager    public immutable epochManager;
    IArticleRegistry public immutable articleRegistry;
    IStaking         public immutable staking;

    mapping(uint256 => EpochResult)                      public results;
    mapping(uint256 => mapping(uint256 => bool))         public writerClaimed;
    mapping(uint256 => mapping(address => bool))         public readerClaimed;

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
    /// @notice Finalize an epoch — rank articles, collect loser stakes, fund writer pool.
    /// @dev Callable by anyone once epoch has ended. Permissionless so no single
    ///      party can block reward distribution.
    /// @param epochId          Epoch to finalize.
    /// @param writerPoolAmount Tokens to pull from bucket funds for writer rewards.
    function finalizeEpoch(uint256 epochId, uint256 writerPoolAmount) external {
        EpochResult storage r = results[epochId];
        require(!r.finalized, "already finalized");

        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Ended,
            "epoch not ended yet"
        );

        IEpochManager.EpochConfig memory e = epochManager.getEpoch(epochId);
        (,,, uint16 feeBps,,,, ) = bucketManager.getBucket(e.bucketId);

        // ── Step 1: collect eligible articles ────────────────────────────────
        uint256[] memory articleIds   = articleRegistry.getEpochArticles(epochId);
        uint256          eligibleCount = articleRegistry.eligibleArticleCount(epochId);
        require(eligibleCount > 0, "no eligible articles");

        uint256[] memory eligible = new uint256[](eligibleCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < articleIds.length; i++) {
            // Use destructured return to avoid IArticleRegistry.Article struct error
            (,,,,,,,,, bool eligible_) = articleRegistry.getArticle(articleIds[i]);
            if (eligible_) eligible[idx++] = articleIds[i];
        }

        // ── Step 2: rank top-n by effective (quadratic) stake ─────────────────
        uint8     nPaid         = MathUtils.winnersCount(eligibleCount);
        uint256[] memory winnersOrdered = _selectTopKByEffStake(
            epochId, eligible, eligibleCount, nPaid
        );

        // ── Step 3: compute pools ─────────────────────────────────────────────
        uint256 S_win = 0;
        for (uint256 i = 0; i < winnersOrdered.length; i++) {
            (,, uint256 rawTrue, uint256 rawFalse) = _articleStakeSplit(epochId, winnersOrdered[i]);
            S_win += rawTrue + rawFalse;
        }

        uint256 totalRaw   = staking.totalRawStakeByEpoch(epochId);
        uint256 S_lose     = totalRaw - S_win;
        uint256 feeTaken   = (S_lose * feeBps) / 10_000;
        uint256 readerPool = S_lose - feeTaken;

        // ── Step 4: slash losing readers ─────────────────────────────────────
        _slashLosers(epochId, articleIds, winnersOrdered);

        // ── Step 5: settle writer stakes ──────────────────────────────────────
        _settleWriterStakes(epochId, articleIds, winnersOrdered, nPaid);

        // ── Step 6: pull writer pool from bucket ──────────────────────────────
        if (writerPoolAmount > 0) {
            bucketManager.withdrawBucketFunds(e.bucketId, address(this), writerPoolAmount);
        }

        // ── Step 7: deactivate bucket (must be AFTER withdrawBucketFunds) ─────
        bucketManager.deactivateBucket(e.bucketId, eligibleCount, totalRaw);

        // ── Step 8: mark epoch finalized — prevents double finalization ───────
        epochManager.markFinalized(epochId);

        // ── Step 9: store results ─────────────────────────────────────────────
        r.finalized  = true;
        r.nPaid      = nPaid;
        r.winners    = winnersOrdered;
        r.S_win      = S_win;
        r.S_lose     = S_lose;
        r.feeTaken   = feeTaken;
        r.writerPool = writerPoolAmount;
        r.readerPool = readerPool;

        emit EpochFinalized(epochId, e.bucketId, nPaid, S_win, S_lose, feeTaken);
    }

    // ── Writer claim ──────────────────────────────────────────────────────────
    /// @notice Winning writers claim their share of the bucket reward pool.
    /// @dev Exponential decay: rank 1 = 50%, rank 2 = 25%, rank 3 = 12.5%...
    ///      Writer stake is returned in _settleWriterStakes at finalize time.
    function claimWriter(uint256 epochId, uint256 articleId) external {
        EpochResult storage r = results[epochId];
        require(r.finalized,                        "not finalized");
        require(!writerClaimed[epochId][articleId], "already claimed");

        // Destructure to avoid cross-contract struct error
        (address author, uint256 artEpochId,,,,,,,, ) = articleRegistry.getArticle(articleId);
        require(artEpochId  == epochId,    "epoch mismatch");
        require(author      == msg.sender, "not author");

        uint256 rank = _rankOf(r.winners, articleId);
        require(rank != 0, "article not a winner");

        uint256 payout = _writerPayout(r.writerPool, uint8(rank), r.nPaid);
        require(payout > 0, "zero payout");

        writerClaimed[epochId][articleId] = true;
        require(token.transfer(msg.sender, payout), "transfer failed");

        emit WriterClaimed(epochId, articleId, msg.sender, payout);
    }

    // ── Reader claim ──────────────────────────────────────────────────────────
    /// @notice Winning readers claim stake back + time-weighted share of loser pool.
    /// @dev Early voters earn up to 1.5x share. Losers get nothing — stake slashed at finalize.
    function claimReader(uint256 epochId) external {
        EpochResult storage r = results[epochId];
        require(r.finalized,                         "not finalized");
        require(!readerClaimed[epochId][msg.sender], "already claimed");

        IEpochManager.EpochConfig memory e = epochManager.getEpoch(epochId);

        uint256 userWeightedWinning  = 0;
        uint256 totalWeightedWinning = 0;

        for (uint256 i = 0; i < r.winners.length; i++) {
            uint256   articleId = r.winners[i];
            address[] memory stakers = staking.getStakers(epochId, articleId);
            (uint256 trueW, uint256 falseW) = staking.getTally(epochId, articleId);
            bool articleTrueWon = trueW >= falseW;

            for (uint256 j = 0; j < stakers.length; j++) {
                // Destructure commit — avoids IStaking.Commit struct error
                (
                    ,               // commitHash
                    uint256 rawStake,
                    uint64  commitTime,
                    bool    revealed,
                    bool    voteTrue,
                    // effectiveStake
                ) = staking.getCommit(epochId, articleId, stakers[j]);

                if (!revealed)                    continue;
                if (voteTrue != articleTrueWon)   continue;

                uint256 wBps = TimeWeight.weightBps(
                    commitTime,
                    e.stakingStart,
                    e.stakingEnd,
                    15000,  // 1.5x earliest voters
                    10000   // 1.0x latest voters
                );
                uint256 weighted = (rawStake * wBps) / 10000;
                totalWeightedWinning += weighted;

                if (stakers[j] == msg.sender) {
                    userWeightedWinning += weighted;
                }
            }
        }

        readerClaimed[epochId][msg.sender] = true;

        if (userWeightedWinning == 0) {
            emit ReaderClaimed(epochId, msg.sender, 0);
            return;
        }

        uint256 rewardShare = 0;
        if (totalWeightedWinning > 0 && r.readerPool > 0) {
            rewardShare = (userWeightedWinning * r.readerPool) / totalWeightedWinning;
        }

        uint256 stakeBack = _getUserRawWinningStake(epochId, r.winners, msg.sender);
        uint256 payout    = stakeBack + rewardShare;

        if (payout > 0) {
            require(token.transfer(msg.sender, payout), "transfer failed");
        }

        emit ReaderClaimed(epochId, msg.sender, payout);
    }

    // ── Internal: finalization helpers ────────────────────────────────────────

    /// @dev Slash all stakers on non-winning articles — moves tokens here for redistribution.
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
                (
                    ,
                    uint256 rawStake,
                    ,,,
                ) = staking.getCommit(epochId, articleId, stakers[j]);
                if (rawStake > 0) {
                    staking.slashStake(epochId, articleId, stakers[j]);
                }
            }
        }
    }

    /// @dev Release winning writer stakes; slash losing writer stakes.
    function _settleWriterStakes(
        uint256          epochId,
        uint256[] memory allArticles,
        uint256[] memory winners,
        uint8            nPaid
    ) internal {
        for (uint256 i = 0; i < allArticles.length; i++) {
            uint256 articleId = allArticles[i];
            uint256 rank      = _rankOf(winners, articleId);

            // Destructure to get author without cross-contract struct error
            (address author,,,,,,,,, ) = articleRegistry.getArticle(articleId);

            if (rank != 0 && rank <= nPaid) {
                articleRegistry.releaseStake(articleId, author);
            } else {
                articleRegistry.slashStake(articleId);
            }
        }
    }

    /// @dev Returns effective and raw stake split by vote direction for an article.
    function _articleStakeSplit(uint256 epochId, uint256 articleId)
        internal view
        returns (uint256 trueEff, uint256 falseEff, uint256 trueRaw, uint256 falseRaw)
    {
        (trueEff, falseEff) = staking.getTally(epochId, articleId);
        address[] memory stakers = staking.getStakers(epochId, articleId);

        for (uint256 i = 0; i < stakers.length; i++) {
            (
                ,
                uint256 rawStake,
                ,
                bool revealed,
                bool voteTrue,
            ) = staking.getCommit(epochId, articleId, stakers[i]);

            if (!revealed) continue;
            if (voteTrue) trueRaw  += rawStake;
            else          falseRaw += rawStake;
        }
    }

    /// @dev Sum raw stake for a reader on winning articles where they voted correctly.
    function _getUserRawWinningStake(
        uint256          epochId,
        uint256[] memory winners,
        address          user
    ) internal view returns (uint256 total) {
        for (uint256 i = 0; i < winners.length; i++) {
            (
                ,
                uint256 rawStake,
                ,
                bool revealed,
                bool voteTrue,
            ) = staking.getCommit(epochId, winners[i], user);

            if (!revealed) continue;

            (uint256 trueW, uint256 falseW) = staking.getTally(epochId, winners[i]);
            bool articleTrueWon = trueW >= falseW;

            if (voteTrue == articleTrueWon) {
                total += rawStake;
            }
        }
    }

    // ── Internal: math ────────────────────────────────────────────────────────

    /// @dev 1-based rank of articleId in winners. Returns 0 if not found.
    function _rankOf(uint256[] memory winners, uint256 articleId)
        internal pure returns (uint256)
    {
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == articleId) return i + 1;
        }
        return 0;
    }

    /// @dev Exponential decay payout: weight(rank) = 2^(nPaid-rank) / sum of all weights.
    ///      rank 1 → ~50%, rank 2 → ~25%, rank 3 → ~12.5% and so on.
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

    /// @dev Insertion sort to find top-k articles by quadratic effective stake.
    ///      Tie-break 1: higher raw stake. Tie-break 2: lower articleId (earlier submission).
    function _selectTopKByEffStake(
        uint256          epochId,
        uint256[] memory eligible,
        uint256          eligibleCount,
        uint8            k
    ) internal view returns (uint256[] memory winners) {
        winners          = new uint256[](k);
        uint256[] memory scores = new uint256[](k);
        uint256[] memory rawTie = new uint256[](k);

        for (uint256 i = 0; i < eligibleCount; i++) {
            uint256 articleId = eligible[i];
            (uint256 trueEff, uint256 falseEff, uint256 trueRaw, uint256 falseRaw)
                = _articleStakeSplit(epochId, articleId);

            uint256 score = trueEff >= falseEff ? trueEff : falseEff;
            uint256 raw   = trueRaw + falseRaw;

            uint256 pos = k;
            for (uint256 j = 0; j < k; j++) {
                if (
                    score > scores[j] ||
                    (score == scores[j] && raw > rawTie[j]) ||
                    (score == scores[j] && raw == rawTie[j] && articleId < winners[j])
                ) {
                    pos = j;
                    break;
                }
            }

            if (pos < k) {
                for (uint256 s = k - 1; s > pos; s--) {
                    winners[s] = winners[s - 1];
                    scores[s]  = scores[s - 1];
                    rawTie[s]  = rawTie[s - 1];
                }
                winners[pos] = articleId;
                scores[pos]  = score;
                rawTie[pos]  = raw;
            }
        }
    }
}