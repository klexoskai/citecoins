// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Knows about Treasury and needs the pullFromUser function from it
interface IProtocolTreasuryCRV {
    function pullFromUser(address from, uint256 amount) external;
}

// Knows about TopicManager and needs the phase function from it
interface ITopicManagerCRV {
    function phase(uint256 topicId) external view returns (uint8);
}

// Knows about articleRegistry and needs the getArticleTopic function from it
interface IArticleRegistryCRV {
    function getArticleTopic(uint256 articleId) external view returns (uint256);
}

/// @title CommitRevealVoting
/// @notice Handles hidden voting using a commit-reveal scheme.
/// @dev Readers lock stake during commit phase, then reveal their chosen article later.
///      Commitment hash format:
///      keccak256(abi.encodePacked(topicId, articleId, amount, salt, voter))
contract CommitRevealVoting {
    // data structure for a Commitment 
    struct Commitment {
        bytes32 commitmentHash;
        uint256 amount;
        uint256 commitTimestamp;
        bool revealed;
        bool exists;
    }

    // data structure of a revealed version of a vote
    struct RevealedVote {
        uint256 articleId;
        uint256 amount;
        uint256 commitTimestamp;
        bool exists;
    }

    // address of other contracts 
    IProtocolTreasuryCRV public immutable treasury;
    ITopicManagerCRV public immutable topicManager;
    IArticleRegistryCRV public immutable articleRegistry;

    // topicId => (voter => commitment)
    mapping(uint256 => mapping(address => Commitment)) public commitments;

    // topicId => (voter => revealed vote)
    mapping(uint256 => mapping(address => RevealedVote)) public revealedVotes;

    // topicId => (articleId => total revealed stake)
    mapping(uint256 => mapping(uint256 => uint256)) public totalRevealedStakeByArticle;

    // topicId => total committed stake
    mapping(uint256 => uint256) public totalCommittedStakeByTopic;

    // topicId => total revealed stake
    mapping(uint256 => uint256) public totalRevealedStakeByTopic;

    // topicId => (articleId => number of revealed voters)
    mapping(uint256 => mapping(uint256 => uint256)) public revealedVoterCountByArticle;

    // topicId => (articleId => list of revealed voters)
    mapping(uint256 => mapping(uint256 => address[])) private articleVoters;

    // custom errors
    error WrongPhase();
    error AlreadyCommitted();
    error CommitmentNotFound();
    error AlreadyRevealed();
    error InvalidReveal();

    // custom events 
    event VoteCommitted(
        uint256 indexed topicId,
        address indexed voter,
        bytes32 commitmentHash,
        uint256 amount
    );

    event VoteRevealed(
        uint256 indexed topicId,
        uint256 indexed articleId,
        address indexed voter,
        uint256 amount
    );

    // Receives the treasury, topicManager and articleRegistry address as stores them as interface type
    constructor(
        address treasuryAddress,
        address topicManagerAddress,
        address articleRegistryAddress
    ) {
        treasury = IProtocolTreasuryCRV(treasuryAddress);
        topicManager = ITopicManagerCRV(topicManagerAddress);
        articleRegistry = IArticleRegistryCRV(articleRegistryAddress);
    }

    /// Commit a hidden vote and lock stake during the commit phase.
    function commitVote(
        uint256 topicId,
        bytes32 commitmentHash,
        uint256 amount
    ) external {
        // amount staked must be greater than 0
        require(amount > 0, "amount = 0");

        // make sure topicManager is in the committment phase
        if (topicManager.phase(topicId) != 1) revert WrongPhase();

        // check that user has not committed yet
        Commitment storage c = commitments[topicId][msg.sender];
        if (c.exists) revert AlreadyCommitted();

        // pull the token from user
        treasury.pullFromUser(msg.sender, amount);

        // store the committment
        commitments[topicId][msg.sender] = Commitment({
            commitmentHash: commitmentHash,
            amount: amount,
            commitTimestamp: block.timestamp,
            revealed: false,
            exists: true
        });

        // update total committed stake 
        totalCommittedStakeByTopic[topicId] += amount;

        // emit event that a vote has been committed
        emit VoteCommitted(topicId, msg.sender, commitmentHash, amount);
    }

    /// Reveal the committed vote during the reveal phase.
    /// topicId Topic ID
    /// articleId Chosen article ID
    /// salt Random salt used when computing the original commitment hash
    function revealVote(
        uint256 topicId,
        uint256 articleId,
        bytes32 salt
    ) external {
        // Check that topic is in reveal phase 
        if (topicManager.phase(topicId) != 2) revert WrongPhase();

        // ensure that user actually committed previously and has no revealed yet
        Commitment storage c = commitments[topicId][msg.sender];
        if (!c.exists) revert CommitmentNotFound();
        if (c.revealed) revert AlreadyRevealed();

        // check article belongs to the topic
        uint256 realTopicId = articleRegistry.getArticleTopic(articleId);
        require(realTopicId == topicId, "article not in topic");

        // recompute expected hash
        bytes32 expected = keccak256(
            abi.encodePacked(topicId, articleId, c.amount, salt, msg.sender)
        );

        // check if it matches the hash that was submitted earlier 
        if (expected != c.commitmentHash) revert InvalidReveal();

        // mark the committement as revealed 
        c.revealed = true;

        // store the revealed vote 
        revealedVotes[topicId][msg.sender] = RevealedVote({
            articleId: articleId,
            amount: c.amount,
            commitTimestamp: c.commitTimestamp,
            exists: true
        });

        // Update the article/ topic totals 
        totalRevealedStakeByArticle[topicId][articleId] += c.amount;
        totalRevealedStakeByTopic[topicId] += c.amount;
        revealedVoterCountByArticle[topicId][articleId] += 1;
        articleVoters[topicId][articleId].push(msg.sender);

        // emit the vote revealed event
        emit VoteRevealed(topicId, articleId, msg.sender, c.amount);
    }

    // returns the list of revealed support for a given trade 
    function getArticleVoters(
        uint256 topicId,
        uint256 articleId
    ) external view returns (address[] memory) {
        return articleVoters[topicId][articleId];
    }

    // returns the full committment record for the user in a topic 
    function getUserCommitment(
        uint256 topicId,
        address user
    ) external view returns (Commitment memory) {
        return commitments[topicId][user];
    }

    // returns the revealed vote record for a user in a topic 
    function getUserRevealedVote(
        uint256 topicId,
        address user
    ) external view returns (RevealedVote memory) {
        return revealedVotes[topicId][user];
    }
}