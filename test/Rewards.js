const { expect } = require("chai");
const hre = require("hardhat");

describe("Rewards", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles, staking, rewards;
  let owner, writer, reader1, reader2;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const WRITER_STAKE = 10n * ONE;
  const READER_STAKE = 50n * ONE;
  const WRITER_POOL = 500n * ONE;

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
    rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());

    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) return;

    // distribute tokens
    await token.connect(owner).transfer(writer.address, 100n * ONE);
    await token.connect(owner).transfer(reader1.address, 100n * ONE);
    await token.connect(owner).transfer(reader2.address, 100n * ONE);

    // create and fund bucket
    await buckets.connect(owner).createBucket("ipfs://QmTestTopic");
    await token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL);
    await buckets.connect(owner).fundBucket(1, WRITER_POOL);

    // create epoch
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.connect(owner).createEpoch(1, now + 10, now + 20, now + 20, now + 60);

    // move into submission phase
    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");

    // publish article
    await token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE);

    const contentHash =
      "0x1234567890123456789012345678901234567890123456789012345678901234";

    await articles.connect(writer).publishArticle(
      1,
      "ipfs://QmArticleContent",
      contentHash,
      WRITER_STAKE
    );

    // move into staking phase
    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");

    // one-way support vote hashes: keccak256(abi.encode(epochId, articleId, salt))
    const salt1 = hre.ethers.encodeBytes32String("salt_reader3");
    const salt2 = hre.ethers.encodeBytes32String("salt_reader4");

    const hash1 = hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [1, 1, salt1]
      )
    );

    const hash2 = hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [1, 1, salt2]
      )
    );

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader2).approve(await staking.getAddress(), READER_STAKE);

    // updated commitVote signature: (epochId, commitHash, rawStake)
    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);
    await staking.connect(reader2).commitVote(1, hash2, READER_STAKE);

    // updated revealVote signature: (epochId, articleId, salt)
    await staking.connect(reader1).revealVote(1, 1, salt1);
    await staking.connect(reader2).revealVote(1, 1, salt2);

    // move past staking end
    await hre.network.provider.send("evm_increaseTime", [61]);
    await hre.network.provider.send("evm_mine");
  });

  it("Should finalize after epoch end", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await expect(
      rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
    ).to.not.be.reverted;
  });

  it("Should let writer claim after finalization", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await rewards.connect(owner).finalizeEpoch(1, WRITER_POOL);

    const before = await token.balanceOf(writer.address);
    await rewards.connect(writer).claimWriter(1, 1);
    const after = await token.balanceOf(writer.address);

    expect(after).to.be.gt(before);
  });

  it("Should let supporting reader claim after finalization", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await rewards.connect(owner).finalizeEpoch(1, WRITER_POOL);

    const before = await token.balanceOf(reader1.address);
    await rewards.connect(reader1).claimReader(1);
    const after = await token.balanceOf(reader1.address);

    expect(after).to.be.gt(before);
  });

  it("Should let second supporting reader claim after finalization", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await rewards.connect(owner).finalizeEpoch(1, WRITER_POOL);

    const before = await token.balanceOf(reader2.address);
    await rewards.connect(reader2).claimReader(1);
    const after = await token.balanceOf(reader2.address);

    expect(after).to.be.gt(before);
  });

  it("Should revert if trying to finalize before epoch end", async function () {
    // fresh deployment for early-finalize test
    [owner, writer, reader1, reader2] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
    rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());

    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await buckets.connect(owner).createBucket("ipfs://QmTestTopic");
    await token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL);
    await buckets.connect(owner).fundBucket(1, WRITER_POOL);

    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.connect(owner).createEpoch(1, now + 10, now + 20, now + 20, now + 60);

    await expect(
      rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
    ).to.be.reverted;
  });
});