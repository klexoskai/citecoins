const { expect } = require("chai");
const hre = require("hardhat");

describe("BucketManager", function () {
  let Protocol, protocol;
  let token, buckets, rewards;
  let owner, user1;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const BUCKET_STAKE = 100n * ONE;

  beforeEach(async function () {
    [owner, user1] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());
  });

  describe("Bucket creation", function () {
    it("Should successfully create a bucket with stake", async function () {
      await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE);
      await expect(
        buckets.connect(owner).createBucket("ipfs://QmTestTopic", BUCKET_STAKE)
      ).to.not.be.reverted;

      const bucket = await buckets.getBucket(1);
      expect(bucket[0]).to.equal(owner.address);  // creator
      expect(bucket[1]).to.equal("ipfs://QmTestTopic"); // topicURI
      expect(bucket[2]).to.equal(0);              // fundedRewards
      expect(bucket[3]).to.equal(BUCKET_STAKE);   // creatorStake
      expect(bucket[4]).to.equal(true);           // active
    });

    it("Should revert creation without stake approval", async function () {
      await expect(
        buckets.connect(owner).createBucket("ipfs://QmTestTopic", BUCKET_STAKE)
      ).to.be.reverted;
    });

    it("Should revert if stake is below minimum", async function () {
      await token.connect(owner).approve(await buckets.getAddress(), 1n * ONE);
      await expect(
        buckets.connect(owner).createBucket("ipfs://QmTestTopic", 1n * ONE)
      ).to.be.revertedWith("stake too low");
    });

    it("Should increment bucket ids", async function () {
      await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE * 2n);
      await buckets.createBucket("ipfs://one", BUCKET_STAKE);
      await buckets.createBucket("ipfs://two", BUCKET_STAKE);

      const bucket1 = await buckets.getBucket(1);
      const bucket2 = await buckets.getBucket(2);

      expect(bucket1[1]).to.equal("ipfs://one");
      expect(bucket2[1]).to.equal("ipfs://two");
    });
  });

  describe("Bucket funding", function () {
    beforeEach(async function () {
      await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE);
      await buckets.createBucket("ipfs://QmTestTopic", BUCKET_STAKE);
    });

    it("Should revert funding without approval", async function () {
      await expect(
        buckets.connect(owner).fundBucket(1, 500n * ONE)
      ).to.be.reverted;
    });

    it("Should fund bucket after approval", async function () {
      await token.connect(owner).approve(await buckets.getAddress(), 500n * ONE);
      await expect(
        buckets.connect(owner).fundBucket(1, 500n * ONE)
      ).to.not.be.reverted;

      const bucket = await buckets.getBucket(1);
      expect(bucket[2]).to.equal(500n * ONE); // fundedRewards
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        buckets.connect(owner).fundBucket(1, 0)
      ).to.be.revertedWith("zero amount");
    });
  });
});