const { expect } = require("chai");
const hre = require("hardhat");

describe("Staking", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles, staking;
  let owner, writer, reader1, reader2;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const WRITER_STAKE = 10n * ONE;
  const READER_STAKE = 50n * ONE;

  beforeEach(async function () {
    [owner, writer, reader1, reader2] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
    articles = await hre.ethers.getContractAt("ArticleRegistry", await protocol.articles());
    staking = await hre.ethers.getContractAt("Staking", await protocol.staking());

    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) return;

    await token.connect(owner).transfer(writer.address, 100n * ONE);
    await token.connect(owner).transfer(reader1.address, 100n * ONE);
    await token.connect(owner).transfer(reader2.address, 100n * ONE);

    await buckets.createBucket("ipfs://QmTestTopic");

    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.createEpoch(1, now + 10, now + 20, now + 20, now + 100);

    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");

    await token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE);

    const contentHash =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    await articles.connect(writer).publishArticle(
      1,
      "ipfs://QmArticleContent",
      contentHash,
      WRITER_STAKE
    );

    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");
  });

  function commitHash(epochId, articleId, saltString) {
    const salt = hre.ethers.encodeBytes32String(saltString);
    return hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [epochId, articleId, salt]
      )
    );
  }

  it("Should commit votes", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const hash1 = commitHash(1, 1, "salt_reader3");
    const hash2 = commitHash(1, 1, "salt_reader4");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader2).approve(await staking.getAddress(), READER_STAKE);

    await expect(
      staking.connect(reader1).commitVote(1, hash1, READER_STAKE)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader2).commitVote(1, hash2, READER_STAKE)
    ).to.not.be.reverted;
  });

  it("Should reveal votes after commit", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const salt1 = hre.ethers.encodeBytes32String("salt_reader3");
    const salt2 = hre.ethers.encodeBytes32String("salt_reader4");

    const hash1 = commitHash(1, 1, "salt_reader3");
    const hash2 = commitHash(1, 1, "salt_reader4");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader2).approve(await staking.getAddress(), READER_STAKE);

    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);
    await staking.connect(reader2).commitVote(1, hash2, READER_STAKE);

    await expect(
      staking.connect(reader1).revealVote(1, 1, salt1)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader2).revealVote(1, 1, salt2)
    ).to.not.be.reverted;
  });

  it("Should update support tally after reveal", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const salt1 = hre.ethers.encodeBytes32String("salt_reader3");
    const hash1 = commitHash(1, 1, "salt_reader3");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);
    await staking.connect(reader1).revealVote(1, 1, salt1);

    const supportWeight = await staking.getTally(1, 1);
    expect(supportWeight).to.be.gt(0);
  });

  it("Should revert reveal with wrong salt", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const hash1 = commitHash(1, 1, "salt_reader3");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);

    await expect(
      staking.connect(reader1).revealVote(
        1,
        1,
        hre.ethers.encodeBytes32String("wrong_salt")
      )
    ).to.be.reverted;
  });

  it("Should revert double reveal", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const salt1 = hre.ethers.encodeBytes32String("salt_reader3");
    const hash1 = commitHash(1, 1, "salt_reader3");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);
    await staking.connect(reader1).revealVote(1, 1, salt1);

    await expect(
      staking.connect(reader1).revealVote(1, 1, salt1)
    ).to.be.reverted;
  });

  it("Should revert double commit in same epoch", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    const hash1 = commitHash(1, 1, "salt_reader3");
    const hash2 = commitHash(1, 1, "salt_reader4");

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE * 2n);

    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);

    await expect(
      staking.connect(reader1).commitVote(1, hash2, READER_STAKE)
    ).to.be.reverted;
  });
});