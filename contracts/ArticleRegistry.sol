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
        string  contentCID
    );

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Article {
        address author;
        uint256 bucketId;
        uint256 epochId;
        string  contentCID;  // IPFS CID of article body
        bytes32 contentHash; // keccak256 of content — proves no retroactive edits
        uint256 writerStake; // tokens locked — slashed by Rewards if ranked out
        bool    eligible;    // false = excluded from reward distribution
    }

    IEpochManager  public immutable epochManager;
    ICitecoinToken public immutable token;
    address        public immutable deployer;
    address        public rewards;

    uint256 public constant MIN_WRITER_STAKE = 10e18;

    uint256 public nextArticleId = 1;
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
    /// @dev contentHash stored on-chain as tamper evidence —
    ///      readers can verify article content matches what was submitted.
    ///      No editArticle() exists — immutability after submission is intentional.
    /// @param epochId      Epoch this article is submitted to.
    /// @param contentCID   IPFS CID of the article body.
    /// @param contentHash  keccak256 of article content.
    /// @param writerStake  Tokens locked — slashed if ranked outside reward positions.
    function publishArticle(
        uint256 epochId,
        string  calldata contentCID,
        bytes32 contentHash,
        uint256 writerStake
    ) external returns (uint256 articleId) {
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Submission,
            "not in submission window"
        );
        require(bytes(contentCID).length > 0, "contentCID required");
        require(contentHash != bytes32(0),    "contentHash required");
        require(writerStake >= MIN_WRITER_STAKE, "stake too low");
        require(
            token.transferFrom(msg.sender, address(this), writerStake),
            "stake transfer failed"
        );

        // Read bucketId from epoch — stored on article for convenience
        (uint256 bucketId,,,,,) = epochManager.getEpoch(epochId);

        articleId = nextArticleId++;
        _articles[articleId] = Article({
            author:      msg.sender,
            bucketId:    bucketId,
            epochId:     epochId,
            contentCID:  contentCID,
            contentHash: contentHash,
            writerStake: writerStake,
            eligible:    true
        });

        epochArticles[epochId].push(articleId);

        emit ArticlePublished(articleId, bucketId, epochId, msg.sender, contentCID);
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

    // ── View helpers ──────────────────────────────────────────────────────────
    /// @notice Returns all article IDs submitted to an epoch.
    function getEpochArticles(uint256 epochId)
        external view returns (uint256[] memory)
    {
        return epochArticles[epochId];
    }

    /// @notice Returns article fields individually — avoids cross-contract struct errors.
    function getArticle(uint256 articleId)
        external view returns (
            address author,
            uint256 epochId,
            uint256 bucketId,
            string  memory contentCID,
            bytes32 contentHash,
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
            a.contentHash,
            a.writerStake,
            a.eligible
        );
    }
}