// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";
import "./interfaces/IEpochManager.sol";
import "./interfaces/IArticleRegistry.sol";
import "./interfaces/IReputationManager.sol";
import "./libraries/MathUtils.sol";

contract Staking {

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

    struct Commit {
        bytes32 commitHash;     // keccak256(abi.encode(epochId, articleId, salt))
        uint256 rawStake;       // tokens locked at commit time
        bool    revealed;
        uint256 articleId;      // only set at reveal
        uint256 effectiveStake; // sqrt(rep * rawStake), computed at reveal
    }

    ICitecoinToken      public immutable token;
    IEpochManager       public immutable epochManager;
    IArticleRegistry    public immutable articleRegistry;
    IReputationManager  public immutable reputationManager;
    address             public immutable deployer;
    address             public rewards;

    // epochId => voter => Commit
    mapping(uint256 => mapping(address => Commit)) public commits;

    // epochId => articleId => staker addresses, iterated by Rewards at payout
    mapping(uint256 => mapping(uint256 => address[]))        internal stakerList;
    mapping(uint256 => mapping(address => bool))             internal hasCommitted;

    // quadratic-weighted vote totals, read by Rewards for ranking
    mapping(uint256 => mapping(uint256 => uint256)) public totalEffStake;

    constructor(
        address tokenAddress,
        address epochManagerAddress,
        address articleRegistryAddress,
        address reputationManagerAddress
    ) {
        token              = ICitecoinToken(tokenAddress);
        epochManager       = IEpochManager(epochManagerAddress);
        articleRegistry    = IArticleRegistry(articleRegistryAddress);
        reputationManager  = IReputationManager(reputationManagerAddress);
        deployer           = msg.sender;
    }

    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    // commitHash = keccak256(abi.encode(epochId, articleId, salt))
    // Vote is invisible until reveal, preventing last-minute bandwagoning.
    // One commit per voter per epoch; quadratic weighting (sqrt) applied at reveal.
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
            articleId:      0,
            effectiveStake: 0
        });

        hasCommitted[epochId][msg.sender] = true;

        emit VoteCommitted(epochId, msg.sender, commitHash, rawStake);
    }

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
        (, uint256 artEpochId,,,,,,, bool eligible) = articleRegistry.getArticle(articleId);
        require(artEpochId == epochId, "article epoch mismatch");
        require(eligible, "article ineligible");

        bytes32 expected = keccak256(abi.encode(epochId, articleId, salt));
        require(expected == c.commitHash, "hash mismatch");

        // Reputation-weighted quadratic: effectiveStake = sqrt(rep * rawStake)
        // rep = 1 for new voters; increases by 1 per winning epoch, decreases by 1 per loss (floor 1)
        // Using sqrt(rep * stake) keeps scaling in the quadratic family — rep dampened by sqrt
        uint256 rep      = reputationManager.effectiveRep(msg.sender);
        uint256 effStake = MathUtils.isqrt(rep * c.rawStake);

        c.revealed       = true;
        c.articleId      = articleId;
        c.effectiveStake = effStake;

        totalEffStake[epochId][articleId] += effStake;
        stakerList[epochId][articleId].push(msg.sender);

        emit VoteRevealed(epochId, articleId, msg.sender, effStake);
    }

    function getStakers(uint256 epochId, uint256 articleId)
        external view returns (address[] memory)
    {
        return stakerList[epochId][articleId];
    }

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

    function getTally(uint256 epochId, uint256 articleId)
        external view returns (uint256 supportWeight)
    {
        return totalEffStake[epochId][articleId];
    }

    // Only callable after finalization — prevents reclaiming mid-epoch to avoid loser slashing.
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
