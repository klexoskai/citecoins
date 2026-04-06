console.log("script started");

async function loadArtifact(path) {
  const raw = await remix.call("fileManager", "getFile", path);
  const parsed = JSON.parse(raw);
  console.log("loaded artifact:", path);
  console.log("artifact keys:", Object.keys(parsed));
  return parsed;
}

function getAbi(artifact) {
  return artifact.abi || artifact.output?.abi;
}

function getBytecode(artifact) {
  const bytecode =
    artifact.bytecode ||
    artifact.evm?.bytecode?.object ||
    artifact.data?.bytecode?.object ||
    artifact.output?.evm?.bytecode?.object;

  if (!bytecode) {
    throw new Error("No bytecode found in artifact");
  }

  return bytecode.startsWith("0x") ? bytecode : "0x" + bytecode;
}

async function deployContract(web3, artifact, args, from, label) {
  const abi = getAbi(artifact);
  const bytecode = getBytecode(artifact);

  if (!abi) {
    throw new Error(`No ABI found for ${label}`);
  }

  console.log(`Deploying ${label}...`);

  const contract = new web3.eth.Contract(abi);
  const deployed = await contract
    .deploy({
      data: bytecode,
      arguments: args,
    })
    .send({ from, gas: 9000000 });

  console.log(`${label}:`, deployed.options.address);
  return deployed;
}

async function main() {
  const accounts = await web3.eth.getAccounts();
  console.log("accounts found:", accounts.length);

  const admin = accounts[0];
  const topicCreator = accounts[1];
  const writerA = accounts[2];
  const writerB = accounts[3];
  const writerC = accounts[4];
  const readerX = accounts[5];
  const readerY = accounts[6];
  const readerZ = accounts[7];

  const toWei = (x) => web3.utils.toWei(x, "ether");

  // If these paths fail, tell me the exact artifact folder structure and I'll adjust them.
  const citeTokenArtifact = await loadArtifact("browser/artifacts/CiteToken.json");
  const treasuryArtifact = await loadArtifact("browser/artifacts/ProtocolTreasury.json");
  const topicManagerArtifact = await loadArtifact("browser/artifacts/TopicManagerDemo.json");
  const articleRegistryArtifact = await loadArtifact("browser/artifacts/ArticleRegistry.json");
  const votingArtifact = await loadArtifact("browser/artifacts/CommitRevealVoting.json");
  const settlementArtifact = await loadArtifact("browser/artifacts/SettlementDemo.json");

  console.log("Starting deployment sequence...");

  const citeToken = await deployContract(
    web3,
    citeTokenArtifact,
    [toWei("1000")],
    admin,
    "CiteToken"
  );

  const treasury = await deployContract(
    web3,
    treasuryArtifact,
    [citeToken.options.address],
    admin,
    "ProtocolTreasury"
  );

  const topicManager = await deployContract(
    web3,
    topicManagerArtifact,
    [treasury.options.address],
    admin,
    "TopicManagerDemo"
  );

  const articleRegistry = await deployContract(
    web3,
    articleRegistryArtifact,
    [treasury.options.address, topicManager.options.address],
    admin,
    "ArticleRegistry"
  );

  const voting = await deployContract(
    web3,
    votingArtifact,
    [treasury.options.address, topicManager.options.address, articleRegistry.options.address],
    admin,
    "CommitRevealVoting"
  );

  const settlement = await deployContract(
    web3,
    settlementArtifact,
    [
      treasury.options.address,
      topicManager.options.address,
      articleRegistry.options.address,
      voting.options.address,
    ],
    admin,
    "SettlementDemo"
  );

  console.log("Wiring contracts...");

  await topicManager.methods
    .setArticleRegistry(articleRegistry.options.address)
    .send({ from: admin, gas: 300000 });

  await topicManager.methods
    .setSettlement(settlement.options.address)
    .send({ from: admin, gas: 300000 });

  await topicManager.methods
    .setDemoMode(true)
    .send({ from: admin, gas: 300000 });

  await treasury.methods
    .setController(topicManager.options.address, true)
    .send({ from: admin, gas: 300000 });

  await treasury.methods
    .setController(articleRegistry.options.address, true)
    .send({ from: admin, gas: 300000 });

  await treasury.methods
    .setController(voting.options.address, true)
    .send({ from: admin, gas: 300000 });

  await treasury.methods
    .setController(settlement.options.address, true)
    .send({ from: admin, gas: 300000 });

  console.log("Distributing tokens...");

  await citeToken.methods
    .transfer(topicCreator, toWei("200"))
    .send({ from: admin, gas: 300000 });

  for (const user of [writerA, writerB, writerC, readerX, readerY, readerZ]) {
    await citeToken.methods
      .transfer(user, toWei("50"))
      .send({ from: admin, gas: 300000 });
  }

  console.log("Approving treasury...");

  await citeToken.methods
    .approve(treasury.options.address, toWei("200"))
    .send({ from: topicCreator, gas: 300000 });

  for (const user of [writerA, writerB, writerC, readerX, readerY, readerZ]) {
    await citeToken.methods
      .approve(treasury.options.address, toWei("50"))
      .send({ from: user, gas: 300000 });
  }

  console.log("Creating topic...");

  await topicManager.methods
    .createTopic("Gaza", toWei("100"), 1000, 1000, 1000)
    .send({ from: topicCreator, gas: 600000 });

  console.log("Submitting articles...");

  await articleRegistry.methods
    .submitArticle(0, "QmArticleA", "QmEvidenceA", toWei("10"))
    .send({ from: writerA, gas: 600000 });

  await articleRegistry.methods
    .submitArticle(0, "QmArticleB", "QmEvidenceB", toWei("10"))
    .send({ from: writerB, gas: 600000 });

  await articleRegistry.methods
    .submitArticle(0, "QmArticleC", "QmEvidenceC", toWei("10"))
    .send({ from: writerC, gas: 600000 });

  console.log("✅ SETUP COMPLETE");
  console.log("Admin:", admin);
  console.log("Topic Creator:", topicCreator);
  console.log("Writer A:", writerA);
  console.log("Writer B:", writerB);
  console.log("Writer C:", writerC);
  console.log("Reader X:", readerX);
  console.log("Reader Y:", readerY);
  console.log("Reader Z:", readerZ);

  console.log("CiteToken:", citeToken.options.address);
  console.log("ProtocolTreasury:", treasury.options.address);
  console.log("TopicManagerDemo:", topicManager.options.address);
  console.log("ArticleRegistry:", articleRegistry.options.address);
  console.log("CommitRevealVoting:", voting.options.address);
  console.log("SettlementDemo:", settlement.options.address);

  console.log("Next manual steps:");
  console.log("1. TopicManagerDemo.setPhaseForDemo(0, 1)");
  console.log("2. Generate hashes with HashHelper");
  console.log("3. Commit votes from Reader X, Reader Y, Reader Z");
  console.log("4. TopicManagerDemo.setPhaseForDemo(0, 2)");
  console.log("5. Reveal votes");
  console.log("6. TopicManagerDemo.setPhaseForDemo(0, 3)");
  console.log("7. SettlementDemo.getRankedArticles(0)");
  console.log("8. SettlementDemo.previewWriterPayouts(0)");
  console.log("9. SettlementDemo.resolveTopic(0)");
  console.log("10. Winning readers call claimReaderReward(0)");
}

main().catch((err) => {
  console.error("SCRIPT ERROR:");
  console.error(err);
});