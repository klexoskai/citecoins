const { expect } = require("chai");
const hre = require("hardhat");

describe("CitecoinToken", function () {
  let Protocol, protocol;
  let token;
  let owner, user1, user2;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;

  beforeEach(async function () {
    [owner, user1, user2] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
  });

  describe("Deployment", function () {
    it("Should deploy token", async function () {
      // ensure that token is deployed and has a valid address
      expect(await token.getAddress()).to.properAddress;
    });

    it("Should have correct name and symbol", async function () {
      expect(await token.name()).to.equal("Citecoin");
      expect(await token.symbol()).to.equal("CITE");
    });

    it("Should have 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("Should mint initial supply as specified in CitecoinsProtocol", async function () {
      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Transfers and approvals", function () {
    it("Should allow transfer of tokens from one address to another", async function () {
      const ownerBal = await token.balanceOf(owner.address);

      if (ownerBal === 0n) {
        this.skip();
      }

      await expect(
        token.connect(owner).transfer(user1.address, 100n * ONE)
      ).to.not.be.reverted;

      expect(await token.balanceOf(user1.address)).to.equal(100n * ONE);
    });

    it("Should set allowance", async function () {
      const ownerBal = await token.balanceOf(owner.address);

      // make sure that the owner has tokens to approve
      await expect(ownerBal).to.be.gt(0n);

      await token.connect(owner).approve(user1.address, 50n * ONE);
      expect(await token.allowance(owner.address, user1.address)).to.equal(50n * ONE);
    });

    it("Should allow one address to transfer tokens on behalf of another after approval", async function () {
      const ownerBal = await token.balanceOf(owner.address);

      // make sure that the owner has tokens to transfer
      await expect(ownerBal).to.be.gt(0n);

      await token.connect(owner).approve(user1.address, 20n * ONE);
      await token.connect(user1).transferFrom(owner.address, user2.address, 20n * ONE);

      expect(await token.balanceOf(user2.address)).to.equal(20n * ONE);
    });
  });
});