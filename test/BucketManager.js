const { expect } = require("chai");
const hre = require("hardhat");

describe("BucketManager", function () {
  let Protocol, protocol;
  let token, buckets, rewards;
  let owner, user1;

  const ONE = 10n ** 18n; // represents 1 CITE token with 18 decimals
  const INITIAL_SUPPLY = 1_000_000n * ONE;

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
    it("Should successfully create a bucket", async function () {
      await expect(
        buckets.connect(owner).createBucket("ipfs://QmTestTopic")
      ).to.not.be.reverted;

      // check that all details tally up for the created bucket
      const bucket = await buckets.getBucket(1);
      expect(bucket[0]).to.equal(owner.address);
      expect(bucket[1]).to.equal("ipfs://QmTestTopic");
      expect(bucket[2]).to.equal(0);
      expect(bucket[3]).to.equal(true);
    });

    it("Should increment bucket ids", async function () {
      await buckets.createBucket("ipfs://one");
      await buckets.createBucket("ipfs://two");

      const bucket1 = await buckets.getBucket(1);
      const bucket2 = await buckets.getBucket(2);

      expect(bucket1[1]).to.equal("ipfs://one");
      expect(bucket2[1]).to.equal("ipfs://two");
    });
  });

  describe("Bucket funding", function () {
    beforeEach(async function () {
      await buckets.createBucket("ipfs://QmTestTopic");
    });

    it("Should revert funding without approval", async function () {
      const ownerBal = await token.balanceOf(owner.address);
      
      // make sure that the owner has tokens to fund the bucket
      await expect(ownerBal).to.be.gt(0n);

      await expect(
        buckets.connect(owner).fundBucket(1, 500n * ONE)
      ).to.be.reverted;
    });

    it("Should fund bucket after approval", async function () {
      const ownerBal = await token.balanceOf(owner.address);

      // make sure that the owner has tokens to fund the bucket
      await expect(ownerBal).to.be.gt(0n);

      // approve BucketManager to spend owner's tokens and fund the bucket
      await token.connect(owner).approve(await buckets.getAddress(), 500n * ONE);

      await expect(
        buckets.connect(owner).fundBucket(1, 500n * ONE)
      ).to.not.be.reverted;

      const bucket = await buckets.getBucket(1);
      expect(bucket[2]).to.equal(500n * ONE);
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        buckets.connect(owner).fundBucket(1, 0)
      ).to.be.revertedWith("zero amount");
    });
  });
});