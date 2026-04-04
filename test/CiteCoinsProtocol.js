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
      // ensure that protocol is deployed and has a valid address
      expect(await protocol.getAddress()).to.properAddress;
    });

    it("Should deploy and expose child contract addresses", async function () {
      // ensure that all child contracts are deployed and their addresses are exposed by the protocol + valid addresses
      expect(await protocol.token()).to.properAddress;
      expect(await protocol.buckets()).to.properAddress;
      expect(await protocol.epochs()).to.properAddress;
      expect(await protocol.articles()).to.properAddress;
      expect(await protocol.staking()).to.properAddress;
      expect(await protocol.rewards()).to.properAddress;
    });
  });
});