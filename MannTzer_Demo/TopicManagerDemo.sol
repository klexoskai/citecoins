// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IProtocolTreasuryTM {
    function pullFromUser(address from, uint256 amount) external;
}

/// @title TopicManagerDemo
/// @notice Demo version of TopicManager with manual phase control for Remix.
contract TopicManagerDemo is Ownable {
    enum Phase {
        Submission,
        Commit,
        Reveal,
        AwaitingResolution,
        Resolved,
        Cancelled
    }

    struct Topic {
        uint256 id;
        address creator;
        string metadataCID;
        uint256 fundingPool;

        uint256 submissionDeadline;
        uint256 commitDeadline;
        uint256 revealDeadline;

        uint256 articleCount;

        bool resolved;
        bool cancelled;
        bool exists;
    }

    IProtocolTreasuryTM public immutable treasury;
    address public articleRegistry;
    address public settlement;
    uint256 public nextTopicId;

    mapping(uint256 => Topic) public topics;

    // demo controls
    bool public demoMode;
    mapping(uint256 => Phase) public demoPhase;

    error ZeroAddress();
    error InvalidDuration();
    error TopicNotFound();
    error WrongPhase();
    error Unauthorized();

    event TopicCreated(
        uint256 indexed topicId,
        address indexed creator,
        string metadataCID,
        uint256 initialFunding,
        uint256 submissionDeadline,
        uint256 commitDeadline,
        uint256 revealDeadline
    );

    event TopicFunded(uint256 indexed topicId, address indexed funder, uint256 amount);
    event TopicResolved(uint256 indexed topicId);
    event TopicCancelled(uint256 indexed topicId);
    event ArticleRegistrySet(address indexed registry);
    event SettlementSet(address indexed settlementAddress);
    event DemoModeSet(bool enabled);
    event DemoPhaseSet(uint256 indexed topicId, Phase newPhase);

    constructor(address treasuryAddress) Ownable(msg.sender) {
        if (treasuryAddress == address(0)) revert ZeroAddress();
        treasury = IProtocolTreasuryTM(treasuryAddress);
    }

    modifier onlyArticleRegistry() {
        if (msg.sender != articleRegistry) revert Unauthorized();
        _;
    }

    modifier onlySettlement() {
        if (msg.sender != settlement) revert Unauthorized();
        _;
    }

    function setArticleRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        articleRegistry = registry;
        emit ArticleRegistrySet(registry);
    }

    function setSettlement(address settlementAddress) external onlyOwner {
        if (settlementAddress == address(0)) revert ZeroAddress();
        settlement = settlementAddress;
        emit SettlementSet(settlementAddress);
    }

    // demo controls
    function setDemoMode(bool enabled) external onlyOwner {
        demoMode = enabled;
        emit DemoModeSet(enabled);
    }

    function setPhaseForDemo(uint256 topicId, Phase newPhase) external onlyOwner {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        demoPhase[topicId] = newPhase;
        emit DemoPhaseSet(topicId, newPhase);
    }

    function createTopic(
        string calldata metadataCID,
        uint256 initialFunding,
        uint256 submissionDuration,
        uint256 commitDuration,
        uint256 revealDuration
    ) external {
        if (
            submissionDuration == 0 ||
            commitDuration == 0 ||
            revealDuration == 0
        ) revert InvalidDuration();

        if (initialFunding > 0) {
            treasury.pullFromUser(msg.sender, initialFunding);
        }

        uint256 topicId = nextTopicId++;

        uint256 submissionDeadline = block.timestamp + submissionDuration;
        uint256 commitDeadline = submissionDeadline + commitDuration;
        uint256 revealDeadline = commitDeadline + revealDuration;

        topics[topicId] = Topic({
            id: topicId,
            creator: msg.sender,
            metadataCID: metadataCID,
            fundingPool: initialFunding,
            submissionDeadline: submissionDeadline,
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline,
            articleCount: 0,
            resolved: false,
            cancelled: false,
            exists: true
        });

        // helpful default for demo
        demoPhase[topicId] = Phase.Submission;

        emit TopicCreated(
            topicId,
            msg.sender,
            metadataCID,
            initialFunding,
            submissionDeadline,
            commitDeadline,
            revealDeadline
        );
    }

    function fundTopic(uint256 topicId, uint256 amount) external {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();

        Phase p = phase(topicId);
        if (p == Phase.Resolved || p == Phase.Cancelled) revert WrongPhase();

        require(amount > 0, "amount = 0");

        treasury.pullFromUser(msg.sender, amount);
        t.fundingPool += amount;

        emit TopicFunded(topicId, msg.sender, amount);
    }

    function incrementArticleCount(uint256 topicId) external onlyArticleRegistry {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        t.articleCount += 1;
    }

    function phase(uint256 topicId) public view returns (Phase) {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();

        if (t.cancelled) return Phase.Cancelled;
        if (t.resolved) return Phase.Resolved;

        if (demoMode) {
            return demoPhase[topicId];
        }

        if (block.timestamp < t.submissionDeadline) return Phase.Submission;
        if (block.timestamp < t.commitDeadline) return Phase.Commit;
        if (block.timestamp < t.revealDeadline) return Phase.Reveal;
        return Phase.AwaitingResolution;
    }

    function markResolved(uint256 topicId) external onlySettlement {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        if (phase(topicId) != Phase.AwaitingResolution) revert WrongPhase();
        t.resolved = true;
        emit TopicResolved(topicId);
    }

    function cancelTopic(uint256 topicId) external onlyOwner {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        require(!t.resolved, "already resolved");
        t.cancelled = true;
        emit TopicCancelled(topicId);
    }

    function topicExists(uint256 topicId) external view returns (bool) {
        return topics[topicId].exists;
    }

    function getFundingPool(uint256 topicId) external view returns (uint256) {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        return t.fundingPool;
    }

    function getTopicTimes(uint256 topicId)
        external
        view
        returns (
            uint256 submissionDeadline,
            uint256 commitDeadline,
            uint256 revealDeadline
        )
    {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        return (t.submissionDeadline, t.commitDeadline, t.revealDeadline);
    }

    function getTopic(uint256 topicId) external view returns (Topic memory) {
        Topic storage t = topics[topicId];
        if (!t.exists) revert TopicNotFound();
        return t;
    }
}