// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";
import "./interfaces/IEpochManager.sol";
import "./interfaces/IArticleRegistry.sol";
import "./libraries/MathUtils.sol";

contract Staking {

    // ── Events ────────────────────────────────────────────────────────────────
    event VoteCommitted(
        uint256 indexed epochId,
        uint256 indexed articleId,
        address indexed voter,
        bytes32 commitHash,
        uint256 rawStake
    );
    event VoteRevealed(
        uint256 indexed epochId,
        uint256 indexed articleId,
        address indexed voter,
        bool    voteTrue,
        uint256 effectiveStake
    );

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Commit {
        bytes32 commitHash;     // keccak256(abi.encodePacked(articleId, voteTrue, salt))
        uint256 rawStake;       // tokens locked at commit time
        bool    revealed;
        bool    voteTrue;       // only valid after revealed == true
        uint256 effectiveStake; // MathUtils.isqrt(rawStake), computed at reveal
    }

    ICitecoinToken   public immutable token;
    IEpochManager    public immutable epochManager;
    IArticleRegistry public immutable articleRegistry;
    address          public immutable deployer;
    address          public rewards;

    // epochId => articleId => voter => Commit
    mapping(uint256 => mapping(uint256 => mapping(address => Commit))) public commits;

    // epochId => articleId => staker addresses — iterated by Rewards at payout
    mapping(uint256 => mapping(uint256 => address[]))                  internal stakerList;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))   internal hasCommitted;

    // quadratic-weighted vote totals — read by Rewards for ranking
    mapping(uint256 => mapping(uint256 => uint256)) public totalTrueEffStake;
    mapping(uint256 => mapping(uint256 => uint256)) public totalFalseEffStake;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address tokenAddress,
        address epochManagerAddress,
        address articleRegistryAddress
    ) {
        token           = ICitecoinToken(tokenAddress);
        epochManager    = IEpochManager(epochManagerAddress);
        articleRegistry = IArticleRegistry(articleRegistryAddress);
        deployer        = msg.sender;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    // ── Wiring ────────────────────────────────────────────────────────────────
    /// @notice Called once by CitecoinsProtocol after Rewards is deployed.
    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    // ── Phase 1: commit ───────────────────────────────────────────────────────
    /// @notice Lock tokens and submit a blinded vote commitment.
    /// @dev commitHash = keccak256(abi.encodePacked(articleId, voteTrue, salt))
    ///      Vote is invisible until reveal — prevents last-minute bandwagoning.
    ///      Quadratic weighting (sqrt) is applied at reveal, not here.
    ///      One commit per voter per article — no topping up after committing.
    /// @param epochId    Epoch this vote belongs to.
    /// @param articleId  Article being voted on.
    /// @param commitHash Blinded commitment — keccak256(articleId, voteTrue, salt).
    /// @param rawStake   Tokens to lock — sqrt applied at reveal for effective weight.
    function commitVote(
        uint256 epochId,
        uint256 articleId,
        bytes32 commitHash,
        uint256 rawStake
    ) external {
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Staking,
            "not in staking window"
        );

        // 7 fields: author, epochId, bucketId, contentCID, contentHash, writerStake, eligible
        (, uint256 artEpochId,,,,,bool eligible) = articleRegistry.getArticle(articleId);
        require(artEpochId == epochId, "article epoch mismatch");
        require(eligible,              "article ineligible");

        require(!hasCommitted[epochId][articleId][msg.sender], "already committed");
        require(rawStake   > 0,            "zero stake");
        require(commitHash != bytes32(0),  "empty commit");

        require(
            token.transferFrom(msg.sender, address(this), rawStake),
            "stake transfer failed"
        );

        commits[epochId][articleId][msg.sender] = Commit({
            commitHash:     commitHash,
            rawStake:       rawStake,
            revealed:       false,
            voteTrue:       false,
            effectiveStake: 0
        });

        // Track staker list so Rewards can iterate all voters at finalization
        hasCommitted[epochId][articleId][msg.sender] = true;
        stakerList[epochId][articleId].push(msg.sender);

        emit VoteCommitted(epochId, articleId, msg.sender, commitHash, rawStake);
    }

    // ── Phase 2: reveal ───────────────────────────────────────────────────────
    /// @notice Reveal committed vote by submitting plaintext vote + salt.
    /// @dev Recomputes keccak256(articleId, voteTrue, salt) and verifies it
    ///      matches the stored commitHash. Wrong vote or wrong salt both revert.
    ///      effectiveStake = sqrt(rawStake) — quadratic weighting applied here.
    ///      A whale with 10000 tokens gets sqrt(10000)=100 weight, not 10000.
    /// @param epochId   Epoch this vote belongs to.
    /// @param articleId Article being voted on.
    /// @param voteTrue  True = article is credible. False = not credible.
    /// @param salt      Random bytes32 used when building the commit hash.
    function revealVote(
        uint256 epochId,
        uint256 articleId,
        bool    voteTrue,
        bytes32 salt
    ) external {
        // Reveal allowed during Staking OR after Ended
        // If reveal-only-during-staking: voter who misses window loses stake unfairly
        IEpochManager.Phase phase = epochManager.currentPhase(epochId);
        require(
            phase == IEpochManager.Phase.Staking ||
            phase == IEpochManager.Phase.Ended,
            "reveal not allowed in this phase"
        );

        Commit storage c = commits[epochId][articleId][msg.sender];
        require(c.rawStake  > 0,  "no commit found");
        require(!c.revealed,      "already revealed");

        // Core commit-reveal verification
        // If this passes, voter definitely committed this exact vote with this salt
        bytes32 expected = keccak256(abi.encodePacked(articleId, voteTrue, salt));
        require(expected == c.commitHash, "hash mismatch: wrong vote or salt");

        // Quadratic weighting via MathUtils.isqrt (Babylonian method)
        // Prevents whale dominance without requiring identity verification
        // Future extension: oracle-based sybil resistance (e.g. Worldcoin)
        uint256 effStake = MathUtils.isqrt(c.rawStake);

        c.revealed       = true;
        c.voteTrue       = voteTrue;
        c.effectiveStake = effStake;

        // Update aggregates — read by Rewards._selectTopKByEffStake for ranking
        if (voteTrue) {
            totalTrueEffStake[epochId][articleId]  += effStake;
        } else {
            totalFalseEffStake[epochId][articleId] += effStake;
        }

        emit VoteRevealed(epochId, articleId, msg.sender, voteTrue, effStake);
    }

    // ── Rewards interface ─────────────────────────────────────────────────────
    /// @notice All stakers for an article — Rewards iterates this for payouts.
    function getStakers(uint256 epochId, uint256 articleId)
        external view returns (address[] memory)
    {
        return stakerList[epochId][articleId];
    }

    /// @notice Commit fields returned individually — avoids cross-contract struct errors.
    function getCommit(
        uint256 epochId,
        uint256 articleId,
        address voter
    ) external view returns (
        bytes32 commitHash,
        uint256 rawStake,
        bool    revealed,
        bool    voteTrue,
        uint256 effectiveStake
    ) {
        Commit storage c = commits[epochId][articleId][voter];
        return (
            c.commitHash,
            c.rawStake,
            c.revealed,
            c.voteTrue,
            c.effectiveStake
        );
    }

    /// @notice Quadratic-weighted vote tally for an article.
    ///         trueWeight and falseWeight are sqrt-weighted, not raw.
    function getTally(uint256 epochId, uint256 articleId)
        external view returns (uint256 trueWeight, uint256 falseWeight)
    {
        return (
            totalTrueEffStake[epochId][articleId],
            totalFalseEffStake[epochId][articleId]
        );
    }

    /// @notice Return stake to winning voter — called by Rewards at claimReader.
    function releaseStake(uint256 epochId, uint256 articleId, address to)
        external onlyRewards
    {
        Commit storage c = commits[epochId][articleId][to];
        require(c.rawStake > 0, "nothing to release");
        uint256 amount = c.rawStake;
        c.rawStake     = 0;
        require(token.transfer(to, amount), "transfer failed");
    }

    /// @notice Slash loser stake — transferred to Rewards for redistribution.
    function slashStake(uint256 epochId, uint256 articleId, address voter)
        external onlyRewards returns (uint256 slashed)
    {
        Commit storage c = commits[epochId][articleId][voter];
        require(c.rawStake > 0, "nothing to slash");
        slashed    = c.rawStake;
        c.rawStake = 0;
        require(token.transfer(rewards, slashed), "transfer failed");
    }
}