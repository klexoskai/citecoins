/**
 * Create one bucket, fund it, create an epoch, time-warp into Submission, publish 3 articles.
 *
 * Prerequisites: `npx hardhat node` running; contracts deployed with `--network localhost`;
 * writer (Hardhat account #2) has CITE — e.g. run `npm run fund:roles` first.
 *
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/bucketAndArticles.js --network localhost
 *
 * Optional:
 *   TOPIC_URI=ipfs://... FUND_AMOUNT=10000 PROTOCOL_ADDRESS=0x... npx hardhat run scripts/bucketAndArticles.js --network localhost
 */
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS to CitecoinsProtocol from deploy output.\n" +
        "  PROTOCOL_ADDRESS=0x... npx hardhat run scripts/bucketAndArticles.js --network localhost"
    );
  }

  const [, funder, writer] = await hre.ethers.getSigners();
  const topicURI = process.env.TOPIC_URI ?? "ipfs://bafytest-topic-guidelines";
  const fundHuman = process.env.FUND_AMOUNT ?? "10000";

  const protocol = await hre.ethers.getContractAt(
    "CitecoinsProtocol",
    protocolAddr
  );
  const token = await hre.ethers.getContractAt(
    "CitecoinToken",
    await protocol.token()
  );
  const buckets = await hre.ethers.getContractAt(
    "BucketManager",
    await protocol.buckets()
  );
  const epochs = await hre.ethers.getContractAt(
    "EpochManager",
    await protocol.epochs()
  );
  const articles = await hre.ethers.getContractAt(
    "ArticleRegistry",
    await protocol.articles()
  );

  const bucketsAddr = await buckets.getAddress();
  const articlesAddr = await articles.getAddress();

  console.log("Funder (signer[1], bucket + fund + epoch):", funder.address);
  console.log(
    "Writer (signer[2], publishes articles):  ",
    writer.address,
    "\n  → txns use this EOA as msg.sender; on-chain `author` will match this address."
  );

  // ── 1. Create bucket ─────────────────────────────────────────────────────
  await (await buckets.connect(funder).createBucket(topicURI)).wait();
  const bucketId = (await buckets.nextBucketId()) - 1n;
  console.log("Bucket created, bucketId:", bucketId.toString());

  // ── 2. Fund bucket ─────────────────────────────────────────────────────────
  const fundAmount = hre.ethers.parseUnits(fundHuman, 18);
  await (await token.connect(funder).approve(bucketsAddr, fundAmount)).wait();
  await (await buckets.connect(funder).fundBucket(bucketId, fundAmount)).wait();
  console.log("Funded bucket with", fundHuman, "CITE");

  // ── 3. Create epoch (timestamps relative to "now") ─────────────────────────
  const latest = BigInt(await time.latest());
  const submissionStart = latest + 120n;
  const submissionEnd = submissionStart + 10_000n;
  const stakingStart = submissionEnd;
  const stakingEnd = stakingStart + 10_000n;

  await (
    await epochs.connect(funder).createEpoch(
      bucketId,
      submissionStart,
      submissionEnd,
      stakingStart,
      stakingEnd
    )
  ).wait();
  const epochId = (await epochs.nextEpochId()) - 1n;
  console.log("Epoch created, epochId:", epochId.toString());

  // ── 4. Enter Submission phase ──────────────────────────────────────────────
  await time.increaseTo(submissionStart);
  const phase = await epochs.currentPhase(epochId);
  // Phase enum: 0 NotStarted, 1 Submission, 2 Staking, 3 Ended
  console.log("Phase after warp (1 = Submission):", phase.toString());

  // ── 5. Publish 3 articles (same epoch, same bucket via epoch) ─────────────
  const minStake = await articles.MIN_WRITER_STAKE();
  const totalApprove = minStake * 3n;
  const writerBal = await token.balanceOf(writer.address);
  if (writerBal < totalApprove) {
    throw new Error(
      `Writer needs at least ${hre.ethers.formatEther(totalApprove)} CITE (3 × min stake). ` +
        `Got ${hre.ethers.formatEther(writerBal)}. Run fund:roles first.`
    );
  }

  const approveTx = await (
    await token.connect(writer).approve(articlesAddr, totalApprove)
  ).wait();
  console.log(
    "approve(ArticleRegistry) from writer",
    writer.address,
    "— tx",
    approveTx.hash
  );

  const bodies = [
    "Demo article A — intro",
    "Demo article B — methods",
    "Demo article C — conclusion",
  ];

  for (let i = 0; i < bodies.length; i++) {
    const contentCID = `ipfs://bafyarticle-${i + 1}`;
    const contentHash = hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(bodies[i])
    );
    const tx = await articles
      .connect(writer)
      .publishArticle(epochId, contentCID, contentHash, minStake);
    const receipt = await tx.wait();
    const articleId = (await articles.nextArticleId()) - 1n;
    const log = receipt.logs.find((l) => {
      try {
        return articles.interface.parseLog(l)?.name === "ArticlePublished";
      } catch {
        return false;
      }
    });
    let authorOnChain = writer.address;
    if (log) {
      const parsed = articles.interface.parseLog(log);
      authorOnChain = parsed.args.author ?? writer.address;
    }
    console.log(
      `publishArticle #${i + 1} — signer[2] / author ${authorOnChain} — articleId ${articleId} — tx ${receipt.hash}`
    );
  }

  const list = await articles.getEpochArticles(epochId);
  console.log("Epoch article IDs:", list.map((x) => x.toString()).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
