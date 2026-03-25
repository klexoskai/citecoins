// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";

contract BucketManager {
    event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI, uint256 creationStake);
    event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
    event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount);

    struct Bucket {
        address creator;
        string topicURI;

        uint64 epochDuration; // optional, not strictly required for explicit epochs

        uint256 creationStake;

        uint16 feeBps;         // fee applied to losing redistribution at finalize (0..10000)
        uint32 minArticles;    // participation threshold
        uint256 minTotalStake; // participation threshold

        uint256 fundedRewards; // funded tokens held by this contract for this bucket

        bool active;
    }

    ICitecoinToken public immutable token;

    /// @dev Rewards contract authorized to withdraw bucket funds for payouts.
    address public rewards;

    uint256 public nextBucketId = 1;
    mapping(uint256 => Bucket) public buckets;

    constructor(address tokenAddress) {
        token = ICitecoinToken(tokenAddress);
    }

    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    function setRewards(address rewardsAddress) external {
        // demo-simple: allow one-time set by deployer pattern.
        // For production: Ownable + onlyOwner + one-time set.
        require(rewards == address(0), "rewards already set");
        rewards = rewardsAddress;
    }

    function createBucket(
        string calldata topicURI,
        uint64 epochDuration,
        uint256 creationStake,
        uint16 feeBps,
        uint32 minArticles,
        uint256 minTotalStake
    ) external returns (uint256 bucketId) {
        require(feeBps <= 10_000, "feeBps");
        bucketId = nextBucketId++;

        if (creationStake > 0) {
            require(token.transferFrom(msg.sender, address(this), creationStake), "stake transfer");
        }

        buckets[bucketId] = Bucket({
            creator: msg.sender,
            topicURI: topicURI,
            epochDuration: epochDuration,
            creationStake: creationStake,
            feeBps: feeBps,
            minArticles: minArticles,
            minTotalStake: minTotalStake,
            fundedRewards: 0,
            active: true
        });

        emit BucketCreated(bucketId, msg.sender, topicURI, creationStake);
    }

    function fundBucket(uint256 bucketId, uint256 amount) external {
        Bucket storage b = buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "amount");
        require(token.transferFrom(msg.sender, address(this), amount), "fund transfer");
        b.fundedRewards += amount;
        emit BucketFunded(bucketId, msg.sender, amount);
    }

    /// @notice Withdraw bucket funds to a payout contract (Rewards).
    /// @dev Called only by Rewards during finalization (writer pool funding).
    function withdrawBucketFunds(uint256 bucketId, address to, uint256 amount) external onlyRewards {
        Bucket storage b = buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "amount");
        require(b.fundedRewards >= amount, "insufficient bucket funds");

        b.fundedRewards -= amount;
        require(token.transfer(to, amount), "transfer");

        emit BucketWithdrawn(bucketId, to, amount);
    }
}