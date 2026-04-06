// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";

contract BucketManager {

    // ── Events ────────────────────────────────────────────────────────────────
    event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI);
    event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
    event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount);
    event BucketDeactivated(uint256 indexed bucketId);

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Bucket {
        address creator;
        string  topicURI;
        uint256 fundedRewards;
        bool    active;
    }

    // MVP: flat 5% fee, no per-bucket config needed
    uint16 public constant FEE_BPS = 500;

    ICitecoinToken public immutable token;
    address        public immutable deployer;
    address        public rewards;

    uint256 public nextBucketId = 1;
    mapping(uint256 => Bucket) internal _buckets;

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address tokenAddress) {
        token    = ICitecoinToken(tokenAddress);
        deployer = msg.sender;
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
        require(rewards == address(0), "rewards already set");
        rewards = rewardsAddress;
    }

    // ── Core: create bucket ───────────────────────────────────────────────────
    /// @notice Create a topic bucket.
    ///         Anyone can create a bucket — permissionless topic creation.
    /// @param topicURI IPFS URI pointing to the full topic description and guidelines.
    function createBucket(
        string calldata topicURI
    ) external returns (uint256 bucketId) {
        bucketId = nextBucketId++;

        _buckets[bucketId] = Bucket({
            creator:       msg.sender,
            topicURI:      topicURI,
            fundedRewards: 0,
            active:        true
        });

        emit BucketCreated(bucketId, msg.sender, topicURI);
    }

    // ── Core: fund bucket ─────────────────────────────────────────────────────
    /// @notice Add tokens to a bucket's reward pool.
    ///         Callable by anyone — NGOs, DAOs, individuals.
    ///         Funds held here until Rewards pulls them at finalization.
    function fundBucket(uint256 bucketId, uint256 amount) external {
        Bucket storage b = _buckets[bucketId];
        require(b.active,   "bucket inactive");
        require(amount > 0, "zero amount");
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "fund transfer failed"
        );
        b.fundedRewards += amount;
        emit BucketFunded(bucketId, msg.sender, amount);
    }

    // ── Rewards interface ─────────────────────────────────────────────────────
    /// @notice Pull funds from bucket into Rewards for writer payouts.
    /// @dev Must be called BEFORE deactivateBucket —
    ///      deactivateBucket sets active=false which blocks this call.
    function withdrawBucketFunds(
        uint256 bucketId,
        address to,
        uint256 amount
    ) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active,                  "bucket inactive");
        require(amount > 0,                "zero amount");
        require(b.fundedRewards >= amount, "insufficient bucket funds");
        b.fundedRewards -= amount;
        require(token.transfer(to, amount), "transfer failed");
        emit BucketWithdrawn(bucketId, to, amount);
    }

    /// @notice Deactivate bucket at end of epoch.
    /// @dev MVP: no creator stake, no slash logic — just marks inactive.
    ///      Called by Rewards as final step of finalization.
    function deactivateBucket(uint256 bucketId) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active, "already inactive");
        b.active = false;
        emit BucketDeactivated(bucketId);
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    /// @notice Returns bucket fields individually — avoids cross-contract struct errors.
    function getBucket(uint256 bucketId) external view returns (
        address creator,
        string  memory topicURI,
        uint256 fundedRewards,
        bool    active
    ) {
        Bucket storage b = _buckets[bucketId];
        return (
            b.creator,
            b.topicURI,
            b.fundedRewards,
            b.active
        );
    }
}