const { expect } = require("chai");
const hre = require("hardhat");

describe("EpochManager", function () {
  let Protocol, protocol;
  let token, buckets, epochs;
  let owner;

  const ONE = 10n ** 18n; // represents 1 token with 18 decimals
  const INITIAL_SUPPLY = 1_000_000n * ONE;

  beforeEach(async function () {
    [owner] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());

    await buckets.createBucket("ipfs://QmTestTopic");
  });

  async function latestTime() {
    const block = await hre.ethers.provider.getBlock("latest");
    return block.timestamp;
  }

  async function increaseTime(seconds) {
    await hre.network.provider.send("evm_increaseTime", [seconds]);
    await hre.network.provider.send("evm_mine");
  }

  describe("Epoch creation", function () {
    it("Should create an epoch for an active bucket", async function () {
      const now = await latestTime();

      await expect(
        epochs.createEpoch(1, now + 60, now + 120, now + 120, now + 240)
      ).to.not.be.reverted;
    });

    it("Should report correct phases over time", async function () {
      const now = await latestTime();

      await epochs.createEpoch(1, now + 60, now + 120, now + 120, now + 240);

      expect(await epochs.currentPhase(1)).to.equal(0);

      await increaseTime(61);
      expect(await epochs.currentPhase(1)).to.equal(1);

      await increaseTime(61);
      expect(await epochs.currentPhase(1)).to.equal(2);

      await increaseTime(121);
      expect(await epochs.currentPhase(1)).to.equal(3);
    });
  });
});