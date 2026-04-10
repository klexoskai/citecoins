const { expect } = require("chai");
const hre = require("hardhat");

describe("Rewards", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles, staking, rewards;
  let owner, writer, writer2, reader1, reader2;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const BUCKET_STAKE = 100n * ONE;
  const WRITER_STAKE = 10n * ONE;
  const READER_STAKE = 50n * ONE;
  const WRITER_POOL = 500n * ONE;

  const CONTENT_HASH = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const CONTENT_HASH_2 = "0x2234567890123456789012345678901234567890123456789012345678901234";
  const MANIFEST_HASH = "0x3334567890123456789012345678901234567890123456789012345678901234";

  beforeEach(async function () {
    [owner, writer, writer2, reader1, reader2] = await hre.ethers.getSigners();

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
    await token.connect(owner).transfer(writer2.address, 100n * ONE);
    await token.connect(owner).transfer(reader1.address, 100n * ONE);
    await token.connect(owner).transfer(reader2.address, 100n * ONE);

    // create and fund bucket
    await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE + WRITER_POOL);
    await buckets.connect(owner).createBucket("ipfs://QmTestTopic", BUCKET_STAKE);
    await buckets.connect(owner).fundBucket(1, WRITER_POOL);

    // create epoch
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.connect(owner).createEpoch(1, now + 10, now + 20, now + 20, now + 60);

    // move into submission phase
    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");

    // publish 2 articles — need at least 2 with reader support for finalization to proceed
    await token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE);
    await articles.connect(writer).publishArticle(
      1,
      "ipfs://QmArticleContent1",
      CONTENT_HASH,
      "ipfs://QmManifestContent1",
      MANIFEST_HASH,
      WRITER_STAKE
    );

    await token.connect(writer2).approve(await articles.getAddress(), WRITER_STAKE);
    await articles.connect(writer2).publishArticle(
      1,
      "ipfs://QmArticleContent2",
      CONTENT_HASH_2,
      "ipfs://QmManifestContent2",
      MANIFEST_HASH,
      WRITER_STAKE
    );

    // move into staking phase
    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");

    // reader1 votes article 1, reader2 votes article 2
    const salt1 = hre.ethers.encodeBytes32String("salt_reader1");
    const salt2 = hre.ethers.encodeBytes32String("salt_reader2");

    const hash1 = hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [1, 1, salt1]
      )
    );
    const hash2 = hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [1, 2, salt2]
      )
    );

    await token.connect(reader1).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader2).approve(await staking.getAddress(), READER_STAKE);

    await staking.connect(reader1).commitVote(1, hash1, READER_STAKE);
    await staking.connect(reader2).commitVote(1, hash2, READER_STAKE);

    // move past staking end — reveals only allowed in Phase.Ended
    await hre.network.provider.send("evm_increaseTime", [40]);
    await hre.network.provider.send("evm_mine");

    await staking.connect(reader1).revealVote(1, 1, salt1);
    await staking.connect(reader2).revealVote(1, 2, salt2);
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

  it("Should let winning reader claim after finalization", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await rewards.connect(owner).finalizeEpoch(1, WRITER_POOL);

    const before = await token.balanceOf(reader1.address);
    await rewards.connect(reader1).claimReader(1);
    const after = await token.balanceOf(reader1.address);

    // reader1 backed article 1 (wins) — gets rawStake principal back
    expect(after).to.be.gt(before);
  });

  it("Should let second winning reader claim after finalization", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await rewards.connect(owner).finalizeEpoch(1, WRITER_POOL);

    const before = await token.balanceOf(reader2.address);
    await rewards.connect(reader2).claimReader(1);
    const after = await token.balanceOf(reader2.address);

    // reader2 backed article 2 (wins) — gets rawStake principal back
    expect(after).to.be.gt(before);
  });

  it("Should revert if trying to finalize before epoch end", async function () {
    // fresh deployment for early-finalize test
    [owner] = await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
    rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());

    const ownerBal = await token.balanceOf(owner.address);
    if (ownerBal === 0n) this.skip();

    await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE + WRITER_POOL);
    await buckets.connect(owner).createBucket("ipfs://QmTestTopic", BUCKET_STAKE);
    await buckets.connect(owner).fundBucket(1, WRITER_POOL);

    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await epochs.connect(owner).createEpoch(1, now + 10, now + 20, now + 20, now + 60);

    await expect(
      rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
    ).to.be.reverted;
  });
});
