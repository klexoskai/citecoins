const { expect } = require("chai");
const hre = require("hardhat");

describe("CitecoinsProtocol", function () {
  let Protocol, protocol;
  let owner;

  beforeEach(async function () {
    [owner] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(hre.ethers.parseUnits("1000000", 18));
    await protocol.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should deploy protocol", async function () {
      expect(await protocol.getAddress()).to.properAddress;
    });

    it("Should deploy and expose child contract addresses", async function () {
      expect(await protocol.token()).to.properAddress;
      expect(await protocol.buckets()).to.properAddress;
      expect(await protocol.epochs()).to.properAddress;
      expect(await protocol.articles()).to.properAddress;
      expect(await protocol.staking()).to.properAddress;
      expect(await protocol.rewards()).to.properAddress;
      expect(await protocol.repManager()).to.properAddress;
    });
  });
});
