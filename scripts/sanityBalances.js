/**
 * Print CITE balances for protocol, deployer, funder, each unique article author,
 * reader, plus bucket accounting. Run anytime on localhost after setup / claims.
 *
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/sanityBalances.js --network localhost
 *
 * Optional: EPOCH_ID=1 BUCKET_ID= (omit to use bucket from epoch)
 */
const hre = require("hardhat");

function fmt(n) {
  return hre.ethers.formatEther(n);
}

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS, e.g.\n" +
        "  PROTOCOL_ADDRESS=0x... npx hardhat run scripts/sanityBalances.js --network localhost"
    );
  }

  const epochId = BigInt(process.env.EPOCH_ID ?? "1");
  const bucketIdEnv = process.env.BUCKET_ID;

  const [deployer, funder, , reader] = await hre.ethers.getSigners();

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
  const rewards = await hre.ethers.getContractAt(
    "Rewards",
    await protocol.rewards()
  );
  const staking = await hre.ethers.getContractAt(
    "Staking",
    await protocol.staking()
  );

  const bucketsAddr = await buckets.getAddress();

  const bucketId =
    bucketIdEnv !== undefined
      ? BigInt(bucketIdEnv)
      : (await epochs.getEpoch(epochId))[0];

  const line = (label, address, bal) => {
    console.log(`${label.padEnd(28)} ${address}`);
    console.log(`${"".padEnd(28)} ${fmt(bal)} CITE`);
  };

  console.log("=== CITE token balances (human-readable) ===\n");

  await line(
    "CitecoinsProtocol contract",
    protocolAddr,
    await token.balanceOf(protocolAddr)
  );
  await line("Deployer [0]", deployer.address, await token.balanceOf(deployer.address));
  await line("Funder [1]", funder.address, await token.balanceOf(funder.address));

  const ids = await articles.getEpochArticles(epochId);
  const seen = new Set();
  let w = 0;
  for (const aid of ids) {
    const author = (await articles.getArticle(aid))[0];
    const key = author.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    w += 1;
    await line(`Author (article ${aid}) [${w}]`, author, await token.balanceOf(author));
  }
  if (ids.length === 0) {
    console.log("(no articles in epoch — run demo:articles first)\n");
  }

  await line("Reader [3]", reader.address, await token.balanceOf(reader.address));

  await line("Rewards contract", await rewards.getAddress(), await token.balanceOf(await rewards.getAddress()));
  await line("Staking contract", await staking.getAddress(), await token.balanceOf(await staking.getAddress()));
  await line("ArticleRegistry", await articles.getAddress(), await token.balanceOf(await articles.getAddress()));

  console.log("\n=== Bucket accounting (same units: CITE) ===\n");

  const [, , fundedRewards, active] = await buckets.getBucket(bucketId);
  const bucketTokenBalance = await token.balanceOf(bucketsAddr);

  console.log(`Bucket ID: ${bucketId.toString()}  active: ${active}`);
  console.log(
    `  fundedRewards (booked to this bucket): ${fmt(fundedRewards)} CITE`
  );
  console.log(
    `  BucketManager total token balance:   ${fmt(bucketTokenBalance)} CITE (all buckets)`
  );

  console.log(`
--- Are buckets “completely drained”? ---
No. At finalizeEpoch, only writerPoolAmount is withdrawn from the bucket into Rewards
(up to fundedRewards). If you funded 10,000 CITE but finalized with WRITER_POOL 5,000,
about 5,000 CITE remains in fundedRewards for that bucket (tokens still in BucketManager).
The bucket is then deactivated; nothing in this MVP pulls the remainder automatically.

If writerPoolAmount equals what was funded (or the full fundedRewards), booked balance
can go to ~0; any tiny remainder is rounding or unwithdrawn dust.
`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
