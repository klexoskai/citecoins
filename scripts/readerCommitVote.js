/**
 * Reader (Hardhat signer #3 — 4th account) commits + reveals a vote on one article.
 *
 * Requires Staking phase: run after `demo:articles`, same chain state.
 * Default: vote on articleId 2, epochId 1 (first demo run).
 *
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/readerCommitVote.js --network localhost
 *
 * Optional:
 *   EPOCH_ID=1 ARTICLE_ID=2 RAW_STAKE_HUMAN=100 VOTE_TRUE=true PROTOCOL_ADDRESS=0x...
 */
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS, e.g.\n" +
        "  PROTOCOL_ADDRESS=0x... npx hardhat run scripts/readerCommitVote.js --network localhost"
    );
  }

  const epochId = BigInt(process.env.EPOCH_ID ?? "1");
  const articleId = BigInt(process.env.ARTICLE_ID ?? "2");
  const rawStake = hre.ethers.parseUnits(process.env.RAW_STAKE_HUMAN ?? "100", 18);
  const voteTrue = process.env.VOTE_TRUE === "false" ? false : true;

  const [, , , reader] = await hre.ethers.getSigners();

  const protocol = await hre.ethers.getContractAt(
    "CitecoinsProtocol",
    protocolAddr
  );
  const token = await hre.ethers.getContractAt(
    "CitecoinToken",
    await protocol.token()
  );
  const epochs = await hre.ethers.getContractAt(
    "EpochManager",
    await protocol.epochs()
  );
  const staking = await hre.ethers.getContractAt(
    "Staking",
    await protocol.staking()
  );

  const stakingAddr = await staking.getAddress();

  console.log("Reader (signer index 3):", reader.address);

  // Enter Staking: must be strictly after Submission window (t > submissionEnd)
  const [, subStart, subEnd, stakeStart, stakeEnd] = await epochs.getEpoch(epochId);
  await time.increaseTo(subEnd + 1n);
  let phase = await epochs.currentPhase(epochId);
  console.log("Phase (2 = Staking):", phase.toString());

  const salt = hre.ethers.randomBytes(32);
  const commitHash = hre.ethers.solidityPackedKeccak256(
    ["uint256", "bool", "bytes32"],
    [articleId, voteTrue, salt]
  );

  const bal = await token.balanceOf(reader.address);
  if (bal < rawStake) {
    throw new Error(
      `Reader balance ${hre.ethers.formatEther(bal)} CITE < stake ${hre.ethers.formatEther(rawStake)}. Run fund:roles.`
    );
  }

  await (await token.connect(reader).approve(stakingAddr, rawStake)).wait();

  const tx1 = await staking
    .connect(reader)
    .commitVote(epochId, articleId, commitHash, rawStake);
  await tx1.wait();
  console.log(
    `commitVote — epoch ${epochId} article ${articleId} rawStake ${hre.ethers.formatEther(rawStake)} CITE`
  );

  const tx2 = await staking
    .connect(reader)
    .revealVote(epochId, articleId, voteTrue, salt);
  await tx2.wait();
  console.log("revealVote — voteTrue:", voteTrue);
  console.log("(Keep SALT for your records if you need to reproduce the commit)");
  console.log("SALT:", hre.ethers.hexlify(salt));

  const [, , , , eff] = await staking.getCommit(
    epochId,
    articleId,
    reader.address
  );
  console.log("Effective stake (√ raw):", eff.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
