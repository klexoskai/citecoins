const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deployer:", deployer.address);

  // 10M tokens with 18 decimals
  const initialSupply = hre.ethers.parseUnits("10000000", 18);

  const Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
  const protocol = await Protocol.deploy(initialSupply);
  await protocol.waitForDeployment();

  const protocolAddr = await protocol.getAddress();

  // Read component addresses from the protocol contract
  const token = await protocol.token();
  const buckets = await protocol.buckets();
  const epochs = await protocol.epochs();
  const articles = await protocol.articles();
  const staking = await protocol.staking();
  const rewards = await protocol.rewards();

  console.log("CitecoinsProtocol:", protocolAddr);
  console.log("CitecoinToken:", token);
  console.log("BucketManager:", buckets);
  console.log("EpochManager:", epochs);
  console.log("ArticleRegistry:", articles);
  console.log("Staking:", staking);
  console.log("Rewards:", rewards);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});