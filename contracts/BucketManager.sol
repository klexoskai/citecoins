// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/ICitecoinToken.sol";

contract BucketManager {
    event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI, uint256 creationStake);
    event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
    event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount);
    event BucketDeactivated(uint256 indexed bucketId, bool creatorSlashed);

    struct Bucket {
        address creator;
        string topicURI;
        uint256 creationStake;
        uint16 feeBps;
        uint32 minArticles;
        uint256 minTotalStake;
        uint256 fundedRewards;
        bool active;
    }

    ICitecoinToken public immutable token;
    address public immutable deployer;
    address public rewards;

    uint256 public nextBucketId = 1;
    mapping(uint256 => Bucket) public buckets;

    constructor(address tokenAddress) {
        token = ICitecoinToken(tokenAddress);
        deployer = msg.sender;
    }

    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "rewards already set");
        rewards = rewardsAddress;
    }

    function createBucket(
        string calldata topicURI,
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

    /// @dev Must be called BEFORE deactivateBucket in the same finalization flow.
    function withdrawBucketFunds(uint256 bucketId, address to, uint256 amount) external onlyRewards {
        Bucket storage b = buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "amount");
        require(b.fundedRewards >= amount, "insufficient bucket funds");
        b.fundedRewards -= amount;
        require(token.transfer(to, amount), "transfer");
        emit BucketWithdrawn(bucketId, to, amount);
    }

    function deactivateBucket(
        uint256 bucketId,
        uint256 actualArticles,
        uint256 actualTotalStake
    ) external onlyRewards {
        Bucket storage b = buckets[bucketId];
        require(b.active, "already inactive");
        b.active = false;

        bool underParticipated = actualArticles < b.minArticles ||
                                 actualTotalStake < b.minTotalStake;

        if (b.creationStake > 0) {
            if (underParticipated) {
                uint256 slash = b.creationStake / 2;
                uint256 ret   = b.creationStake - slash;
                b.creationStake = 0;
                if (ret > 0)   token.transfer(b.creator, ret);
                if (slash > 0) token.burn(slash);
            } else {
                uint256 ret = b.creationStake;
                b.creationStake = 0;
                token.transfer(b.creator, ret);
            }
        }

        emit BucketDeactivated(bucketId, underParticipated);
    }

    function getBucket(uint256 bucketId) external view returns (Bucket memory) {
        return buckets[bucketId];
    }
}