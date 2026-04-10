# CiteChain — Evidence-Backed Reporting + Market Staking (Solidity)

CiteChain is a blockchain-based publishing and incentive system that rewards **evidence-backed reporting**. Writers publish articles with attached evidence manifests (videos, images, source documents anchored on-chain). Readers stake **CITE tokens** on articles they believe are most credible using a commit-reveal scheme. After a defined staking window, the protocol ranks articles by quadratic reputation-weighted stake and distributes rewards.

> v1 uses **market staking only** for outcomes — no dispute resolution, no oracle-based truth. Rankings reflect market consensus, not factual verification.

---

## Repository Structure

```
contracts/
  CitecoinToken.sol       — ERC-20 CITE token with controlled minting
  BucketManager.sol       — topic buckets, creator staking, and reward pools
  EpochManager.sol        — time windows and phase gating
  ArticleRegistry.sol     — article submission and writer stakes
  Staking.sol             — commit-reveal voting and reader stakes
  Rewards.sol             — finalization, ranking, and reward distribution
  ReputationManager.sol   — per-voter reputation tracking (win/loss history)
  CitecoinsProtocol.sol   — deploys and wires all contracts in one transaction

  interfaces/             — IBucketManager, IEpochManager, IArticleRegistry,
                            IStaking, ICitecoinToken, IReputationManager
  libraries/
    MathUtils.sol         — isqrt (Babylonian method), winnersCount

docs/
  architecture.md         — on-chain component design and data flow
  contract-spec.md        — function signatures, structs, invariants
  tokenomics.md           — incentive design and reward math
  threat-model.md         — attack vectors and mitigations

test/
  CitecoinToken.js
  BucketManager.js
  EpochManager.js
  ArticleRegistry.js
  Staking.js
  Rewards.js
  CiteCoinsProtocol.js
  CiteCoinsFlow.js        — end-to-end happy path

scripts/
  deploy.js               — deploy CitecoinsProtocol and print all contract addresses
  demoFlow.js             — scripted demo of the full protocol flow

generate/
  generate.mjs            — helper to compute commit hashes for manual Remix testing
```

---

## Core Concepts

### Actors
- **Writers**: Publish articles with evidence manifests. Stake CITE to enter. Earn ranked rewards if their article wins.
- **Readers / Voters**: Commit blinded votes (with staked CITE) on articles they believe will rank highest. Earn a share of losing reader stakes if they back a winner.
- **Funders**: Create topic buckets and deposit reward pools for writers.

### Objects
- **Bucket**: A topic-specific reward pool. Creator stakes ≥ 100 CITE to create; stake is returned on successful finalization and slashed if the epoch fails to attract sufficient participation.
- **Epoch**: A time window for a bucket — `NotStarted → Submission → Staking → Ended → Finalized`.
- **Article**: On-chain record pointing to off-chain content (`contentCID`) and evidence manifest (`manifestCID`). Content and manifest hashes stored on-chain for tamper evidence. Immutable after submission.
- **Commit**: A blinded vote. Hidden until the epoch fully ends, then revealed by the voter.

---

## On-Chain Architecture

### Contracts

1. **`CitecoinToken`** — Standard ERC-20. Minting restricted to `Rewards` via a minter role granted at deployment.

2. **`BucketManager`** — Funders create topic buckets by staking `≥ 100 CITE`. Anyone can fund a bucket's reward pool. Creator stake is returned on successful finalization; slashed if fewer than 2 articles receive reader support.

3. **`EpochManager`** — Creates time-windowed epochs for a bucket. Single source of truth for phase gating across all contracts. Phases: `NotStarted → Submission → Staking → Ended`.

4. **`ArticleRegistry`** — Writers publish during Submission phase. Requires `≥ 10 CITE` writer stake and a non-empty evidence manifest (`manifestCID` + `manifestHash`). Writer stake is released to winners and slashed from losers at finalization.

5. **`Staking`** — Commit-reveal voting system:
   - **Commit** (Staking phase): lock CITE, submit `keccak256(abi.encode(epochId, articleId, salt))`
   - **Reveal** (after `Phase.Ended` only): submit plaintext vote; `effectiveStake = sqrt(rep * rawStake)` computed at reveal
   - Winning voter stakes returned at `claimReader`; losing voter stakes slashed at finalization
   - Voters who never reveal can call `reclaimStake` after finalization to recover their principal

6. **`ReputationManager`** — Tracks per-voter reputation bonus. All voters start at `effectiveRep = 1`. Winning a vote adds +1; losing deducts -1 (floored at 0, so effective rep never drops below 1). Updated automatically at finalization.

7. **`Rewards`** — Permissionless `finalizeEpoch(epochId, writerPoolAmount)` callable after epoch ends. Ranks articles by quadratic reputation-weighted effective stake. Selects top `nPaid = clamp(floor(A/2), 3, 10)` winners. Pull-based claims:
   - `claimWriter(epochId, articleId)` — rank-based exponential decay payout from bucket pool (rank 1 = 4/7, rank 2 = 2/7, rank 3 = 1/7 for nPaid=3)
   - `claimReader(epochId)` — stake principal returned + effectiveStake-proportional share of the reader pool (95% of losing reader stakes + slashed writer stakes combined)

8. **`CitecoinsProtocol`** — Factory that deploys all contracts and wires permissions in one transaction.

### Voting Weight

```
effectiveStake = sqrt(rawStake * reputation)
```

- **Quadratic weighting**: a voter with 10,000 CITE gets weight `sqrt(10,000) = 100`, not 10,000. Doubling stake increases influence by ~41%, not 2×.
- **Reputation multiplier**: `reputation = 1 + reputationBonus`. New voters start at 1; consistent winners accumulate a higher multiplier over time.

### Anti-Bandwagon

- Commit-reveal: votes hidden until epoch fully ends — no last-minute pile-in or copycat voting possible.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Hardhat](https://hardhat.org/)

```bash
npm install
```

---

## Running Tests

Run the full test suite:

```bash
npx hardhat test
```

Run a specific test file:

```bash
npx hardhat test test/CiteCoinsFlow.js
```

---

## Local Deployment

Start a local Hardhat node in one terminal:

```bash
npx hardhat node
```

Deploy to the local node in another terminal:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This prints all deployed contract addresses:

```
Deployer:             0x...
CitecoinsProtocol:    0x...
CitecoinToken:        0x...
BucketManager:        0x...
EpochManager:         0x...
ArticleRegistry:      0x...
Staking:              0x...
Rewards:              0x...
ReputationManager:    0x...
```

Run the scripted demo flow against the local node:

```bash
npx hardhat run scripts/demoFlow.js --network localhost
```

---

## Remix Testing

To test manually in [Remix IDE](https://remix.ethereum.org):

1. Compile and deploy `CitecoinsProtocol.sol` with `initialSupply = 1000000000000000000000000` (1M CITE)
2. Read each contract address from the deployed protocol instance (`token()`, `buckets()`, `epochs()`, etc.)
3. Use `generate/generate.mjs` to pre-compute commit hashes before the staking phase:

```bash
cd generate
node generate.mjs
```

This outputs the `commitVote` hashes and `revealVote` salts for all test accounts.

See `docs/` for the full step-by-step Remix walkthrough.

---

## Demo Flow (Summary)

1. Deploy `CitecoinsProtocol(initialSupply)`
2. Approve + `BucketManager.createBucket(topicURI, 100e18)`
3. `BucketManager.fundBucket(bucketId, amount)`
4. `EpochManager.createEpoch(bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd)`
5. Writers: approve + `ArticleRegistry.publishArticle(epochId, contentCID, contentHash, manifestCID, manifestHash, writerStake)`
6. Readers: approve + `Staking.commitVote(epochId, keccak256(abi.encode(epochId, articleId, salt)), rawStake)`
7. After epoch ends: `Staking.revealVote(epochId, articleId, salt)`
8. `Rewards.finalizeEpoch(epochId, writerPoolAmount)`
9. Writers: `Rewards.claimWriter(epochId, articleId)` | Readers: `Rewards.claimReader(epochId)`

---

## Evidence Manifest Format

Stored off-chain (IPFS), anchored on-chain via `manifestCID` + `manifestHash`.

Minimal fields:
```json
{
  "createdAt": "...",
  "items": [
    {
      "type": "image|video|document|link",
      "cid": "ipfs://...",
      "sha256": "0x...",
      "description": "..."
    }
  ]
}
```

---

## License

TBD

## Contributing

Open an issue with a proposal before major contract changes.
