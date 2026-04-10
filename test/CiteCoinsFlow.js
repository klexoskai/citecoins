const { expect } = require("chai");
const hre = require("hardhat");

describe("CitecoinsFlow", function () {
  let Protocol, protocol;
  let token, buckets, epochs, articles, staking, rewards;
  let owner, writer1, writer2, writer3, writer4, reader5, reader6, reader7, reader8;

  const ONE = 10n ** 18n;
  const INITIAL_SUPPLY = 1_000_000n * ONE;
  const BUCKET_STAKE = 100n * ONE;
  const WRITER_STAKE = 10n * ONE;
  const READER_STAKE = 50n * ONE;
  const WRITER_POOL = 500n * ONE;
  const USER_ALLOCATION = 100n * ONE;

  const CONTENT_HASH_1 = "0x1234567890123456789012345678901234567890123456789012345678901234";
  const CONTENT_HASH_2 = "0x2234567890123456789012345678901234567890123456789012345678901234";
  const CONTENT_HASH_3 = "0x3334567890123456789012345678901234567890123456789012345678901234";
  const CONTENT_HASH_4 = "0x4434567890123456789012345678901234567890123456789012345678901234";
  const MANIFEST_HASH_1 = "0x5534567890123456789012345678901234567890123456789012345678901234";
  const MANIFEST_HASH_2 = "0x6634567890123456789012345678901234567890123456789012345678901234";
  const MANIFEST_HASH_3 = "0x7734567890123456789012345678901234567890123456789012345678901234";
  const MANIFEST_HASH_4 = "0x8834567890123456789012345678901234567890123456789012345678901234";

  beforeEach(async function () {
    [owner, writer1, writer2, writer3, writer4, reader5, reader6, reader7, reader8] =
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

  it("should run the full happy path with 4 articles and 4 readers", async function () {
    const ownerBal = await token.balanceOf(owner.address);
    expect(ownerBal).to.equal(INITIAL_SUPPLY);

    // =========================================================
    // Step 1 — Distribute tokens
    // =========================================================
    for (const acct of [writer1, writer2, writer3, writer4, reader5, reader6, reader7, reader8]) {
      await token.connect(owner).transfer(acct.address, USER_ALLOCATION);
      expect(await token.balanceOf(acct.address)).to.equal(USER_ALLOCATION);
    }

    // =========================================================
    // Step 2 — Create and fund bucket
    // =========================================================
    await token.connect(owner).approve(await buckets.getAddress(), BUCKET_STAKE + WRITER_POOL);

    await expect(
      buckets.connect(owner).createBucket("ipfs://QmTestTopic", BUCKET_STAKE)
    ).to.not.be.reverted;

    await expect(
      buckets.connect(owner).fundBucket(1, WRITER_POOL)
    ).to.not.be.reverted;

    const bucket = await buckets.getBucket(1);
    expect(bucket[2]).to.equal(WRITER_POOL); // fundedRewards
    expect(bucket[3]).to.equal(BUCKET_STAKE); // creatorStake
    expect(bucket[4]).to.equal(true);         // active

    // =========================================================
    // Step 3 — Create epoch
    // =========================================================
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;

    const submissionStart = now + 60;
    const submissionEnd   = now + 120;
    const stakingStart    = now + 120;
    const stakingEnd      = now + 240;

    await expect(
      epochs.connect(owner).createEpoch(1, submissionStart, submissionEnd, stakingStart, stakingEnd)
    ).to.not.be.reverted;

    expect(await epochs.currentPhase(1)).to.equal(0); // NotStarted

    await increaseTime(61);
    expect(await epochs.currentPhase(1)).to.equal(1); // Submission

    // =========================================================
    // Step 4 — Submit 4 articles
    // =========================================================
    const writers = [writer1, writer2, writer3, writer4];
    const contentHashes = [CONTENT_HASH_1, CONTENT_HASH_2, CONTENT_HASH_3, CONTENT_HASH_4];
    const manifestHashes = [MANIFEST_HASH_1, MANIFEST_HASH_2, MANIFEST_HASH_3, MANIFEST_HASH_4];

    for (let i = 0; i < 4; i++) {
      await token.connect(writers[i]).approve(await articles.getAddress(), WRITER_STAKE);
      await expect(
        articles.connect(writers[i]).publishArticle(
          1,
          `ipfs://QmArticleContent${i + 1}`,
          contentHashes[i],
          `ipfs://QmManifestContent${i + 1}`,
          manifestHashes[i],
          WRITER_STAKE
        )
      ).to.not.be.reverted;
    }

    const epochArticles = await articles.getEpochArticles(1);
    expect(epochArticles.map((x) => BigInt(x))).to.deep.equal([1n, 2n, 3n, 4n]);

    await increaseTime(61);
    expect(await epochs.currentPhase(1)).to.equal(2); // Staking

    // =========================================================
    // Step 5 — Commit votes
    // reader5 -> article 1 (wins)
    // reader6 -> article 2 (wins)
    // reader7 -> article 3 (wins)
    // reader8 -> article 4 (loses — stake slashed)
    // 4 articles: winnersCount(4) = max(floor(4/2), 3) = 3 → articles 1,2,3 win
    // =========================================================
    const c5 = makeCommitHash(1, 1, "salt_reader5");
    const c6 = makeCommitHash(1, 2, "salt_reader6");
    const c7 = makeCommitHash(1, 3, "salt_reader7");
    const c8 = makeCommitHash(1, 4, "salt_reader8");

    for (const [reader, commit] of [
      [reader5, c5], [reader6, c6], [reader7, c7], [reader8, c8]
    ]) {
      await token.connect(reader).approve(await staking.getAddress(), READER_STAKE);
      await expect(
        staking.connect(reader).commitVote(1, commit.hash, READER_STAKE)
      ).to.not.be.reverted;
    }

    // =========================================================
    // Step 6 — Advance past staking end, then reveal votes
    // =========================================================
    await increaseTime(121);
    expect(await epochs.currentPhase(1)).to.equal(3); // Ended

    await expect(staking.connect(reader5).revealVote(1, 1, c5.salt)).to.not.be.reverted;
    await expect(staking.connect(reader6).revealVote(1, 2, c6.salt)).to.not.be.reverted;
    await expect(staking.connect(reader7).revealVote(1, 3, c7.salt)).to.not.be.reverted;
    await expect(staking.connect(reader8).revealVote(1, 4, c8.salt)).to.not.be.reverted;

    // one reader per article — all tallies equal; tiebreak by lower articleId → rank 1,2,3,4
    const t1 = await staking.getTally(1, 1);
    const t2 = await staking.getTally(1, 2);
    const t3 = await staking.getTally(1, 3);
    const t4 = await staking.getTally(1, 4);
    expect(t1).to.equal(t2);
    expect(t2).to.equal(t3);
    expect(t3).to.equal(t4);
    expect(t1).to.be.gt(0n);

    // =========================================================
    // Step 7 — Finalize
    // =========================================================
    await expect(
      rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
    ).to.not.be.reverted;

    const bucketAfter = await buckets.getBucket(1);
    expect(bucketAfter[4]).to.equal(false); // inactive after finalization

    // =========================================================
    // Step 8 — Claim rewards
    // =========================================================

    // Writers 1,2,3 (articles 1–3, winning) claim writer pool payouts
    for (const [writer, articleId] of [[writer1, 1], [writer2, 2], [writer3, 3]]) {
      const before = await token.balanceOf(writer.address);
      await expect(rewards.connect(writer).claimWriter(1, articleId)).to.not.be.reverted;
      const after = await token.balanceOf(writer.address);
      expect(after).to.be.gt(before);
    }

    // Writer 4 (article 4, losing) cannot claim
    await expect(rewards.connect(writer4).claimWriter(1, 4)).to.be.reverted;

    // Readers 5,6,7 (backed winning articles) — get stake back + reader pool share
    for (const reader of [reader5, reader6, reader7]) {
      const before = await token.balanceOf(reader.address);
      await expect(rewards.connect(reader).claimReader(1)).to.not.be.reverted;
      const after = await token.balanceOf(reader.address);
      expect(after).to.be.gt(before);
    }

    // Reader 8 (backed losing article 4) — stake slashed at finalization, no payout
    const reader8Before = await token.balanceOf(reader8.address);
    await expect(rewards.connect(reader8).claimReader(1)).to.not.be.reverted;
    const reader8After = await token.balanceOf(reader8.address);
    expect(reader8After).to.equal(reader8Before); // no payout, stake already slashed
  });
});
