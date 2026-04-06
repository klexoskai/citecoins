/**
 * After finalizeEpoch: reader pulls via claimReader; each winning author pulls via claimWriter.
 *
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/claimRewards.js --network localhost
 *
 * Expects same signers as fundRoles: [2]=writer, [3]=reader. Epoch must be finalized.
 *
 * Optional: EPOCH_ID=1 PROTOCOL_ADDRESS=0x...
 */
const hre = require("hardhat");

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS, e.g.\n" +
        "  PROTOCOL_ADDRESS=0x... npx hardhat run scripts/claimRewards.js --network localhost"
    );
  }

  const epochId = BigInt(process.env.EPOCH_ID ?? "1");

  const [, , writer, reader] = await hre.ethers.getSigners();
  const signers = await hre.ethers.getSigners();

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
  const rewards = await hre.ethers.getContractAt(
    "Rewards",
    await protocol.rewards()
  );
  const articles = await hre.ethers.getContractAt(
    "ArticleRegistry",
    await protocol.articles()
  );

  const r = await rewards.results(epochId);
  if (!r.finalized) {
    throw new Error("Epoch not finalized — run demo:finalize first.");
  }

  const [bucketId] = await epochs.getEpoch(epochId);
  const [, , fundedBefore, active] = await buckets.getBucket(bucketId);
  const rewardsAddr = await rewards.getAddress();
  const tokenBal = async (addr, label) => {
    const b = await token.balanceOf(addr);
    console.log(`  CITE ${label}:`, hre.ethers.formatEther(b));
  };

  console.log("--- Before claims ---");
  console.log(
    `bucket ${bucketId} fundedRewards (booked in bucket, not yet claimed by writers):`,
    hre.ethers.formatEther(fundedBefore),
    "active:",
    active
  );
  await tokenBal(rewardsAddr, "Rewards contract");
  await tokenBal(reader.address, "reader");
  await tokenBal(writer.address, "writer");

  // ── Reader claim (one tx per epoch for this reader) ───────────────────────
  const readerResponse = await rewards.connect(reader).claimReader(epochId);
  const readerReceipt = await readerResponse.wait();
  console.log("\nclaimReader tx:", readerReceipt.hash);

  // ── Writer claims (one per winning article this author owns) ─────────────
  const winnerIds = await rewards.getWinners(epochId);
  console.log("\nWinning articleIds:", winnerIds.map((x) => x.toString()).join(", "));

  for (const aid of winnerIds) {
    const author = (await articles.getArticle(aid))[0];
    const s = signers.find(
      (x) => x.address.toLowerCase() === author.toLowerCase()
    );
    if (!s) {
      console.warn(
        `Skip claimWriter for article ${aid}: author ${author} not in Hardhat signers.`
      );
      continue;
    }
    const tx = await rewards.connect(s).claimWriter(epochId, aid);
    await tx.wait();
    console.log(`claimWriter article ${aid} tx:`, tx.hash);
  }

  console.log("\n--- After claims ---");
  const [, , fundedAfter] = await buckets.getBucket(bucketId);
  console.log(
    `bucket ${bucketId} fundedRewards:`,
    hre.ethers.formatEther(fundedAfter),
    "(unchanged by claim* — bucket was already debited at finalizeEpoch)"
  );
  await tokenBal(rewardsAddr, "Rewards contract");
  await tokenBal(reader.address, "reader");
  await tokenBal(writer.address, "writer");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
