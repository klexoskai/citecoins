// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BucketManager.sol";
import "./EpochManager.sol";
import "./ArticleRegistry.sol";
import "./Staking.sol";
import "./interfaces/ICitecoinToken.sol";
import "./libraries/MathUtils.sol";

contract Rewards {
    using MathUtils for uint256;

    event EpochFinalized(
        uint256 indexed epochId,
        uint256 indexed bucketId,
        uint8 nPaid,
        uint256 S_win,
        uint256 S_lose,
        uint256 feeTaken
    );
    event WriterClaimed(uint256 indexed epochId, uint256 indexed articleId, address indexed author, uint256 amount);
    event ReaderClaimed(uint256 indexed epochId, address indexed reader, uint256 amount);

    struct EpochResult {
        bool finalized;
        uint8 nPaid;
        uint256[] winners; // ordered by rank (1..nPaid) using effectiveStake ordering
        uint256 S_win;
        uint256 S_lose;
        uint256 feeTaken;

        uint256 writerPool; // funded from bucket funds at finalize
        uint256 readerPool; // equals (S_lose - feeTaken) redistributed to winning stakers
    }

    ICitecoinToken public immutable token;
    BucketManager public immutable bucketManager;
    EpochManager public immutable epochManager;
    ArticleRegistry public immutable articleRegistry;
    Staking public immutable staking;

    mapping(uint256 => EpochResult) public results;
    mapping(uint256 => mapping(uint256 => bool)) public writerClaimed; // epochId => articleId => claimed
    mapping(uint256 => mapping(address => bool)) public readerClaimed; // epochId => reader => claimed

    constructor(
        address tokenAddress,
        address bucketManagerAddress,
        address epochManagerAddress,
        address articleRegistryAddress,
        address stakingAddress
    ) {
        token = ICitecoinToken(tokenAddress);
        bucketManager = BucketManager(bucketManagerAddress);
        epochManager = EpochManager(epochManagerAddress);
        articleRegistry = ArticleRegistry(articleRegistryAddress);
        staking = Staking(stakingAddress);
    }

    /// @notice Finalize epoch results and fund writer pool from bucket funds.
    /// @param writerPoolAmount Amount of CITE to allocate to writer rewards for this epoch (pulled from bucket funds).
    function finalizeEpoch(uint256 epochId, uint256 writerPoolAmount) external {
        EpochResult storage r = results[epochId];
        require(!r.finalized, "finalized");

        EpochManager.EpochConfig memory e = epochManager.epochs(epochId);
        require(e.bucketId != 0, "epoch missing");
        require(block.timestamp >= e.stakingEnd, "too early");

        uint256 bucketId = e.bucketId;
        BucketManager.Bucket memory b = bucketManager.buckets(bucketId);

        uint256[] memory articleIds = articleRegistry.getEpochArticles(epochId);

        // Filter eligible
        uint256[] memory eligible = new uint256[](articleIds.length);
        uint256 A = 0;
        for (uint256 i = 0; i < articleIds.length; i++) {
            ArticleRegistry.Article memory art = articleRegistry.articles(articleIds[i]);
            if (art.eligible) eligible[A++] = articleIds[i];
        }
        require(A > 0, "no eligible articles");

        uint8 nPaid = MathUtils.winnersCount(A);

        // Select top-nPaid by effective stake (quadratic influence)
        uint256[] memory winnersOrdered = _selectTopKByEffStake(epochId, eligible, A, nPaid);

        // Compute S_win (raw) and totals
        uint256 S_win = 0;
        for (uint256 i = 0; i < winnersOrdered.length; i++) {
            S_win += staking.rawStakeByArticle(epochId, winnersOrdered[i]);
        }
        uint256 totalRaw = staking.totalRawStakeByEpoch(epochId);
        uint256 S_lose = totalRaw - S_win;

        uint256 feeTaken = (S_lose * b.feeBps) / 10_000;
        uint256 readerPool = S_lose - feeTaken;

        // Pull writer pool from bucket funds into this contract
        if (writerPoolAmount > 0) {
            bucketManager.withdrawBucketFunds(bucketId, address(this), writerPoolAmount);
        }

        r.finalized = true;
        r.nPaid = nPaid;
        r.winners = winnersOrdered;
        r.S_win = S_win;
        r.S_lose = S_lose;
        r.feeTaken = feeTaken;
        r.writerPool = writerPoolAmount;
        r.readerPool = readerPool;

        emit EpochFinalized(epochId, bucketId, nPaid, S_win, S_lose, feeTaken);
    }

    function claimWriter(uint256 epochId, uint256 articleId) external {
        EpochResult storage r = results[epochId];
        require(r.finalized, "not finalized");
        require(!writerClaimed[epochId][articleId], "claimed");

        ArticleRegistry.Article memory a = articleRegistry.articles(articleId);
        require(a.epochId == epochId, "epoch mismatch");
        require(a.author == msg.sender, "not author");

        uint256 rank = _rankOf(r.winners, articleId);
        require(rank != 0, "not winner");

        uint256 payout = _writerPayout(r.writerPool, uint8(rank), r.nPaid);

        writerClaimed[epochId][articleId] = true;
        require(token.transfer(msg.sender, payout), "transfer");
        emit WriterClaimed(epochId, articleId, msg.sender, payout);
    }

    /// @notice Reader claim uses constant weight (no time bonus) for demo.
    /// Redistribution is raw-stake proportional among winning stakers.
    function claimReader(uint256 epochId) external {
        EpochResult storage r = results[epochId];
        require(r.finalized, "not finalized");
        require(!readerClaimed[epochId][msg.sender], "claimed");

        // Compute user's raw stake on winning articles
        uint256 userRawWinning = 0;
        for (uint256 i = 0; i < r.winners.length; i++) {
            uint256 articleId = r.winners[i];
            uint256 raw = staking.rawStakeOf(epochId, articleId, msg.sender);
            if (raw > 0) userRawWinning += raw;
        }

        // If user has no winning stake, they get nothing (lost stake elsewhere).
        uint256 reward = 0;
        if (userRawWinning > 0 && r.S_win > 0 && r.readerPool > 0) {
            reward = (userRawWinning * r.readerPool) / r.S_win;
        }

        readerClaimed[epochId][msg.sender] = true;

        uint256 payout = userRawWinning + reward;
        if (payout > 0) {
            require(token.transfer(msg.sender, payout), "transfer");
        }

        emit ReaderClaimed(epochId, msg.sender, payout);
    }

    // -------------------------
    // Internals
    // -------------------------

    function _rankOf(uint256[] memory winners, uint256 articleId) internal pure returns (uint256) {
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == articleId) return i + 1;
        }
        return 0;
    }

    function _writerPayout(uint256 pool, uint8 rank, uint8 nPaid) internal pure returns (uint256) {
        if (pool == 0) return 0;

        // Exponential decay weights: w(k)=1/2^(k-1), normalized.
        // Use scaled weights with denominator 2^(nPaid-1):
        // wScaled(k)=2^(nPaid-k)
        uint256 sumScaled = 0;
        for (uint8 k = 1; k <= nPaid; k++) {
            sumScaled += (1 << (nPaid - k));
        }
        uint256 weightScaled = (1 << (nPaid - rank));
        return (pool * weightScaled) / sumScaled;
    }

    function _selectTopKByEffStake(
        uint256 epochId,
        uint256[] memory eligible,
        uint256 eligibleCount,
        uint8 k
    ) internal view returns (uint256[] memory winners) {
        winners = new uint256[](k);
        uint256[] memory scores = new uint256[](k);
        uint256[] memory rawTie = new uint256[](k);

        for (uint256 i = 0; i < eligibleCount; i++) {
            uint256 articleId = eligible[i];
            uint256 score = staking.effStakeByArticle(epochId, articleId);
            uint256 raw = staking.rawStakeByArticle(epochId, articleId);

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
                    scores[s] = scores[s - 1];
                    rawTie[s] = rawTie[s - 1];
                }
                winners[pos] = articleId;
                scores[pos] = score;
                rawTie[pos] = raw;
            }
        }
    }
}