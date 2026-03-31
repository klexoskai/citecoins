// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IEpochManager.sol";
import "./interfaces/ICitecoinToken.sol";

contract ArticleRegistry {

    // ── Events ────────────────────────────────────────────────────────────────
    event ArticlePublished(
        uint256 indexed articleId,
        uint256 indexed bucketId,
        uint256 indexed epochId,
        address author,
        string  contentCID,
        string  manifestCID,
        bytes32 contentHash,
        bytes32 manifestHash,
        uint256 writerStake
    );
    event ArticleEligibilityUpdated(uint256 indexed articleId, bool eligible);

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Article {
        address author;
        uint256 bucketId;
        uint256 epochId;
        string  contentCID;
        string  manifestCID;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint64  publishedAt;
        uint256 writerStake;
        bool    eligible;
    }

    IEpochManager  public immutable epochManager;
    ICitecoinToken public immutable token;
    address        public immutable deployer;
    address        public rewards;

    uint256 public constant MIN_WRITER_STAKE = 10e18;

    uint256 public nextArticleId = 1;

    // internal — not public, so no auto-generated struct getter
    // cross-contract reads go through getArticle() which returns fields
    mapping(uint256 => Article)   internal _articles;
    mapping(uint256 => uint256[]) public   epochArticles;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address epochManagerAddress, address tokenAddress) {
        epochManager = IEpochManager(epochManagerAddress);
        token        = ICitecoinToken(tokenAddress);
        deployer     = msg.sender;
    }

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    // ── Wiring ────────────────────────────────────────────────────────────────
    /// @notice Called once by CitecoinsProtocol to authorise Rewards contract.
    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    // ── Core: publish article ─────────────────────────────────────────────────
    /// @notice Submit an article during the submission phase of an epoch.
    /// @dev contentHash and manifestHash stored on-chain as tamper evidence.
    ///      No editArticle() function exists — immutability is intentional.
    ///      Content lives on IPFS; only the hash commitment is on-chain.
    /// @param epochId      Epoch this article is submitted to.
    /// @param contentCID   IPFS CID of the article body.
    /// @param manifestCID  IPFS CID of the evidence manifest (must be non-empty).
    /// @param contentHash  keccak256 of article content — proves no retroactive edits.
    /// @param manifestHash keccak256 of manifest.
    /// @param writerStake  Tokens locked — slashed if ranked outside reward positions.
    function publishArticle(
        uint256  epochId,
        string   calldata contentCID,
        string   calldata manifestCID,
        bytes32  contentHash,
        bytes32  manifestHash,
        uint256  writerStake
    ) external returns (uint256 articleId) {
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Submission,
            "not in submission window"
        );
        require(bytes(manifestCID).length > 0, "manifest required");
        require(manifestHash != bytes32(0),    "manifest hash required");
        require(contentHash  != bytes32(0),    "content hash required");
        require(writerStake >= MIN_WRITER_STAKE, "stake too low");
        require(
            token.transferFrom(msg.sender, address(this), writerStake),
            "stake transfer failed"
        );

        IEpochManager.EpochConfig memory e = epochManager.getEpoch(epochId);

        articleId = nextArticleId++;
        _articles[articleId] = Article({
            author:       msg.sender,
            bucketId:     e.bucketId,
            epochId:      epochId,
            contentCID:   contentCID,
            manifestCID:  manifestCID,
            contentHash:  contentHash,
            manifestHash: manifestHash,
            publishedAt:  uint64(block.timestamp),
            writerStake:  writerStake,
            eligible:     true
        });

        epochArticles[epochId].push(articleId);

        emit ArticlePublished(
            articleId, e.bucketId, epochId, msg.sender,
            contentCID, manifestCID, contentHash, manifestHash,
            writerStake
        );
    }

    // ── Rewards interface ─────────────────────────────────────────────────────
    /// @notice Release writer stake back to author — called by Rewards on win.
    function releaseStake(uint256 articleId, address to) external onlyRewards {
        Article storage a = _articles[articleId];
        require(a.writerStake > 0, "nothing to release");
        uint256 amount = a.writerStake;
        a.writerStake  = 0;
        require(token.transfer(to, amount), "transfer failed");
    }

    /// @notice Slash writer stake — sent to Rewards for redistribution.
    function slashStake(uint256 articleId) external onlyRewards returns (uint256 slashed) {
        Article storage a = _articles[articleId];
        require(a.writerStake > 0, "nothing to slash");
        slashed       = a.writerStake;
        a.writerStake = 0;
        require(token.transfer(rewards, slashed), "transfer failed");
    }

    /// @notice Mark article ineligible — excludes from reward distribution.
    function setEligibility(uint256 articleId, bool eligible) external onlyRewards {
        _articles[articleId].eligible = eligible;
        emit ArticleEligibilityUpdated(articleId, eligible);
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    /// @notice Returns all article IDs submitted to an epoch.
    function getEpochArticles(uint256 epochId)
        external view returns (uint256[] memory)
    {
        return epochArticles[epochId];
    }

    /// @notice Count of eligible articles in an epoch.
    ///         Used by Rewards to check minArticles threshold before finalization.
    function eligibleArticleCount(uint256 epochId)
        external view returns (uint256 count)
    {
        uint256[] memory ids = epochArticles[epochId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (_articles[ids[i]].eligible) count++;
        }
    }

    /// @notice Returns article fields individually — avoids cross-contract struct errors.
    /// @dev Rewards.sol destructures this return instead of using a struct type.
    function getArticle(uint256 articleId)
        external view returns (
            address author,
            uint256 epochId,
            uint256 bucketId,
            string  memory contentCID,
            string  memory manifestCID,
            bytes32 contentHash,
            bytes32 manifestHash,
            uint64  publishedAt,
            uint256 writerStake,
            bool    eligible
        )
    {
        Article storage a = _articles[articleId];
        return (
            a.author,
            a.epochId,
            a.bucketId,
            a.contentCID,
            a.manifestCID,
            a.contentHash,
            a.manifestHash,
            a.publishedAt,
            a.writerStake,
            a.eligible
        );
    }
}