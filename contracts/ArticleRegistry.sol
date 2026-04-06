// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IEpochManager.sol";
import "./interfaces/ICitecoinToken.sol";

contract ArticleRegistry {

    event ArticlePublished(
        uint256 indexed articleId,
        uint256 indexed bucketId,
        uint256 indexed epochId,
        address author,
        string  contentCID
    );

    struct Article {
        address author;
        uint256 bucketId;
        uint256 epochId;
        string  contentCID;   // IPFS CID of article body
        bytes32 contentHash;  // keccak256 of content, proves no retroactive edits
        string  manifestCID;  // IPFS CID of evidence manifest (sources, media, citations)
        bytes32 manifestHash; // keccak256 of manifest, proves no retroactive edits
        uint256 writerStake;  // tokens locked, slashed by Rewards if ranked out
        bool    eligible;     // false = excluded from reward distribution
    }

    IEpochManager  public immutable epochManager;
    ICitecoinToken public immutable token;
    address        public immutable deployer;
    address        public rewards;

    uint256 public constant MIN_WRITER_STAKE = 10e18;

    uint256 public nextArticleId = 1;
    mapping(uint256 => Article)   internal _articles;
    mapping(uint256 => uint256[]) public   epochArticles;

    constructor(address epochManagerAddress, address tokenAddress) {
        epochManager = IEpochManager(epochManagerAddress);
        token        = ICitecoinToken(tokenAddress);
        deployer     = msg.sender;
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

    function publishArticle(
        uint256 epochId,
        string  calldata contentCID,
        bytes32 contentHash,
        string  calldata manifestCID,
        bytes32 manifestHash,
        uint256 writerStake
    ) external returns (uint256 articleId) {
        require(
            epochManager.currentPhase(epochId) == IEpochManager.Phase.Submission,
            "not in submission window"
        );
        require(bytes(contentCID).length  > 0, "contentCID required");
        require(contentHash  != bytes32(0),    "contentHash required");
        require(bytes(manifestCID).length > 0, "manifestCID required");
        require(manifestHash != bytes32(0),    "manifestHash required");
        require(writerStake >= MIN_WRITER_STAKE, "stake too low");
        require(
            token.transferFrom(msg.sender, address(this), writerStake),
            "stake transfer failed"
        );

        // Read bucketId from epoch — stored on article for convenience
        (uint256 bucketId,,,,,) = epochManager.getEpoch(epochId);

        articleId = nextArticleId++;
        _articles[articleId] = Article({
            author:       msg.sender,
            bucketId:     bucketId,
            epochId:      epochId,
            contentCID:   contentCID,
            contentHash:  contentHash,
            manifestCID:  manifestCID,
            manifestHash: manifestHash,
            writerStake:  writerStake,
            eligible:     true
        });

        epochArticles[epochId].push(articleId);

        emit ArticlePublished(articleId, bucketId, epochId, msg.sender, contentCID);
    }

    function releaseStake(uint256 articleId, address to) external onlyRewards {
        Article storage a = _articles[articleId];
        require(a.writerStake > 0, "nothing to release");
        uint256 amount = a.writerStake;
        a.writerStake  = 0;
        require(token.transfer(to, amount), "transfer failed");
    }

    function slashStake(uint256 articleId) external onlyRewards returns (uint256 slashed) {
        Article storage a = _articles[articleId];
        require(a.writerStake > 0, "nothing to slash");
        slashed       = a.writerStake;
        a.writerStake = 0;
        require(token.transfer(rewards, slashed), "transfer failed");
    }

    function getEpochArticles(uint256 epochId)
        external view returns (uint256[] memory)
    {
        return epochArticles[epochId];
    }

    function getArticle(uint256 articleId)
        external view returns (
            address author,
            uint256 epochId,
            uint256 bucketId,
            string  memory contentCID,
            bytes32 contentHash,
            string  memory manifestCID,
            bytes32 manifestHash,
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
            a.manifestCID,
            a.manifestHash,
            a.writerStake,
            a.eligible
        );
    }
}
