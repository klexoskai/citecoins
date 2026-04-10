const hre = require("hardhat");

async function main() {
  const [deployer, alice, bob, carol, dave, reader5, reader6, reader7, reader8] =
    await hre.ethers.getSigners();

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
    console.log("dave    :", fmt(await token.balanceOf(dave.address)));
    console.log("reader5 :", fmt(await token.balanceOf(reader5.address)));
    console.log("reader6 :", fmt(await token.balanceOf(reader6.address)));
    console.log("reader7 :", fmt(await token.balanceOf(reader7.address)));
    console.log("reader8 :", fmt(await token.balanceOf(reader8.address)));
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
  console.log("Dave    :", dave.address);

  // -------- deploy protocol --------
  const initialSupply = hre.ethers.parseUnits("10000000", 18);
  const Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
  const protocol = await Protocol.connect(deployer).deploy(initialSupply);
  await protocol.waitForDeployment();

  const token      = await hre.ethers.getContractAt("CitecoinToken",      await protocol.token());
  const buckets    = await hre.ethers.getContractAt("BucketManager",      await protocol.buckets());
  const epochs     = await hre.ethers.getContractAt("EpochManager",       await protocol.epochs());
  const articles   = await hre.ethers.getContractAt("ArticleRegistry",    await protocol.articles());
  const staking    = await hre.ethers.getContractAt("Staking",            await protocol.staking());
  const rewards    = await hre.ethers.getContractAt("Rewards",            await protocol.rewards());
  const repManager = await hre.ethers.getContractAt("ReputationManager",  await protocol.repManager());

  console.log("\nDeployed:");
  console.log("Protocol        :", await protocol.getAddress());
  console.log("CitecoinToken   :", await protocol.token());
  console.log("BucketManager   :", await protocol.buckets());
  console.log("EpochManager    :", await protocol.epochs());
  console.log("ArticleRegistry :", await protocol.articles());
  console.log("Staking         :", await protocol.staking());
  console.log("Rewards         :", await protocol.rewards());
  console.log("ReputationManager:", await protocol.repManager());

  // -------- distribute tokens --------
  const give = hre.ethers.parseUnits("2000", 18);
  for (const acct of [alice, bob, carol, dave, reader5, reader6, reader7, reader8]) {
    await token.connect(deployer).transfer(acct.address, give);
  }
  await logBalances(token, "after distribution");

  // -------- create and fund bucket --------
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

  // -------- create epoch --------
  const t0 = await now();
  const submissionStart = Number(t0 + 10n);
  const submissionEnd   = Number(t0 + 120n);
  const stakingStart    = Number(t0 + 120n);
  const stakingEnd      = Number(t0 + 240n);

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

  // -------- publish 4 articles --------
  // alice, bob, carol, dave each publish one article
  // 4 articles → winnersCount(4) = max(floor(4/2), 3) = 3
  // articles 1,2,3 win; article 4 (dave) loses
  const WRITER_STAKE = 10n * ONE;
  const writers = [
    { acct: alice, cid: "ipfs://QmAliceArticle",   hash: "0x1111111111111111111111111111111111111111111111111111111111111111", mhash: "0xaaaa111111111111111111111111111111111111111111111111111111111111" },
    { acct: bob,   cid: "ipfs://QmBobArticle",     hash: "0x2222222222222222222222222222222222222222222222222222222222222222", mhash: "0xaaaa222222222222222222222222222222222222222222222222222222222222" },
    { acct: carol, cid: "ipfs://QmCarolArticle",   hash: "0x3333333333333333333333333333333333333333333333333333333333333333", mhash: "0xaaaa333333333333333333333333333333333333333333333333333333333333" },
    { acct: dave,  cid: "ipfs://QmDaveArticle",    hash: "0x4444444444444444444444444444444444444444444444444444444444444444", mhash: "0xaaaa444444444444444444444444444444444444444444444444444444444444" },
  ];

  const articleIds = [];
  for (const w of writers) {
    await token.connect(w.acct).approve(await addr(articles), WRITER_STAKE);
    const tx = await articles.connect(w.acct).publishArticle(
      epochId,
      w.cid,
      w.hash,
      w.cid + "-manifest",
      w.mhash,
      WRITER_STAKE
    );
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "ArticlePublished");
    articleIds.push(ev.args.articleId);
  }
  console.log("\nArticles published:", articleIds.map((id) => id.toString()).join(", "));

  // -------- advance to staking phase --------
  await hre.network.provider.send("evm_increaseTime", [111]);
  await hre.network.provider.send("evm_mine");

  // -------- commit votes --------
  // reader5  → article 1 (wins), reader6 → article 2 (wins)
  // reader7  → article 3 (wins), reader8 → article 4 (loses, stake slashed)
  // effectiveStake = sqrt(rep * rawStake); all new voters have rep=1
  const READER_STAKE = 400n * ONE;
  const readers = [
    { acct: reader5, articleId: articleIds[0], salt: "reader5-salt" },
    { acct: reader6, articleId: articleIds[1], salt: "reader6-salt" },
    { acct: reader7, articleId: articleIds[2], salt: "reader7-salt" },
    { acct: reader8, articleId: articleIds[3], salt: "reader8-salt" },
  ];

  const commits = [];
  for (const r of readers) {
    const c = makeCommit(epochId, r.articleId, r.salt);
    commits.push(c);
    await token.connect(r.acct).approve(await addr(staking), READER_STAKE);
    await staking.connect(r.acct).commitVote(epochId, c.hash, READER_STAKE);
  }
  console.log("\nVotes committed (blinded).");
  await logBalances(token, "after commits — stakes locked");

  // -------- advance past stakingEnd --------
  const latest = await now();
  const jump = BigInt(stakingEnd) - latest + 2n;
  if (jump > 0n) {
    await hre.network.provider.send("evm_increaseTime", [Number(jump)]);
    await hre.network.provider.send("evm_mine");
  }
  console.log("\nAdvanced past stakingEnd — epoch is now Phase.Ended.");

  // -------- reveal votes --------
  for (let i = 0; i < readers.length; i++) {
    await staking.connect(readers[i].acct).revealVote(epochId, readers[i].articleId, commits[i].salt);
  }
  console.log("Votes revealed.");

  for (let i = 0; i < articleIds.length; i++) {
    const tally = await staking.getTally(epochId, articleIds[i]);
    console.log(`  Article ${i + 1} tally (effStake): ${hre.ethers.formatUnits(tally, 18)}`);
  }

  // -------- finalize epoch --------
  // nPaid = clamp(floor(4/2), 3, 10) = 3 → articles 1,2,3 win; article 4 loses
  const writerPool = 1000n * ONE;
  await rewards.connect(deployer).finalizeEpoch(epochId, writerPool);
  console.log("\nEpoch finalized. writerPool =", hre.ethers.formatUnits(writerPool, 18), "CITE");

  // -------- claim writer rewards --------
  // Exponential decay: rank1=4/7, rank2=2/7, rank3=1/7 of 1000 CITE
  await rewards.connect(alice).claimWriter(epochId, articleIds[0]);
  await rewards.connect(bob).claimWriter(epochId, articleIds[1]);
  await rewards.connect(carol).claimWriter(epochId, articleIds[2]);
  console.log("Writer claims complete (alice rank1, bob rank2, carol rank3). Dave's stake slashed.");

  // -------- claim reader rewards --------
  // readerPool = 95% of (reader8's slashed stake + dave's slashed writer stake)
  // readers 5,6,7 get stake back + proportional share of readerPool
  // reader8 gets nothing — stake was slashed at finalization
  await rewards.connect(reader5).claimReader(epochId);
  await rewards.connect(reader6).claimReader(epochId);
  await rewards.connect(reader7).claimReader(epochId);
  await rewards.connect(reader8).claimReader(epochId); // amount = 0
  console.log("Reader claims complete. Reader8 receives 0 (stake slashed).");

  await logBalances(token, "after all claims");

  // -------- verify reputation updated --------
  console.log("\n== Reputation after epoch ==");
  for (const [label, acct] of [
    ["reader5", reader5], ["reader6", reader6],
    ["reader7", reader7], ["reader8", reader8],
  ]) {
    const rep = await repManager.effectiveRep(acct.address);
    console.log(`  ${label} effectiveRep: ${rep.toString()}`);
  }
  // readers 5,6,7 → rep=2 (won); reader8 → rep=1 (lost, bonus stays at 0)

  console.log("\nDemo flow complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
