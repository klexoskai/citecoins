const hre = require("hardhat");

async function main() {
  const [deployer, alice, bob, carol] = await hre.ethers.getSigners();

  // -------- helpers --------
  const now = async () => BigInt((await hre.ethers.provider.getBlock("latest")).timestamp);

  const addr = async (c) => await c.getAddress();

  const logBalances = async (token, label) => {
    const fmt = (x) => hre.ethers.formatUnits(x, 18);
    const b0 = await token.balanceOf(deployer.address);
    const b1 = await token.balanceOf(alice.address);
    const b2 = await token.balanceOf(bob.address);
    const b3 = await token.balanceOf(carol.address);
    console.log(`\n== Balances (${label}) ==`);
    console.log("deployer:", fmt(b0));
    console.log("alice   :", fmt(b1));
    console.log("bob     :", fmt(b2));
    console.log("carol   :", fmt(b3));
  };

  console.log("Deployer:", deployer.address);
  console.log("Alice   :", alice.address);
  console.log("Bob     :", bob.address);
  console.log("Carol   :", carol.address);

  // -------- deploy protocol --------
  const initialSupply = hre.ethers.parseUnits("10000000", 18);
  const Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
  const protocol = await Protocol.connect(deployer).deploy(initialSupply);
  await protocol.waitForDeployment();

  const tokenAddr = await protocol.token();
  const bucketsAddr = await protocol.buckets();
  const epochsAddr = await protocol.epochs();
  const articlesAddr = await protocol.articles();
  const stakingAddr = await protocol.staking();
  const rewardsAddr = await protocol.rewards();

  const Token = await hre.ethers.getContractFactory("CitecoinToken");
  const BucketManager = await hre.ethers.getContractFactory("BucketManager");
  const EpochManager = await hre.ethers.getContractFactory("EpochManager");
  const ArticleRegistry = await hre.ethers.getContractFactory("ArticleRegistry");
  const Staking = await hre.ethers.getContractFactory("Staking");
  const Rewards = await hre.ethers.getContractFactory("Rewards");

  const token = Token.attach(tokenAddr);
  const buckets = BucketManager.attach(bucketsAddr);
  const epochs = EpochManager.attach(epochsAddr);
  const articles = ArticleRegistry.attach(articlesAddr);
  const staking = Staking.attach(stakingAddr);
  const rewards = Rewards.attach(rewardsAddr);

  console.log("\nDeployed:");
  console.log("Protocol:", await protocol.getAddress());
  console.log("Token   :", tokenAddr);
  console.log("Buckets :", bucketsAddr);
  console.log("Epochs  :", epochsAddr);
  console.log("Articles:", articlesAddr);
  console.log("Staking :", stakingAddr);
  console.log("Rewards :", rewardsAddr);

  // -------- distribute tokens to demo users --------
  const give = hre.ethers.parseUnits("10000", 18);
  await (await token.connect(deployer).transfer(alice.address, give)).wait();
  await (await token.connect(deployer).transfer(bob.address, give)).wait();
  await (await token.connect(deployer).transfer(carol.address, give)).wait();

  await logBalances(token, "after distribution");

  // -------- create bucket --------
  // Parameters
  // topicURI: put an IPFS CID in real usage; for demo use a string
  const topicURI = "ipfs://demo-topic-json";
  const epochDuration = 7 * 24 * 60 * 60; // unused in explicit epoch creation but stored
  const creationStake = hre.ethers.parseUnits("0", 18); // set >0 if you want anti-spam stake
  const feeBps = 300; // 3% fee on losing redistribution
  const minArticles = 2;
  const minTotalStake = hre.ethers.parseUnits("1", 18);

  // If creationStake > 0, creator must approve buckets first.
  if (creationStake > 0n) {
    await (await token.connect(deployer).approve(bucketsAddr, creationStake)).wait();
  }

  const txBucket = await buckets
    .connect(deployer)
    .createBucket(topicURI, epochDuration, creationStake, feeBps, minArticles, minTotalStake);
  const rcBucket = await txBucket.wait();

  const bucketCreated = rcBucket.logs
    .map((l) => {
      try { return buckets.interface.parseLog(l); } catch { return null; }
    })
    .find((e) => e && e.name === "BucketCreated");

  const bucketId = bucketCreated.args.bucketId;
  console.log("\nBucket created. bucketId =", bucketId.toString());

  // -------- fund bucket (writer pool source) --------
  const bucketFunding = hre.ethers.parseUnits("1000", 18);
  await (await token.connect(deployer).approve(bucketsAddr, bucketFunding)).wait();
  await (await buckets.connect(deployer).fundBucket(bucketId, bucketFunding)).wait();
  console.log("Bucket funded with:", hre.ethers.formatUnits(bucketFunding, 18), "CITE");

  // -------- create epoch (short windows for demo) --------
  const t0 = await now();
  const submissionStart = Number(t0);
  const submissionEnd = Number(t0 + 120n); // 2 minutes
  const stakingStart = Number(t0);
  const stakingEnd = Number(t0 + 240n); // 4 minutes

  const txEpoch = await epochs
    .connect(deployer)
    .createEpoch(bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd);
  const rcEpoch = await txEpoch.wait();

  const epochCreated = rcEpoch.logs
    .map((l) => {
      try { return epochs.interface.parseLog(l); } catch { return null; }
    })
    .find((e) => e && e.name === "EpochCreated");

  const epochId = epochCreated.args.epochId;
  console.log("\nEpoch created. epochId =", epochId.toString());

  // -------- publish 3 articles --------
  // For demo: use fake CIDs and hashes
  const zero32 = "0x" + "00".repeat(32);

  const txA1 = await articles.connect(alice).publishArticle(epochId, "ipfs://a1", "ipfs://m1", zero32, zero32);
  const rcA1 = await txA1.wait();
  const evA1 = rcA1.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a1 = evA1.args.articleId;

  const txA2 = await articles.connect(bob).publishArticle(epochId, "ipfs://a2", "ipfs://m2", zero32, zero32);
  const rcA2 = await txA2.wait();
  const evA2 = rcA2.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a2 = evA2.args.articleId;

  const txA3 = await articles.connect(carol).publishArticle(epochId, "ipfs://a3", "ipfs://m3", zero32, zero32);
  const rcA3 = await txA3.wait();
  const evA3 = rcA3.logs.map((l) => { try { return articles.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === "ArticlePublished");
  const a3 = evA3.args.articleId;

  console.log("\nArticles published:", a1.toString(), a2.toString(), a3.toString());

  // -------- stake (approve Staking first) --------
  const approveAmt = hre.ethers.parseUnits("5000", 18);
  await (await token.connect(alice).approve(stakingAddr, approveAmt)).wait();
  await (await token.connect(bob).approve(stakingAddr, approveAmt)).wait();
  await (await token.connect(carol).approve(stakingAddr, approveAmt)).wait();

  // Demonstrate: quadratic influence affects ranking only
  // - Alice stakes 400 on a1 (eff sqrt(400)=20)
  // - Bob stakes 400 on a1 (eff +20 => 40)
  // - Carol (whale-ish) stakes 1600 on a2 (eff sqrt(1600)=40)
  // This ties on influence; tie-break uses raw stake then articleId.
  // Rewards are raw-stake based among winners.
  const s400 = hre.ethers.parseUnits("400", 18);
  const s1600 = hre.ethers.parseUnits("1600", 18);
  const s10 = hre.ethers.parseUnits("10", 18);

  await (await staking.connect(alice).stake(epochId, a1, s400)).wait();
  await (await staking.connect(bob).stake(epochId, a1, s400)).wait();
  await (await staking.connect(carol).stake(epochId, a2, s1600)).wait();

  // add a small losing stake to create redistribution pool
  await (await staking.connect(alice).stake(epochId, a3, s10)).wait();

  console.log("\nStakes placed.");
  await logBalances(token, "after staking (tokens moved into Staking contract escrow)");

  // -------- advance time past stakingEnd --------
  const latest = await now();
  const jump = BigInt(stakingEnd) - latest + 2n;
  if (jump > 0n) {
    await hre.network.provider.send("evm_increaseTime", [Number(jump)]);
    await hre.network.provider.send("evm_mine");
  }
  console.log("\nAdvanced time beyond stakingEnd.");

  // -------- finalize epoch --------
  // Pull writer pool from bucket funds into Rewards.
  const writerPool = hre.ethers.parseUnits("300", 18);
  await (await rewards.connect(deployer).finalizeEpoch(epochId, writerPool)).wait();
  console.log("Epoch finalized with writerPool =", hre.ethers.formatUnits(writerPool, 18), "CITE");

  // -------- claim writer rewards --------
  // For v1 rule: nPaid = min(clamp(A,3,10),A). With A=3, nPaid=3, so all 3 articles are winners.
  // (If you later want "only top subset", set min to 1 or change clamp rule.)
  await (await rewards.connect(alice).claimWriter(epochId, a1)).wait();
  await (await rewards.connect(bob).claimWriter(epochId, a2)).wait();
  await (await rewards.connect(carol).claimWriter(epochId, a3)).wait();
  console.log("Writer claims complete.");

  // -------- claim reader rewards --------
  await (await rewards.connect(alice).claimReader(epochId)).wait();
  await (await rewards.connect(bob).claimReader(epochId)).wait();
  await (await rewards.connect(carol).claimReader(epochId)).wait();
  console.log("Reader claims complete.");

  await logBalances(token, "after claims");

  console.log("\nDemo flow complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});