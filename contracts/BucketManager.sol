// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";

contract BucketManager {

    // ── Events ────────────────────────────────────────────────────────────────
    event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI, uint256 creationStake);
    event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
    event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount);
    event BucketDeactivated(uint256 indexed bucketId, bool creatorSlashed);

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Bucket {
        address creator;
        string  topicURI;
        uint256 creationStake;
        uint16  feeBps;
        uint32  minArticles;
        uint256 minTotalStake;
        uint256 fundedRewards;
        bool    active;
    }

    ICitecoinToken public immutable token;
    address        public immutable deployer;
    address        public rewards;

    uint256 public nextBucketId = 1;

    // internal — cross-contract reads go through getBucket() which returns fields
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
    /// @notice Create a topic bucket with a reward pool.
    /// @dev Creator stake is held in contract and slashed if participation thresholds not met.
    /// @param topicURI      IPFS URI pointing to the full topic description and guidelines.
    /// @param creationStake Tokens locked by creator — returned if thresholds met, slashed if not.
    /// @param feeBps        Fee taken from losing reader stakes at finalization (0–10000).
    /// @param minArticles   Minimum articles required to avoid creator stake slash.
    /// @param minTotalStake Minimum total reader stake required to avoid creator stake slash.
    function createBucket(
        string calldata topicURI,
        uint256 creationStake,
        uint16  feeBps,
        uint32  minArticles,
        uint256 minTotalStake
    ) external returns (uint256 bucketId) {
        require(feeBps <= 10_000, "feeBps exceeds 100%");
        bucketId = nextBucketId++;

        if (creationStake > 0) {
            require(
                token.transferFrom(msg.sender, address(this), creationStake),
                "stake transfer failed"
            );
        }

        _buckets[bucketId] = Bucket({
            creator:       msg.sender,
            topicURI:      topicURI,
            creationStake: creationStake,
            feeBps:        feeBps,
            minArticles:   minArticles,
            minTotalStake: minTotalStake,
            fundedRewards: 0,
            active:        true
        });

        emit BucketCreated(bucketId, msg.sender, topicURI, creationStake);
    }

    // ── Core: fund bucket ─────────────────────────────────────────────────────
    /// @notice Add tokens to a bucket's reward pool.
    /// @dev Callable by anyone — NGOs, DAOs, individuals.
    ///      Funds are held here until Rewards pulls them at finalization.
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
    /// @notice Pull funds from bucket into Rewards contract for writer payouts.
    /// @dev Must be called BEFORE deactivateBucket in the finalization flow —
    ///      deactivateBucket sets active=false which would block this call.
    function withdrawBucketFunds(
        uint256 bucketId,
        address to,
        uint256 amount
    ) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active,                    "bucket inactive");
        require(amount > 0,                  "zero amount");
        require(b.fundedRewards >= amount,   "insufficient bucket funds");
        b.fundedRewards -= amount;
        require(token.transfer(to, amount),  "transfer failed");
        emit BucketWithdrawn(bucketId, to, amount);
    }

    /// @notice Deactivate bucket at end of epoch.
    ///         Slashes creator stake if participation thresholds not met.
    /// @dev Called by Rewards as final step of finalization, AFTER withdrawBucketFunds.
    /// @param actualArticles   Eligible article count observed by Rewards.
    /// @param actualTotalStake Total raw reader stake observed by Rewards.
    function deactivateBucket(
        uint256 bucketId,
        uint256 actualArticles,
        uint256 actualTotalStake
    ) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active, "already inactive");
        b.active = false;

        bool underParticipated = actualArticles   < b.minArticles ||
                                 actualTotalStake < b.minTotalStake;

        if (b.creationStake > 0) {
            if (underParticipated) {
                // Slash half — burn it, return the rest to creator
                uint256 slash = b.creationStake / 2;
                uint256 ret   = b.creationStake - slash;
                b.creationStake = 0;
                if (ret   > 0) token.transfer(b.creator, ret);
                if (slash > 0) token.burn(address(this), slash);
            } else {
                // Full return — participation was healthy
                uint256 ret = b.creationStake;
                b.creationStake = 0;
                token.transfer(b.creator, ret);
            }
        }

        emit BucketDeactivated(bucketId, underParticipated);
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    /// @notice Returns bucket fields individually — avoids cross-contract struct errors.
    /// @dev Rewards.sol and EpochManager.sol destructure this return.
    function getBucket(uint256 bucketId) external view returns (
        address creator,
        string  memory topicURI,
        uint256 creationStake,
        uint16  feeBps,
        uint32  minArticles,
        uint256 minTotalStake,
        uint256 fundedRewards,
        bool    active
    ) {
        Bucket storage b = _buckets[bucketId];
        return (
            b.creator,
            b.topicURI,
            b.creationStake,
            b.feeBps,
            b.minArticles,
            b.minTotalStake,
            b.fundedRewards,
            b.active
        );
    }
}