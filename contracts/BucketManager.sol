// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./interfaces/ICitecoinToken.sol";

contract BucketManager {
    event BucketCreated(
        uint256 indexed bucketId,
        address indexed creator,
        string topicURI
    );
    event BucketFunded(
        uint256 indexed bucketId,
        address indexed funder,
        uint256 amount
    );
    event BucketWithdrawn(
        uint256 indexed bucketId,
        address indexed to,
        uint256 amount
    );
    event BucketDeactivated(uint256 indexed bucketId);
    event BucketStakeSlashed(
        uint256 indexed bucketId,
        address indexed creator,
        uint256 amount
    );
    event BucketStakeReleased(
        uint256 indexed bucketId,
        address indexed creator,
        uint256 amount
    );

    struct Bucket {
        address creator;
        string topicURI;
        uint256 fundedRewards;
        uint256 creatorStake; // locked at creation, slashed on low participation
        bool active;
    }

    // flat 5% fee on losing reader stakes
    uint16 public constant FEE_BPS = 500;
    uint256 public constant MIN_BUCKET_STAKE = 100e18;

    ICitecoinToken public immutable token;
    address public immutable deployer;
    address public rewards;

    uint256 public nextBucketId = 1;
    mapping(uint256 => Bucket) internal _buckets;

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

    // Creator stakes MIN_BUCKET_STAKE to deter low-quality topics.
    // Stake is returned at finalization if ≥2 articles get reader support, slashed otherwise.
    function createBucket(
        string calldata topicURI,
        uint256 stakeAmount
    ) external returns (uint256 bucketId) {
        require(stakeAmount >= MIN_BUCKET_STAKE, "stake too low");
        require(
            token.transferFrom(msg.sender, address(this), stakeAmount),
            "stake transfer failed"
        );

        bucketId = nextBucketId++;
        _buckets[bucketId] = Bucket({
            creator: msg.sender,
            topicURI: topicURI,
            fundedRewards: 0,
            creatorStake: stakeAmount,
            active: true
        });

        emit BucketCreated(bucketId, msg.sender, topicURI);
    }

    /// @notice Create bucket using whole CITE units instead of wei.
    function createBucketCITE(
        string calldata topicURI,
        uint256 stakeAmount_CITE
    ) external returns (uint256 bucketId) {
        uint256 stakeAmount = stakeAmount_CITE * 1e18;
        require(stakeAmount >= MIN_BUCKET_STAKE, "stake too low");
        require(
            token.transferFrom(msg.sender, address(this), stakeAmount),
            "stake transfer failed"
        );

        bucketId = nextBucketId++;
        _buckets[bucketId] = Bucket({
            creator: msg.sender,
            topicURI: topicURI,
            fundedRewards: 0,
            creatorStake: stakeAmount,
            active: true
        });

        emit BucketCreated(bucketId, msg.sender, topicURI);
    }
    
    function fundBucket(uint256 bucketId, uint256 amount) external {
        Bucket storage b = _buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "zero amount");
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "fund transfer failed"
        );
        b.fundedRewards += amount;
        emit BucketFunded(bucketId, msg.sender, amount);
    }

    /// @notice Fund bucket using whole CITE units instead of wei.
    function fundBucketCITE(uint256 bucketId, uint256 amount_CITE) external {
        uint256 amount = amount_CITE * 1e18;
        Bucket storage b = _buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "zero amount");
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "fund transfer failed"
        );
        b.fundedRewards += amount;
        emit BucketFunded(bucketId, msg.sender, amount);
    }

    // Must be called before deactivateBucket — deactivation sets active=false and would block this.
    function withdrawBucketFunds(
        uint256 bucketId,
        address to,
        uint256 amount
    ) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active, "bucket inactive");
        require(amount > 0, "zero amount");
        require(b.fundedRewards >= amount, "insufficient bucket funds");
        b.fundedRewards -= amount;
        require(token.transfer(to, amount), "transfer failed");
        emit BucketWithdrawn(bucketId, to, amount);
    }

    function deactivateBucket(uint256 bucketId) external onlyRewards {
        Bucket storage b = _buckets[bucketId];
        require(b.active, "already inactive");
        b.active = false;

        if (b.creatorStake > 0) {
            uint256 amount = b.creatorStake;
            b.creatorStake = 0;
            require(token.transfer(b.creator, amount), "stake release failed");
            emit BucketStakeReleased(bucketId, b.creator, amount);
        }

        emit BucketDeactivated(bucketId);
    }

    function slashBucketStake(
        uint256 bucketId
    ) external onlyRewards returns (uint256 slashed) {
        Bucket storage b = _buckets[bucketId];
        require(b.creatorStake > 0, "nothing to slash");
        slashed = b.creatorStake;
        b.creatorStake = 0;
        b.active = false;
        require(token.transfer(rewards, slashed), "transfer failed");
        emit BucketStakeSlashed(bucketId, b.creator, slashed);
        emit BucketDeactivated(bucketId);
    }

    function getBucket(
        uint256 bucketId
    )
        external
        view
        returns (
            address creator,
            string memory topicURI,
            uint256 fundedRewards,
            uint256 creatorStake,
            bool active
        )
    {
        Bucket storage b = _buckets[bucketId];
        return (
            b.creator,
            b.topicURI,
            b.fundedRewards,
            b.creatorStake,
            b.active
        );
    }
}
