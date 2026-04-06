/**
 * Warp past staking end and call Rewards.finalizeEpoch.
 *
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/finalizeEpoch.js --network localhost
 *
 * Optional:
 *   EPOCH_ID=1 WRITER_POOL_AMOUNT_HUMAN=5000 PROTOCOL_ADDRESS=0x...
 *
 * writerPoolAmount is pulled from the bucket into Rewards (must be <= bucket fundedRewards).
 */
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS, e.g.\n" +
        "  PROTOCOL_ADDRESS=0x... npx hardhat run scripts/finalizeEpoch.js --network localhost"
    );
  }

  const epochId = BigInt(process.env.EPOCH_ID ?? "1");
  const writerPoolHuman = process.env.WRITER_POOL_AMOUNT_HUMAN ?? "5000";

  const protocol = await hre.ethers.getContractAt(
    "CitecoinsProtocol",
    protocolAddr
  );
  const epochs = await hre.ethers.getContractAt(
    "EpochManager",
    await protocol.epochs()
  );
  const rewards = await hre.ethers.getContractAt(
    "Rewards",
    await protocol.rewards()
  );
  const articleRegistry = await hre.ethers.getContractAt(
    "ArticleRegistry",
    await protocol.articles()
  );

  const [, , , , stakeEnd] = await epochs.getEpoch(epochId);
  await time.increaseTo(stakeEnd + 1n);

  const phase = await epochs.currentPhase(epochId);
  console.log("Phase (3 = Ended):", phase.toString());

  const writerPoolAmount = hre.ethers.parseUnits(writerPoolHuman, 18);
  const tx = await rewards.finalizeEpoch(epochId, writerPoolAmount);
  const receipt = await tx.wait();
  console.log("finalizeEpoch tx:", receipt.hash);

  const r = await rewards.results(epochId);
  console.log("EpochResult — finalized:", r.finalized, "nPaid:", r.nPaid.toString());
  console.log("  writerPool (bucket pull):", hre.ethers.formatEther(r.writerPool));
  console.log("  readerPool (loser stakes − fee):", hre.ethers.formatEther(r.readerPool));

  const winners = await rewards.getWinners(epochId);
  console.log(
    "  winners (rank 1, 2, …):",
    winners.map((x) => x.toString()).join(", ")
  );

  const inEpoch = await articleRegistry.getEpochArticles(epochId);
  console.log(
    "  all articleIds in epoch (unordered):",
    inEpoch.map((x) => x.toString()).join(", ")
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
