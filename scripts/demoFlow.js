const hre = require("hardhat");

async function main() {
  const [deployer, alice, bob, carol] = await hre.ethers.getSigners();

  // -------- helpers --------
  const now = async () => BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);
  const addr = async (c) => await c.getAddress();
  const ONE = hre.ethers.parseUnits("1", 18);

  const logBalances = async (token, label) => {
    const fmt = (x) => hre.ethers.formatUnits(x, 18);
    console.log(`\n== Balances (${label}) ==`);
    console.log("deployer:", fmt(await token.balanceOf(deployer.address)));
    console.log("alice   :", fmt(await token.balanceOf(alice.address)));
    console.log("bob     :", fmt(await token.balanceOf(bob.address)));
    console.log("carol   :", fmt(await token.balanceOf(carol.address)));
  };

  function makeCommit(epochId, articleId, saltLabel) {
    const salt = hre.ethers.encodeBytes32String(saltLabel);
    const hash = hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32"],
        [epochId, articleId, salt]
      )
    );
    return { salt, hash };
  }

  console.log("Deployer:", deployer.address);
  console.log("Alice   :", alice.address);
  console.log("Bob     :", bob.address);
  console.log("Carol   :", carol.address);

  // -------- deploy protocol --------
  const initialSupply = hre.ethers.parseUnits("10000000", 18);
  const Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
  const protocol = await Protocol.connect(deployer).deploy(initialSupply);
  await protocol.waitForDeployment();

  const token   = await hre.ethers.getContractAt("CitecoinToken",   await protocol.token());
  const buckets = await hre.ethers.getContractAt("BucketManager",   await protocol.buckets());
  const epochs  = await hre.ethers.getContractAt("EpochManager",    await protocol.epochs());
  const articles = await hre.ethers.getContractAt("ArticleRegistry", await protocol.articles());
  const staking = await hre.ethers.getContractAt("Staking",         await protocol.staking());
  const rewards = await hre.ethers.getContractAt("Rewards",         await protocol.rewards());

  console.log("\nDeployed:");
  console.log("Protocol:", await protocol.getAddress());
  console.log("Token   :", await protocol.token());
  console.log("Buckets :", await protocol.buckets());
  console.log("Epochs  :", await protocol.epochs());
  console.log("Articles:", await protocol.articles());
  console.log("Staking :", await protocol.staking());
  console.log("Rewards :", await protocol.rewards());

  // -------- distribute tokens --------
  const give = hre.ethers.parseUnits("5000", 18);
  await token.connect(deployer).transfer(alice.address, give);
  await token.connect(deployer).transfer(bob.address, give);
  await token.connect(deployer).transfer(carol.address, give);
  await logBalances(token, "after distribution");

  // -------- create and fund bucket --------
  // deployer creates the topic bucket with 100 CITE stake
  const BUCKET_STAKE = 100n * ONE;
  const WRITER_POOL  = 1000n * ONE;

  await token.connect(deployer).approve(await addr(buckets), BUCKET_STAKE + WRITER_POOL);
  const txBucket = await buckets.connect(deployer).createBucket("ipfs://demo-topic-json", BUCKET_STAKE);
  const rcBucket = await txBucket.wait();
  const evBucket = rcBucket.logs
    .map((l) => { try { return buckets.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "BucketCreated");
  const bucketId = evBucket.args.bucketId;
  console.log("\nBucket created. bucketId =", bucketId.toString());

  await buckets.connect(deployer).fundBucket(bucketId, WRITER_POOL);
  console.log("Bucket funded with:", hre.ethers.formatUnits(WRITER_POOL, 18), "CITE");

  // -------- create epoch (short windows for demo) --------
  const t0 = await now();
  const submissionStart = Number(t0 + 10n);
  const submissionEnd   = Number(t0 + 120n); // 2 min submission window
  const stakingStart    = Number(t0 + 120n);
  const stakingEnd      = Number(t0 + 240n); // 2 min staking window

  const txEpoch = await epochs.connect(deployer).createEpoch(
    bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd
  );
  const rcEpoch = await txEpoch.wait();
  const evEpoch = rcEpoch.logs
    .map((l) => { try { return epochs.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "EpochCreated");
  const epochId = evEpoch.args.epochId;
  console.log("Epoch created. epochId =", epochId.toString());

  // -------- advance to submission phase --------
  await hre.network.provider.send("evm_increaseTime", [11]);
  await hre.network.provider.send("evm_mine");

  // -------- publish 3 articles --------
  // Each writer stakes 10 CITE and provides content + manifest CIDs/hashes
  const WRITER_STAKE = 10n * ONE;
  const MANIFEST_HASH = "0x3334567890123456789012345678901234567890123456789012345678901234";

  await token.connect(alice).approve(await addr(articles), WRITER_STAKE);
  const txA1 = await articles.connect(alice).publishArticle(
    epochId,
    "ipfs://QmAliceArticle",
    "0x1111111111111111111111111111111111111111111111111111111111111111",
    "ipfs://QmAliceManifest",
    MANIFEST_HASH,
    WRITER_STAKE
  );
  const rcA1 = await txA1.wait();
  const evA1 = rcA1.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a1 = evA1.args.articleId;

  await token.connect(bob).approve(await addr(articles), WRITER_STAKE);
  const txA2 = await articles.connect(bob).publishArticle(
    epochId,
    "ipfs://QmBobArticle",
    "0x2222222222222222222222222222222222222222222222222222222222222222",
    "ipfs://QmBobManifest",
    MANIFEST_HASH,
    WRITER_STAKE
  );
  const rcA2 = await txA2.wait();
  const evA2 = rcA2.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a2 = evA2.args.articleId;

  await token.connect(carol).approve(await addr(articles), WRITER_STAKE);
  const txA3 = await articles.connect(carol).publishArticle(
    epochId,
    "ipfs://QmCarolArticle",
    "0x3333333333333333333333333333333333333333333333333333333333333333",
    "ipfs://QmCarolManifest",
    MANIFEST_HASH,
    WRITER_STAKE
  );
  const rcA3 = await txA3.wait();
  const evA3 = rcA3.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a3 = evA3.args.articleId;

  console.log("\nArticles published:", a1.toString(), a2.toString(), a3.toString());

  // -------- advance to staking phase --------
  await hre.network.provider.send("evm_increaseTime", [111]);
  await hre.network.provider.send("evm_mine");

  // -------- commit votes (blinded, during Staking phase) --------
  // Quadratic influence: effectiveStake = sqrt(rawStake)
  // alice:  400 CITE on a1 → eff = sqrt(400) = 20
  // bob:    400 CITE on a1 → eff = sqrt(400) = 20  → a1 total eff = 40
  // carol: 1600 CITE on a2 → eff = sqrt(1600) = 40 → a2 total eff = 40
  // tie: a1 wins via higher raw stake (800 vs 1600... wait carol wins raw, but a1 has lower articleId so a1 wins tie)
  // Both a1 and a2 win (nPaid = clamp(floor(3/2), 3, 10) = clamp(1, 3, 10) = 3, capped at 3 = all win)
  const ALICE_STAKE = 400n * ONE;
  const BOB_STAKE   = 400n * ONE;
  const CAROL_STAKE = 1600n * ONE;

  const cA = makeCommit(epochId, a1, "alice-salt");
  const cB = makeCommit(epochId, a1, "bob-salt");
  const cC = makeCommit(epochId, a2, "carol-salt");

  await token.connect(alice).approve(await addr(staking), ALICE_STAKE);
  await token.connect(bob).approve(await addr(staking), BOB_STAKE);
  await token.connect(carol).approve(await addr(staking), CAROL_STAKE);

  await staking.connect(alice).commitVote(epochId, cA.hash, ALICE_STAKE);
  await staking.connect(bob).commitVote(epochId, cB.hash, BOB_STAKE);
  await staking.connect(carol).commitVote(epochId, cC.hash, CAROL_STAKE);

  console.log("\nVotes committed (blinded).");
  await logBalances(token, "after commits (stake locked in Staking contract)");

  // -------- advance past stakingEnd (reveals only allowed in Phase.Ended) --------
  const latest = await now();
  const jump = BigInt(stakingEnd) - latest + 2n;
  if (jump > 0n) {
    await hre.network.provider.send("evm_increaseTime", [Number(jump)]);
    await hre.network.provider.send("evm_mine");
  }
  console.log("\nAdvanced past stakingEnd — epoch is now in Phase.Ended.");

  // -------- reveal votes --------
  await staking.connect(alice).revealVote(epochId, a1, cA.salt);
  await staking.connect(bob).revealVote(epochId, a1, cB.salt);
  await staking.connect(carol).revealVote(epochId, a2, cC.salt);
  console.log("Votes revealed.");

  console.log("  a1 tally (effStake):", hre.ethers.formatUnits(await staking.getTally(epochId, a1), 18));
  console.log("  a2 tally (effStake):", hre.ethers.formatUnits(await staking.getTally(epochId, a2), 18));

  // -------- finalize epoch --------
  // nPaid = clamp(floor(3/2), 3, 10) capped at 3 = 3 → all articles win
  const writerPool = 300n * ONE;
  await rewards.connect(deployer).finalizeEpoch(epochId, writerPool);
  console.log("\nEpoch finalized. writerPool =", hre.ethers.formatUnits(writerPool, 18), "CITE");

  // -------- claim writer rewards --------
  await rewards.connect(alice).claimWriter(epochId, a1);
  await rewards.connect(bob).claimWriter(epochId, a2);
  await rewards.connect(carol).claimWriter(epochId, a3);
  console.log("Writer claims complete.");

  // -------- claim reader rewards --------
  // Winning readers get back rawStake + effectiveStake-proportional share of readerPool
  // Since all articles won (no losers), readerPool = 0 in this demo
  await rewards.connect(alice).claimReader(epochId);
  await rewards.connect(bob).claimReader(epochId);
  await rewards.connect(carol).claimReader(epochId);
  console.log("Reader claims complete.");

  await logBalances(token, "after all claims");
  console.log("\nDemo flow complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
