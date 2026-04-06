// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// There is another contract with a function pullFromUser
// Needs ProtocolTreasury to collect funds from this contract 
interface IProtocolTreasuryAR {
    function pullFromUser(address from, uint256 amount) external;
}

// Defines the functions that ArticleRegistry wants to use from TopicManager
interface ITopicManagerAR {
    // to check if a topic exist 
    function topicExists(uint256 topicId) external view returns (bool);
    // to check the phase of a topic
    function phase(uint256 topicId) external view returns (uint8);
    // to increase the No. of Articles for a topic
    function incrementArticleCount(uint256 topicId) external;
}

/// @title ArticleRegistry
/// @notice Handles immutable article submission and writer staking.
/// @dev This is separate from reader voting.
contract ArticleRegistry {
    // Data required for an Article 
    struct Article {
        uint256 id;
        uint256 topicId;
        address writer;
        string contentCID; // CID or hash of the article content stored off-chain
        string evidenceCID; // CID or hash of the supporting evidence bundle stored off-chain
        uint256 writerStake; // How many tokens the writer locked when submitting this article
        bool exists;
    }

    // Stores the address of Treasury and topicManager contract 
    IProtocolTreasuryAR public immutable treasury;
    ITopicManagerAR public immutable topicManager;

    // Article ID counter 
    uint256 public nextArticleId;

    // Mapping storage
    // stores articleID => articleStruct
    mapping(uint256 => Article) public articles;
    // stores topicID => list of articleIDs
    mapping(uint256 => uint256[]) public topicArticleIds;
    // stores topicID => totalWriterStake
    mapping(uint256 => uint256) public totalWriterStakeByTopic;

    // Possible errors
    error TopicNotFound();
    error WrongPhase();
    error ArticleNotFound();

    // event to emit when an Article has been submitted
    event ArticleSubmitted(
        uint256 indexed articleId,
        uint256 indexed topicId,
        address indexed writer,
        string contentCID,
        string evidenceCID,
        uint256 writerStake
    );

    // Takes in treasuryAddress and topicMangerAddress it and stores them 
    constructor(address treasuryAddress, address topicManagerAddress) {
        treasury = IProtocolTreasuryAR(treasuryAddress);
        topicManager = ITopicManagerAR(topicManagerAddress);
    }

    /// @notice Submit an immutable article during the submission phase.
    function submitArticle(
        uint256 topicId,
        string calldata contentCID,
        string calldata evidenceCID,
        uint256 writerStake
    ) external {
        // check if Topic exists
        if (!topicManager.topicExists(topicId)) revert TopicNotFound();

        // Check if topic in correct phase
        if (topicManager.phase(topicId) != 0) revert WrongPhase();

        // require the writer to stake something 
        require(writerStake > 0, "writer stake required");

        // pull stake from writer into the treasury
        treasury.pullFromUser(msg.sender, writerStake);

        // Generate articleID
        uint256 articleId = nextArticleId++;

        // Create the article and stores it 
        articles[articleId] = Article({
            id: articleId,
            topicId: topicId,
            writer: msg.sender,
            contentCID: contentCID,
            evidenceCID: evidenceCID,
            writerStake: writerStake,
            exists: true
        });

        // Add the articleID to the topic's article list 
        topicArticleIds[topicId].push(articleId);
        // Add the writer stake into the topic's writer stake 
        totalWriterStakeByTopic[topicId] += writerStake;
        // Notify the topicManager
        topicManager.incrementArticleCount(topicId);
        // emit the article submitted event 
        emit ArticleSubmitted(
            articleId,
            topicId,
            msg.sender,
            contentCID,
            evidenceCID,
            writerStake
        );
    }

    // Getter: returns all Article IDs for a topic 
    function getTopicArticleIds(uint256 topicId) external view returns (uint256[] memory) {
        return topicArticleIds[topicId];
    }

    // Getter: returns the full article struct for a given ArticleID
    function getArticle(uint256 articleId) external view returns (Article memory) {
        Article memory a = articles[articleId];
        if (!a.exists) revert ArticleNotFound();
        return a;
    }

    // Returns which Topic a given ArticleID belongs to 
    function getArticleTopic(uint256 articleId) external view returns (uint256) {
        Article storage a = articles[articleId];
        if (!a.exists) revert ArticleNotFound();
        return a.topicId;
    }

    // Returns the article writter address for a given Article 
    // Used by settlement to pay the writer
    function getArticleWriter(uint256 articleId) external view returns (address) {
        Article storage a = articles[articleId];
        if (!a.exists) revert ArticleNotFound();
        return a.writer;
    }

    // Returns how much the writer stake for the article 
    // settlement uses this 
    function getArticleWriterStake(uint256 articleId) external view returns (uint256) {
        Article storage a = articles[articleId];
        if (!a.exists) revert ArticleNotFound();
        return a.writerStake;
    }
}