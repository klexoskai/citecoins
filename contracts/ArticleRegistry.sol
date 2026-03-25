// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./EpochManager.sol";

contract ArticleRegistry {
    event ArticlePublished(
        uint256 indexed articleId,
        uint256 indexed bucketId,
        uint256 indexed epochId,
        address author,
        string contentCID,
        string manifestCID,
        bytes32 contentHash,
        bytes32 manifestHash
    );

    struct Article {
        address author;
        uint256 bucketId;
        uint256 epochId;
        string contentCID;
        string manifestCID;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint64 publishedAt;
        bool eligible;
    }

    EpochManager public immutable epochManager;
    uint256 public nextArticleId = 1;

    mapping(uint256 => Article) public articles;
    mapping(uint256 => uint256[]) public epochArticles; // epochId => articleIds

    constructor(address epochManagerAddress) {
        epochManager = EpochManager(epochManagerAddress);
    }

    function publishArticle(
        uint256 epochId,
        string calldata contentCID,
        string calldata manifestCID,
        bytes32 contentHash,
        bytes32 manifestHash
    ) external returns (uint256 articleId) {
        EpochManager.EpochConfig memory e = epochManager.epochs(epochId);
        require(e.bucketId != 0, "epoch missing");

        uint64 ts = uint64(block.timestamp);
        require(ts >= e.submissionStart && ts <= e.submissionEnd, "not in submission");

        // minimal eligibility: manifestCID must exist (guidelines enforcement is off-chain v1)
        bool eligible = bytes(manifestCID).length != 0;

        articleId = nextArticleId++;
        articles[articleId] = Article({
            author: msg.sender,
            bucketId: e.bucketId,
            epochId: epochId,
            contentCID: contentCID,
            manifestCID: manifestCID,
            contentHash: contentHash,
            manifestHash: manifestHash,
            publishedAt: ts,
            eligible: eligible
        });

        epochArticles[epochId].push(articleId);

        emit ArticlePublished(
            articleId, e.bucketId, epochId, msg.sender, contentCID, manifestCID, contentHash, manifestHash
        );
    }

    function getEpochArticles(uint256 epochId) external view returns (uint256[] memory) {
        return epochArticles[epochId];
    }
}