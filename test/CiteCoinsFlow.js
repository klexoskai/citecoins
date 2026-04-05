const { expect } = require("chai");
const hre = require("hardhat");

describe("CitecoinsFlow", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles, staking, rewards;
  let owner, writer1, writer2, reader4, reader5, reader6, others;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const WRITER_STAKE = 10n * ONE;
  const READER_STAKE = 50n * ONE;
  const WRITER_POOL = 500n * ONE;
  const USER_ALLOCATION = 100n * ONE;

  beforeEach(async function () {
    [owner, writer1, writer2, reader4, reader5, reader6, ...others] =
      await hre.ethers.getSigners();

    Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
    protocol = await Protocol.deploy(INITIAL_SUPPLY);
    await protocol.waitForDeployment();

    token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
    buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
    epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
    articles = await hre.ethers.getContractAt("ArticleRegistry", await protocol.articles());
    staking = await hre.ethers.getContractAt("Staking", await protocol.staking());
    rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());
  });

  async function increaseTime(seconds) {
    await hre.network.provider.send("evm_increaseTime", [seconds]);
    await hre.network.provider.send("evm_mine");
  }

  function makeCommitHash(epochId, articleId, saltLabel) {
    const salt = hre.ethers.encodeBytes32String(saltLabel);
    const abi = hre.ethers.AbiCoder.defaultAbiCoder();
    const hash = hre.ethers.keccak256(
      abi.encode(["uint256", "uint256", "bytes32"], [epochId, articleId, salt])
    );
    return { salt, hash };
  }

  it("should run the full happy path with 2 articles and 3 readers", async function () {
    // Make sure this deployment path gives owner the initial supply
    const ownerBal = await token.balanceOf(owner.address);
    expect(ownerBal).to.equal(INITIAL_SUPPLY);

    // =========================================================
    // Step 1 — Distribute tokens
    // =========================================================
    await token.connect(owner).transfer(writer1.address, USER_ALLOCATION);
    await token.connect(owner).transfer(writer2.address, USER_ALLOCATION);
    await token.connect(owner).transfer(reader4.address, USER_ALLOCATION);
    await token.connect(owner).transfer(reader5.address, USER_ALLOCATION);
    await token.connect(owner).transfer(reader6.address, USER_ALLOCATION);

    expect(await token.balanceOf(writer1.address)).to.equal(USER_ALLOCATION);
    expect(await token.balanceOf(writer2.address)).to.equal(USER_ALLOCATION);
    expect(await token.balanceOf(reader4.address)).to.equal(USER_ALLOCATION);
    expect(await token.balanceOf(reader5.address)).to.equal(USER_ALLOCATION);
    expect(await token.balanceOf(reader6.address)).to.equal(USER_ALLOCATION);

    // =========================================================
    // Step 2 — Create and fund bucket
    // =========================================================
    await expect(
      buckets.connect(owner).createBucket("ipfs://QmTestTopic")
    ).to.not.be.reverted;

    await token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL);

    await expect(
      buckets.connect(owner).fundBucket(1, WRITER_POOL)
    ).to.not.be.reverted;

    const bucket = await buckets.getBucket(1);
    expect(bucket[2]).to.equal(WRITER_POOL); // fundedRewards
    expect(bucket[3]).to.equal(true);        // active

    // =========================================================
    // Step 3 — Create epoch
    // =========================================================
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;

    const submissionStart = now + 60;
    const submissionEnd = now + 120;
    const stakingStart = now + 120;
    const stakingEnd = now + 240;

    await expect(
      epochs.connect(owner).createEpoch(
        1,
        submissionStart,
        submissionEnd,
        stakingStart,
        stakingEnd
      )
    ).to.not.be.reverted;

    expect(await epochs.currentPhase(1)).to.equal(0); // NotStarted

    await increaseTime(61);
    expect(await epochs.currentPhase(1)).to.equal(1); // Submission

    // =========================================================
    // Step 4 — Submit 2 articles
    // =========================================================
    await token.connect(writer1).approve(await articles.getAddress(), WRITER_STAKE);
    await token.connect(writer2).approve(await articles.getAddress(), WRITER_STAKE);

    const contentHash1 =
      "0x1234567890123456789012345678901234567890123456789012345678901234";
    const contentHash2 =
      "0x2234567890123456789012345678901234567890123456789012345678901234";

    await expect(
      articles.connect(writer1).publishArticle(
        1,
        "ipfs://QmArticleContent1",
        contentHash1,
        WRITER_STAKE
      )
    ).to.not.be.reverted;

    await expect(
      articles.connect(writer2).publishArticle(
        1,
        "ipfs://QmArticleContent2",
        contentHash2,
        WRITER_STAKE
      )
    ).to.not.be.reverted;

    const epochArticles = await articles.getEpochArticles(1);
    expect(epochArticles.map((x) => BigInt(x))).to.deep.equal([1n, 2n]);

    await increaseTime(61);
    expect(await epochs.currentPhase(1)).to.equal(2); // Staking

    // =========================================================
    // Step 5 — Commit votes
    // Account 4 -> article 1
    // Account 5 -> article 1
    // Account 6 -> article 2
    // =========================================================
    const c4 = makeCommitHash(1, 1, "salt_reader4");
    const c5 = makeCommitHash(1, 1, "salt_reader5");
    const c6 = makeCommitHash(1, 2, "salt_reader6");

    await token.connect(reader4).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader5).approve(await staking.getAddress(), READER_STAKE);
    await token.connect(reader6).approve(await staking.getAddress(), READER_STAKE);

    await expect(
      staking.connect(reader4).commitVote(1, c4.hash, READER_STAKE)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader5).commitVote(1, c5.hash, READER_STAKE)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader6).commitVote(1, c6.hash, READER_STAKE)
    ).to.not.be.reverted;

    // =========================================================
    // Step 6 — Reveal votes
    // =========================================================
    await expect(
      staking.connect(reader4).revealVote(1, 1, c4.salt)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader5).revealVote(1, 1, c5.salt)
    ).to.not.be.reverted;

    await expect(
      staking.connect(reader6).revealVote(1, 2, c6.salt)
    ).to.not.be.reverted;

    const support1 = await staking.getTally(1, 1);
    const support2 = await staking.getTally(1, 2);

    expect(support1).to.be.gt(support2);

    await increaseTime(121);
    expect(await epochs.currentPhase(1)).to.equal(3); // Ended

    // =========================================================
    // Step 7 — Finalize
    // =========================================================
    await expect(
      rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
    ).to.not.be.reverted;

    const bucketAfter = await buckets.getBucket(1);
    expect(bucketAfter[3]).to.equal(false); // inactive

    // =========================================================
    // Step 8 — Claim rewards
    // =========================================================

    // Writer 1 (article 1, winning article) claims
    const writer1Before = await token.balanceOf(writer1.address);
    await expect(
      rewards.connect(writer1).claimWriter(1, 1)
    ).to.not.be.reverted;
    const writer1After = await token.balanceOf(writer1.address);
    expect(writer1After).to.be.gt(writer1Before);

    // Reader 4 claims
    const reader4Before = await token.balanceOf(reader4.address);
    await expect(
      rewards.connect(reader4).claimReader(1)
    ).to.not.be.reverted;
    const reader4After = await token.balanceOf(reader4.address);
    expect(reader4After).to.be.gt(reader4Before);

    // Reader 5 claims
    const reader5Before = await token.balanceOf(reader5.address);
    await expect(
      rewards.connect(reader5).claimReader(1)
    ).to.not.be.reverted;
    const reader5After = await token.balanceOf(reader5.address);
    expect(reader5After).to.be.gt(reader5Before);

    // Reader 6 supported losing article 2 -> gets 0 and loses their stake 
    const reader6Before = await token.balanceOf(reader6.address);
    await expect(
      rewards.connect(reader6).claimReader(1)
    ).to.not.be.reverted;
    const reader6After = await token.balanceOf(reader6.address);
    expect(reader6After).to.equal(reader6Before);

    // Optional stronger checks:
    // - Writer 2 (losing article) should not be able to claim writer payout
    await expect(
      rewards.connect(writer2).claimWriter(1, 2)
    ).to.be.reverted;
  });
});