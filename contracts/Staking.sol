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
        uint256 rawStake,
        uint64  commitTime
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
        uint64  commitTime;     // used for time-weighted bonus in Rewards
        bool    revealed;
        bool    voteTrue;       // only valid after revealed == true
        uint256 effectiveStake; // MathUtils.isqrt(rawStake), computed at reveal
    }

    ICitecoinToken   public immutable token;
    IEpochManager    public immutable epochManager;
    IArticleRegistry public immutable articleRegistry;
    address          public immutable deployer;
    address          public rewards;

    mapping(uint256 => mapping(uint256 => mapping(address => Commit))) public commits;

    mapping(uint256 => mapping(uint256 => address[]))                  internal stakerList;
    mapping(uint256 => mapping(uint256 => mapping(address => bool)))   internal hasCommitted;

    mapping(address => uint64) public firstInteraction;

    mapping(uint256 => mapping(uint256 => uint256)) public totalTrueEffStake;
    mapping(uint256 => mapping(uint256 => uint256)) public totalFalseEffStake;
    mapping(uint256 => uint256)                     public totalRawStakeByEpoch;

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
    /// @param epochId    Epoch this vote belongs to.
    /// @param articleId  Article being voted on.
    /// @param commitHash Blinded commitment to the vote.
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

        // Destructure getArticle — avoids cross-contract struct error
        (
            ,               // author
            uint256 artEpochId,
            ,               // bucketId
            ,               // contentCID
            ,               // manifestCID
            ,               // contentHash
            ,               // manifestHash
            ,               // publishedAt
            ,               // writerStake
            bool eligible
        ) = articleRegistry.getArticle(articleId);

        require(artEpochId == epochId, "article epoch mismatch");
        require(eligible,              "article ineligible");

        require(!hasCommitted[epochId][articleId][msg.sender], "already committed");
        require(rawStake > 0,             "zero stake");
        require(commitHash != bytes32(0), "empty commit");

        require(
            token.transferFrom(msg.sender, address(this), rawStake),
            "stake transfer failed"
        );

        if (firstInteraction[msg.sender] == 0) {
            firstInteraction[msg.sender] = uint64(block.timestamp);
        }

        commits[epochId][articleId][msg.sender] = Commit({
            commitHash:     commitHash,
            rawStake:       rawStake,
            commitTime:     uint64(block.timestamp),
            revealed:       false,
            voteTrue:       false,
            effectiveStake: 0
        });

        hasCommitted[epochId][articleId][msg.sender] = true;
        stakerList[epochId][articleId].push(msg.sender);
        totalRawStakeByEpoch[epochId] += rawStake;

        emit VoteCommitted(
            epochId, articleId, msg.sender,
            commitHash, rawStake, uint64(block.timestamp)
        );
    }

    // ── Phase 2: reveal ───────────────────────────────────────────────────────
    /// @notice Reveal committed vote by submitting plaintext vote + salt.
    /// @dev Contract recomputes hash and verifies against stored commitment.
    ///      effectiveStake = sqrt(rawStake) — quadratic weighting applied here.
    ///      New accounts (<10 days) receive 10% effective weight — sybil resistance.
    /// @param epochId   Epoch this vote belongs to.
    /// @param articleId Article being voted on.
    /// @param voteTrue  True = article is credible. False = not credible.
    /// @param salt      Random bytes32 used when constructing the commit hash.
    function revealVote(
        uint256 epochId,
        uint256 articleId,
        bool    voteTrue,
        bytes32 salt
    ) external {
        IEpochManager.Phase phase = epochManager.currentPhase(epochId);
        require(
            phase == IEpochManager.Phase.Staking ||
            phase == IEpochManager.Phase.Ended,
            "reveal not allowed in this phase"
        );

        Commit storage c = commits[epochId][articleId][msg.sender];
        require(c.rawStake > 0, "no commit found");
        require(!c.revealed,    "already revealed");

        // Verify preimage — wrong vote or wrong salt both fail here
        bytes32 expected = keccak256(abi.encodePacked(articleId, voteTrue, salt));
        require(expected == c.commitHash, "hash mismatch: wrong vote or salt");

        // Quadratic weighting — whale with 10000 tokens gets sqrt(10000)=100 weight
        // not 10000 weight, capping their outsized influence
        uint256 effStake = MathUtils.isqrt(c.rawStake);

        // New-account dampening — accounts under 10 days get 10% weight
        // Makes sybil attacks slow, expensive, and detectable on-chain
        // Future extension: replace with oracle-based proof of personhood
        if (_isNewAccount(msg.sender)) {
            effStake = effStake / 10;
        }

        c.revealed       = true;
        c.voteTrue       = voteTrue;
        c.effectiveStake = effStake;

        if (voteTrue) {
            totalTrueEffStake[epochId][articleId]  += effStake;
        } else {
            totalFalseEffStake[epochId][articleId] += effStake;
        }

        emit VoteRevealed(epochId, articleId, msg.sender, voteTrue, effStake);
    }

    // ── Rewards interface ─────────────────────────────────────────────────────
    /// @notice Returns all stakers for an article — Rewards iterates this for payouts.
    function getStakers(uint256 epochId, uint256 articleId)
        external view returns (address[] memory)
    {
        return stakerList[epochId][articleId];
    }

    /// @notice Returns commit fields individually — avoids cross-contract struct errors.
    /// @dev Rewards.sol destructures this return instead of using a struct type.
    function getCommit(
        uint256 epochId,
        uint256 articleId,
        address voter
    ) external view returns (
        bytes32 commitHash,
        uint256 rawStake,
        uint64  commitTime,
        bool    revealed,
        bool    voteTrue,
        uint256 effectiveStake
    ) {
        Commit storage c = commits[epochId][articleId][voter];
        return (
            c.commitHash,
            c.rawStake,
            c.commitTime,
            c.revealed,
            c.voteTrue,
            c.effectiveStake
        );
    }

    /// @notice Returns revealed vote tally for an article.
    function getTally(uint256 epochId, uint256 articleId)
        external view returns (uint256 trueWeight, uint256 falseWeight)
    {
        return (
            totalTrueEffStake[epochId][articleId],
            totalFalseEffStake[epochId][articleId]
        );
    }

    /// @notice Release stake back to voter — called by Rewards for winners.
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

    // ── Internal helpers ──────────────────────────────────────────────────────
    /// @dev True if account first interacted less than 10 days ago.
    ///      firstInteraction set on first commitVote call.
    function _isNewAccount(address account) internal view returns (bool) {
        uint64 first = firstInteraction[account];
        if (first == 0) return true;
        return block.timestamp < uint256(first) + 10 days;
    }
}