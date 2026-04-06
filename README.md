# Citecoins — Evidence-Backed Reporting + Market Staking (L2 / Solidity)

Citecoins is a blockchain-based publishing and incentive system that rewards **evidence-backed reporting**. Writers publish articles with attached evidence manifests (videos, images, source documents anchored on-chain). Readers stake **CITE tokens** on articles they believe are most credible. After a defined staking window, the protocol uses a **commit-reveal market signal** (quadratic-stake-weighted ranking) to determine top articles and distribute rewards.

> v1 uses **market staking only** for outcomes — no dispute resolution, no oracle-based truth. Rankings reflect market consensus, not factual verification.

---

## Repository Structure

```
contracts/
  CitecoinToken.sol       — ERC-20 CITE token
  BucketManager.sol       — topic buckets and reward pools
  EpochManager.sol        — time windows and phase gating
  ArticleRegistry.sol     — article submission and writer stakes
  Staking.sol             — commit-reveal voting and reader stakes
  Rewards.sol             — finalization and reward distribution
  CitecoinsProtocol.sol   — deploys and wires all contracts

  interfaces/             — IBucketManager, IEpochManager, IArticleRegistry,
                            IStaking, ICitecoinToken
  libraries/
    MathUtils.sol         — isqrt (Babylonian), winnersCount

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
  CiteCoinsFlow.js        — end-to-end happy path

scripts/
  deploy.js               — deploy CitecoinsProtocol and print addresses
  demoFlow.js             — scripted demo of the full flow

generate/
  generate.mjs            — helper to compute commit hashes for manual testing
```

---

## Core Concepts

### Actors
- **Writers**: Publish articles + evidence manifests. Stake CITE to enter. Earn ranked rewards if their article wins.
- **Readers / Voters**: Commit blinded votes (with staked CITE) on articles they believe will rank highest. Earn a share of losing stakes if they back a winner.
- **Funders**: Create topic buckets and deposit reward pools for writers.

### Objects
- **Bucket**: A topic-specific reward pool. Creator stakes CITE to create; slashed if no articles pass.
- **Epoch**: A time window for a bucket — Submission phase → Staking phase → Ended → Finalized.
- **Article**: On-chain record pointing to off-chain content (`contentCID`) and evidence manifest (`manifestCID`). Hashes stored on-chain for tamper evidence.
- **Commit**: A blinded vote. Revealed only after epoch ends.

---

## On-Chain Architecture

### Contracts

1. **`CitecoinToken`** — Standard ERC-20. Minting restricted to `Rewards` (minter role).

2. **`BucketManager`** — Funders create topic buckets by staking `≥ 100 CITE`. Anyone can fund a bucket's reward pool. Creator stake is slashed if the epoch ends with no eligible articles; released on successful finalization.

3. **`EpochManager`** — Creates time-windowed epochs for a bucket. Single source of truth for phase gating. Phases: `NotStarted → Submission → Staking → Ended`.

4. **`ArticleRegistry`** — Writers publish during Submission phase. Requires `≥ 10 CITE` writer stake and a non-empty evidence manifest. Writer stake is released to winners and slashed from losers at finalization.

5. **`Staking`** — Commit-reveal voting system:
   - **Commit** (Staking phase): lock CITE, submit `keccak256(abi.encode(epochId, articleId, salt))`
   - **Reveal** (after Phase.Ended only): submit plaintext vote; `effectiveStake = sqrt(rawStake)` applied for quadratic ranking
   - Winning voter stakes returned at claim; losing voter stakes slashed at finalization

6. **`Rewards`** — Permissionless `finalizeEpoch(epochId, writerPoolAmount)` callable after epoch ends. Ranks articles by quadratic effective stake, selects top `nPaid = clamp(floor(A/2), 3, 10)` winners. Pull-based claims:
   - `claimWriter(epochId, articleId)` — rank-based exponential decay payout from bucket pool
   - `claimReader(epochId)` — principal + effectiveStake-proportional share of losing stakes

7. **`CitecoinsProtocol`** — Factory that deploys all contracts and wires permissions in one transaction.

### Quadratic ranking
- Influence = `sqrt(rawStake)` per voter, summed per article
- Ranking uses effective (quadratic) stake; a whale with 10,000 CITE gets sqrt(10,000) = 100 weight

### Anti-bandwagon
- Commit-reveal: votes invisible until epoch ends — no last-minute pile-in

---

## Quick Start

```bash
npm install
npx hardhat test
npx hardhat run scripts/deploy.js --network <network>
```

---

## Demo Flow

1. Deploy `CitecoinsProtocol(initialSupply)`
2. Approve + `BucketManager.createBucket(topicURI, 100e18)`
3. `BucketManager.fundBucket(bucketId, amount)`
4. `EpochManager.createEpoch(bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd)`
5. Writers: approve + `ArticleRegistry.publishArticle(epochId, contentCID, contentHash, manifestCID, manifestHash, writerStake)`
6. Readers: approve + `Staking.commitVote(epochId, keccak256(abi.encode(epochId, articleId, salt)), rawStake)`
7. After epoch ends: `Staking.revealVote(epochId, articleId, salt)`
8. `Rewards.finalizeEpoch(epochId, writerPoolAmount)`
9. Authors: `Rewards.claimWriter(epochId, articleId)` | Readers: `Rewards.claimReader(epochId)`

Use `generate/generate.mjs` to pre-compute commit hashes for manual Remix testing.

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
