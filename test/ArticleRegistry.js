const { expect } = require("chai");
const hre = require("hardhat");

describe("ArticleRegistry", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles;
  let owner, writer;

  const ONE = 10n ** 18n; // represents 1 CITE token with 18 decimals
  const INITIAL_SUPPLY = 1_000_000n * ONE; 
  const WRITER_STAKE = 10n * ONE; 

  beforeEach(async function () {
    [owner, writer] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
    articles = await hre.ethers.getContractAt("ArticleRegistry", await protocol.articles());

    await buckets.createBucket("ipfs://QmTestTopic");

    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.createEpoch(1, now + 10, now + 100, now + 100, now + 200);

    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");
  });

  it("Should successfully publish article during submission phase if writer has stake", async function () {
    const ownerBal = await token.balanceOf(owner.address);

    // ensure that ownerBal is more than 0
    await expect(ownerBal).to.be.gt(0n);

    await token.connect(owner).transfer(writer.address, 100n * ONE); // transfer some tokens to writer for staking
    await token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE); // approve the article registry to spend writer's tokens

    const contentHash =
      "0x1234567890123456789012345678901234567890123456789012345678901234"; // random content hash for testing

    await expect(
      articles.connect(writer).publishArticle(
        1,
        "ipfs://QmArticleContent",
        contentHash,
        WRITER_STAKE
      )
    ).to.not.be.reverted;

    const ids = await articles.getEpochArticles(1); // check that the 1 article is registered under the epoch
    expect(ids.length).to.equal(1);
  });

  it("Should revert publish without stake approval", async function () {
    const ownerBal = await token.balanceOf(owner.address);

    // ensure that ownerBal is more than 0
    await expect(ownerBal).to.be.gt(0n);

    await token.connect(owner).transfer(writer.address, 100n * ONE); // transfer some tokens to writer for staking

    const contentHash =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    await expect(
      articles.connect(writer).publishArticle(
        1,
        "ipfs://QmArticleContent",
        contentHash,
        WRITER_STAKE
      )
    ).to.be.reverted;
  });
});