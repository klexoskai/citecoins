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
        address indexed voter,
        bytes32 commitHash,
        uint256 rawStake
    );
    event VoteRevealed(
        uint256 indexed epochId,
        uint256 indexed articleId,
        address indexed voter,
        uint256 effectiveStake
    );
    event StakeReclaimed(
        uint256 indexed epochId,
        address indexed voter,
        uint256 amount
    );

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Commit {
        bytes32 commitHash;     // keccak256(abi.encode(epochId, articleId, salt))
        uint256 rawStake;       // tokens locked at commit time
        bool    revealed;
        uint256 articleId;      // only set at reveal 
        uint256 effectiveStake; // MathUtils.isqrt(rawStake), computed at reveal
    }

    ICitecoinToken   public immutable token;
    IEpochManager    public immutable epochManager;
    IArticleRegistry public immutable articleRegistry;
    address          public immutable deployer;
    address          public rewards;

    // epochId => voter => Commit
    mapping(uint256 => mapping(address => Commit)) public commits;

    // epochId => articleId => staker addresses, iterated by Rewards at payout
    mapping(uint256 => mapping(uint256 => address[]))                  internal stakerList;
    // one commit per voter per epoch, tracks whether voter has already committed
    mapping(uint256 => mapping(address => bool)) internal hasCommitted;

    // quadratic-weighted vote totals, read by Rewards for ranking
    mapping(uint256 => mapping(uint256 => uint256)) public totalEffStake;

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
    /// @dev commitHash = keccak256(abi.encode(epochId, articleId, salt))
    ///      Vote is invisible until reveal, preventing last-minute bandwagoning.
    ///      Quadratic weighting (sqrt) is applied at reveal, not here.
    ///      One commit per voter per epoch, no topping up after committing.
    /// @param epochId    Epoch this vote belongs to.
    /// @param commitHash Blinded commitment, keccak256(abi.encode(epochId, articleId, salt)).
    /// @param rawStake   Tokens to lock, sqrt applied at reveal for effective weight.
    function commitVote(
        uint256 epochId,
        bytes32 commitHash,
        uint256 rawStake
    ) external {
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Staking,
            "not in staking window"
        );

        require(!hasCommitted[epochId][msg.sender], "already committed");

        require(rawStake   > 0,            "zero stake");
        require(commitHash != bytes32(0),  "empty commit");

        require(
            token.transferFrom(msg.sender, address(this), rawStake),
            "stake transfer failed"
        );

        commits[epochId][msg.sender] = Commit({
            commitHash:     commitHash,
            rawStake:       rawStake,
            revealed:       false,
            articleId:      0, // dummy value first, only set at reveal time
            effectiveStake: 0
        });

        // Track staker list so Rewards can iterate all voters at finalization
        hasCommitted[epochId][msg.sender] = true;
        // stakerList[epochId][articleId].push(msg.sender);

        emit VoteCommitted(epochId, msg.sender, commitHash, rawStake);
    }

    // ── Phase 2: reveal ───────────────────────────────────────────────────────
    /// @notice Reveal committed vote by submitting plaintext vote + salt.
    /// @dev Recomputes keccak256(abi.encode(epochId, articleId, salt)) and verifies it
    ///      matches the stored commitHash. Wrong articleId or wrong salt both revert.
    ///      effectiveStake = sqrt(rawStake), quadratic weighting applied here.
    ///      A whale with 10000 tokens gets sqrt(10000)=100 weight, not 10000.
    /// @param epochId   Epoch this vote belongs to.
    /// @param articleId Article being voted on.
    /// @param salt      Random bytes32 used when building the commit hash.
    function revealVote(
        uint256 epochId,
        uint256 articleId,
        bytes32 salt
    ) external {
        // Reveal only allowed after epoch ends — prevents bandwagoning on early reveals
        IEpochManager.Phase phase = epochManager.currentPhase(epochId);
        require(
            phase == IEpochManager.Phase.Ended,
            "reveal not allowed until epoch ends"
        );

        Commit storage c = commits[epochId][msg.sender];
        require(c.rawStake  > 0,  "no commit found");
        require(!c.revealed,      "already revealed");

        // Core commit-reveal verification
        // If this passes, voter definitely committed this exact vote with this salt
        // 9 fields: author, epochId, bucketId, contentCID, contentHash, manifestCID, manifestHash, writerStake, eligible
        (, uint256 artEpochId,,,,,,, bool eligible) = articleRegistry.getArticle(articleId);
        require(artEpochId == epochId, "article epoch mismatch");
        require(eligible, "article ineligible");

        bytes32 expected = keccak256(abi.encode(epochId, articleId, salt));
        require(expected == c.commitHash, "hash mismatch");

        // Quadratic weighting via MathUtils.isqrt (Babylonian method)
        uint256 effStake = MathUtils.isqrt(c.rawStake);

        c.revealed       = true;
        c.articleId      = articleId;
        c.effectiveStake = effStake;

        totalEffStake[epochId][articleId] += effStake;
        stakerList[epochId][articleId].push(msg.sender);

        emit VoteRevealed(epochId, articleId, msg.sender, effStake);
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
        address voter
    ) external view returns (
        bytes32 commitHash,
        uint256 rawStake,
        bool    revealed,
        uint256 articleId,
        uint256 effectiveStake
    ) {
        Commit storage c = commits[epochId][voter];
        return (
            c.commitHash,
            c.rawStake,
            c.revealed,
            c.articleId,
            c.effectiveStake
        );
    }

    /// @notice Quadratic-weighted vote tally for an article.
    ///         trueWeight and falseWeight are sqrt-weighted, not raw.
    function getTally(uint256 epochId, uint256 articleId)
        external view returns (uint256 supportWeight)
    {
        return totalEffStake[epochId][articleId];
    }

    /// @notice Reclaim stake for voters who committed but never revealed.
    ///         Only callable after the epoch is finalized — prevents gaming
    ///         (voter can't reclaim mid-epoch to avoid being slashed as a loser).
    function reclaimStake(uint256 epochId) external {
        (,,,,,  bool finalized) = epochManager.getEpoch(epochId);
        require(finalized, "epoch not finalized");

        Commit storage c = commits[epochId][msg.sender];
        require(c.rawStake  > 0,  "nothing to reclaim");
        require(!c.revealed,      "already revealed, use claimReader");

        uint256 amount = c.rawStake;
        c.rawStake     = 0;
        require(token.transfer(msg.sender, amount), "transfer failed");

        emit StakeReclaimed(epochId, msg.sender, amount);
    }

    /// @notice Return stake to winning voter — called by Rewards at claimReader.
    function releaseStake(uint256 epochId, uint256 articleId, address to)
        external onlyRewards
    {
        Commit storage c = commits[epochId][to];
        require(c.articleId == articleId, "voter didn't vote for this article");
        require(c.rawStake > 0, "nothing to release");
        
        uint256 amount = c.rawStake;
        c.rawStake     = 0;
        require(token.transfer(to, amount), "transfer failed");
    }

    /// @notice Slash loser stake — transferred to Rewards for redistribution.
    function slashStake(uint256 epochId, uint256 articleId, address voter)
        external onlyRewards returns (uint256 slashed)
    {
        Commit storage c = commits[epochId][voter];
        require(c.articleId == articleId, "voter didn't vote for this article");
        require(c.rawStake > 0, "nothing to slash");
        slashed    = c.rawStake;
        c.rawStake = 0;
        require(token.transfer(rewards, slashed), "transfer failed");
    }
}