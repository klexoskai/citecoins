// const { expect } = require("chai");
// const hre = require("hardhat");

// describe("Citecoins Protocol - End-to-End Flow", function () {
//   let Protocol;
//   let protocol;

//   let token;
//   let buckets;
//   let epochs;
//   let articles;
//   let staking;
//   let rewards;

//   let owner, writer, reader1, reader2, others;

//   const ONE = 10n ** 18n;
//   const INITIAL_SUPPLY = 1_000_000n * ONE;
//   const WRITER_STAKE = 10n * ONE;
//   const READER_STAKE = 50n * ONE;
//   const WRITER_POOL = 500n * ONE;

//   beforeEach(async function () {
//     [owner, writer, reader1, reader2, ...others] = await hre.ethers.getSigners();

//     Protocol = await hre.ethers.getContractFactory("CitecoinsProtocol");
//     protocol = await Protocol.deploy(INITIAL_SUPPLY);
//     await protocol.waitForDeployment();

//     token = await hre.ethers.getContractAt("CitecoinToken", await protocol.token());
//     buckets = await hre.ethers.getContractAt("BucketManager", await protocol.buckets());
//     epochs = await hre.ethers.getContractAt("EpochManager", await protocol.epochs());
//     articles = await hre.ethers.getContractAt("ArticleRegistry", await protocol.articles());
//     staking = await hre.ethers.getContractAt("Staking", await protocol.staking());
//     rewards = await hre.ethers.getContractAt("Rewards", await protocol.rewards());
//   });

//   async function latestTs() {
//     const block = await hre.ethers.provider.getBlock("latest");
//     return block.timestamp;
//   }

//   async function increaseTime(seconds) {
//     await hre.network.provider.send("evm_increaseTime", [seconds]);
//     await hre.network.provider.send("evm_mine");
//   }

//   function commitHash(articleId, voteTrue, saltString) {
//     const salt = hre.ethers.encodeBytes32String(saltString);
//     return hre.ethers.solidityPackedKeccak256(
//       ["uint256", "bool", "bytes32"],
//       [articleId, voteTrue, salt]
//     );
//   }

//   describe("Deployment", function () {
//     it("Should deploy protocol and all child contracts", async function () {
//       expect(await protocol.getAddress()).to.properAddress;
//       expect(await token.getAddress()).to.properAddress;
//       expect(await buckets.getAddress()).to.properAddress;
//       expect(await epochs.getAddress()).to.properAddress;
//       expect(await articles.getAddress()).to.properAddress;
//       expect(await staking.getAddress()).to.properAddress;
//       expect(await rewards.getAddress()).to.properAddress;
//     });

//     it("Owner should hold initial supply for this happy-path flow", async function () {
//       const ownerBal = await token.balanceOf(owner.address);
//       expect(ownerBal).to.equal(INITIAL_SUPPLY);
//     });
//   });

//   describe("8-step happy path", function () {
//     it("Should follow bucket -> epoch -> article -> commit -> reveal -> finalize -> claim flow", async function () {
//       // =========================================================
//       // STEP 1 — Distribute tokens
//       // =========================================================
//       await expect(
//         token.connect(owner).transfer(writer.address, 100n * ONE)
//       ).to.not.be.reverted;

//       await expect(
//         token.connect(owner).transfer(reader1.address, 100n * ONE)
//       ).to.not.be.reverted;

//       await expect(
//         token.connect(owner).transfer(reader2.address, 100n * ONE)
//       ).to.not.be.reverted;

//       expect(await token.balanceOf(writer.address)).to.equal(100n * ONE);
//       expect(await token.balanceOf(reader1.address)).to.equal(100n * ONE);
//       expect(await token.balanceOf(reader2.address)).to.equal(100n * ONE);

//       // =========================================================
//       // STEP 2 — Create bucket and fund it
//       // =========================================================
//       const createBucketTx = await buckets.connect(owner).createBucket("ipfs://QmTestTopic");
//       const createBucketRcpt = await createBucketTx.wait();

//       // Assumes bucketId starts at 1
//       const bucketId = 1n;

//       await expect(
//         token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL)
//       ).to.not.be.reverted;

//       await expect(
//         buckets.connect(owner).fundBucket(bucketId, WRITER_POOL)
//       ).to.not.be.reverted;

//       const bucket = await buckets.getBucket(bucketId);
//       expect(bucket[2]).to.equal(WRITER_POOL); // fundedRewards
//       expect(bucket[3]).to.equal(true);        // active

//       // =========================================================
//       // STEP 3 — Create epoch
//       // =========================================================
//       const now = await latestTs();

//       const submissionStart = now + 60;
//       const submissionEnd = now + 120;
//       const stakingStart = now + 120;
//       const stakingEnd = now + 240;

//       await expect(
//         epochs.connect(owner).createEpoch(
//           bucketId,
//           submissionStart,
//           submissionEnd,
//           stakingStart,
//           stakingEnd
//         )
//       ).to.not.be.reverted;

//       const epochId = 1n;

//       expect(await epochs.currentPhase(epochId)).to.equal(0); // NotStarted

//       // Wait 1 min -> Submission phase
//       await increaseTime(61);
//       expect(await epochs.currentPhase(epochId)).to.equal(1); // Submission

//       // =========================================================
//       // STEP 4 — Submit article
//       // =========================================================
//       await expect(
//         token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE)
//       ).to.not.be.reverted;

//       const contentHash =
//         "0x1234567890123456789012345678901234567890123456789012345678901234";

//       await expect(
//         articles.connect(writer).publishArticle(
//           epochId,
//           "ipfs://QmArticleContent",
//           contentHash,
//           WRITER_STAKE
//         )
//       ).to.not.be.reverted;

//       const articleId = 1n;

//       const epochArticles = await articles.getEpochArticles(epochId);
//       expect(epochArticles.map((x) => BigInt(x))).to.deep.equal([articleId]);

//       const article = await articles.getArticle(articleId);
//       expect(article.author).to.equal(writer.address); // author
//       expect(article.eligible).to.equal(true);           // eligible
//       // If your struct layout differs, adjust the index above.

//       // Wait until staking phase
//       await increaseTime(61);
//       expect(await epochs.currentPhase(epochId)).to.equal(2); // Staking

//       // =========================================================
//       // STEP 5 — Commit votes
//       // =========================================================
//       const salt1 = "salt_reader3";
//       const salt2 = "salt_reader4";

//       const hash1 = commitHash(articleId, true, salt1);
//       const hash2 = commitHash(articleId, false, salt2);

//       await expect(
//         token.connect(reader1).approve(await staking.getAddress(), READER_STAKE)
//       ).to.not.be.reverted;

//       await expect(
//         token.connect(reader2).approve(await staking.getAddress(), READER_STAKE)
//       ).to.not.be.reverted;

//       await expect(
//         staking.connect(reader1).commitVote(epochId, articleId, hash1, READER_STAKE)
//       ).to.not.be.reverted;

//       await expect(
//         staking.connect(reader2).commitVote(epochId, articleId, hash2, READER_STAKE)
//       ).to.not.be.reverted;

//       // =========================================================
//       // STEP 6 — Reveal votes
//       // =========================================================
//       await expect(
//         staking.connect(reader1).revealVote(
//           epochId,
//           articleId,
//           true,
//           hre.ethers.encodeBytes32String(salt1)
//         )
//       ).to.not.be.reverted;

//       await expect(
//         staking.connect(reader2).revealVote(
//           epochId,
//           articleId,
//           false,
//           hre.ethers.encodeBytes32String(salt2)
//         )
//       ).to.not.be.reverted;

//       const tally = await staking.getTally(epochId, articleId);

//       // Your notes expect sqrt(50e18) to become 7-ish.
//       // If your code scales differently, adjust these assertions.
//       expect(BigInt(tally[0])).to.be.greaterThan(0n); // trueWeight
//       expect(BigInt(tally[1])).to.be.greaterThan(0n); // falseWeight

//       await increaseTime(121);
//       expect(await epochs.currentPhase(epochId)).to.equal(3); // Ended

//       // =========================================================
//       // STEP 7 — Finalize
//       // =========================================================
//       await expect(
//         rewards.connect(owner).finalizeEpoch(epochId, WRITER_POOL)
//       ).to.not.be.reverted;

//       // Optional bucket post-check
//       const bucketAfter = await buckets.getBucket(bucketId);
//       expect(bucketAfter[3]).to.equal(false); // bucket inactive after finalization

//       // =========================================================
//       // STEP 8 — Claim rewards
//       // =========================================================
//       const writerBalBefore = await token.balanceOf(writer.address);
//       await expect(
//         rewards.connect(writer).claimWriter(epochId, articleId)
//       ).to.not.be.reverted;
//       const writerBalAfter = await token.balanceOf(writer.address);

//       expect(writerBalAfter).to.be.gt(writerBalBefore);

//       const reader1BalBefore = await token.balanceOf(reader1.address);
//       await expect(
//         rewards.connect(reader1).claimReader(epochId)
//       ).to.not.be.reverted;

//       const reader1BalAfter = await token.balanceOf(reader1.address);

//       expect(reader1BalAfter).to.be.gte(reader1BalBefore);

//       const reader2BalBefore = await token.balanceOf(reader2.address);
//       await expect(
//         rewards.connect(reader2).claimReader(epochId)
//       ).to.not.be.reverted;
//       const reader2BalAfter = await token.balanceOf(reader2.address);

//       // If your code really slashes losing minority voters on the only article,
//       // then this should be unchanged or lower.
//       // If not, you may need to relax or change this assertion.
//       expect(reader2BalAfter).to.be.lte(reader2BalBefore);

//       // Writer should roughly end up above initial 100 because:
//       // 100 - 10 stake + 10 returned + reward
//       expect(writerBalAfter).to.be.gt(100n * ONE);
//     });
//   });

//   describe("Relevant negative checks", function () {
//     it("Should revert if funding bucket without approval", async function () {
//       await buckets.connect(owner).createBucket("ipfs://QmTestTopic");

//       await expect(
//         buckets.connect(owner).fundBucket(1, WRITER_POOL)
//       ).to.be.reverted;
//     });

//     it("Should revert if publishing article outside submission phase", async function () {
//       await buckets.connect(owner).createBucket("ipfs://QmTestTopic");

//       const now = await latestTs();
//       await token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL);
//       await buckets.connect(owner).fundBucket(1, WRITER_POOL);

//       await epochs.connect(owner).createEpoch(
//         1,
//         now + 60,
//         now + 120,
//         now + 120,
//         now + 240
//       );

//       await token.connect(owner).transfer(writer.address, 100n * ONE);
//       await token.connect(writer).approve(await articles.getAddress(), WRITER_STAKE);

//       const contentHash =
//         "0x1234567890123456789012345678901234567890123456789012345678901234";

//       await expect(
//         articles.connect(writer).publishArticle(
//           1,
//           "ipfs://QmArticleContent",
//           contentHash,
//           WRITER_STAKE
//         )
//       ).to.be.reverted;
//     });

//     it("Should revert if finalize is called before epoch end", async function () {
//       await buckets.connect(owner).createBucket("ipfs://QmTestTopic");

//       await token.connect(owner).approve(await buckets.getAddress(), WRITER_POOL);
//       await buckets.connect(owner).fundBucket(1, WRITER_POOL);

//       const now = await latestTs();
//       await epochs.connect(owner).createEpoch(
//         1,
//         now + 10,
//         now + 20,
//         now + 20,
//         now + 100
//       );

//       await expect(
//         rewards.connect(owner).finalizeEpoch(1, WRITER_POOL)
//       ).to.be.reverted;
//     });
//   });
// });