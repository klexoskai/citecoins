# Citecoins — Evidence-Backed Reporting + Market Staking (L2 / Solidity)

Citecoins is a blockchain-based publishing and incentive system that rewards **evidence-backed reporting**. Writers publish articles with attached evidence (videos/images/source documents). Readers stake **Citecoins** on articles they believe are most credible and well substantiated. After a defined staking window, the protocol uses a **pure market signal** (stake-weighted ranking) to determine “top” articles and distribute rewards.

This repository is a **monorepo** containing:
- Solidity smart contracts (L2-targeted)
- an indexer (Subgraph or custom)
- a web app for publishing/reading/staking
- shared TypeScript SDK/types

> v1 explicitly uses **market staking only** for outcomes (no dispute resolution, no oracle-based truth). That keeps scope tight but requires strong anti-spam/anti-sybil considerations.

---

## Why a Monorepo (Recommended for v1)

Monorepo advantages for this project:
- Single source of truth for **ABIs**, event schemas, and contract addresses.
- Easier CI: contract tests + app builds in one pipeline.
- Shared packages (types/SDK) reduce integration bugs.

You can split into multiple repos later (e.g., `citecoins-contracts`, `citecoins-app`) once interfaces are stable.

---

## Core Concepts

### Actors
- **Writers / Publishers**
  - Publish articles and evidence manifests.
  - Earn rewards if their articles end a round in the “top” set.
- **Readers / Stakers**
  - Stake Citecoins on articles they believe are best evidenced.
  - Earn rewards when staking aligns with final top-ranked set.
- **Funders**
  - Create **Fund Buckets** to incentivize reporting on topics/regions.
  - Provide budgets to amplify rewards for eligible articles.

### Objects
- **Article**
  - On-chain record pointing to off-chain content + evidence manifest.
- **Evidence Manifest**
  - A structured JSON document listing evidence items with cryptographic hashes.
- **Fund Bucket**
  - A pool of rewards with eligibility rules (tags, time window, etc.).

---

## High-Level Architecture

### On-chain (Solidity, L2)
**Contracts**
1. `CitecoinToken` (ERC-20)
   - The staking/reward token.

2. `ArticleRegistry`
   - Registers articles and immutable references:
     - `contentCID` (article body stored off-chain)
     - `evidenceManifestCID`
     - `contentHash` / `manifestHash` (optional but recommended even with CID)
     - tags / topic IDs
     - author address
     - optional `fundBucketId`

3. `StakingRounds` (or `StakingMarket`)
   - Defines staking windows (“rounds”)
   - Accepts stakes for (roundId, articleId)
   - Tracks total stake per article per round
   - Enforces:
     - staking start/end timestamps
     - minimum stake
     - optional publish fee / anti-spam fee

4. `RewardsDistributor`
   - At round end:
     - determines winners by stake ranking (e.g., top N or top X% by stake)
     - computes payouts to:
       - writers (creator rewards)
       - winning stakers (pro-rata)
       - fund bucket (optional remainder) or protocol treasury

5. `FundBuckets`
   - Funders create buckets with:
     - metadata (topic, region, description)
     - eligibility rules (tags, created_at bounds, etc.)
     - reward budget
     - reward boost parameters (e.g., multiplier or dedicated payout slice)

**Outcome Rule (v1)**
- “Ground truth” is approximated by **market consensus**:
  - After the staking window closes, the protocol selects “top articles” purely by stake totals (or stake-weighted score).

> Note: this is not factual verification; it’s an incentive/ranking mechanism. The README and UI should be explicit about that to avoid misleading users.

---

### Off-chain
1. **Storage**
   - Article content + evidence stored off-chain (recommended: IPFS + pinning, or Arweave).
   - The chain stores CIDs/hashes so content is tamper-evident.

2. **Indexer**
   - Subgraph (The Graph) or custom indexer that aggregates:
     - articles
     - stakes per round
     - fund buckets + budgets
     - round finalization + payouts
   - Powers queries like:
     - “Top articles this week in topic X”
     - “My staking positions”
     - “Writer earnings over time”

3. **Web App**
   - Publish article + upload evidence manifest
   - Browse/filter articles by topic/region/time
   - Stake on articles
   - View round outcomes and payouts

---

## Suggested Repo Structure (Monorepo)

A pragmatic layout using pnpm workspaces (or yarn/npm workspaces):

- `contracts/`
  - Solidity contracts (Foundry or Hardhat)
  - deployment scripts
  - contract tests
  - generated ABIs/artifacts export step

- `apps/`
  - `web/` (Next.js)
    - reader/writer UI
    - wallet connect + staking flows
    - evidence viewer (CID fetch + hash display)

- `packages/`
  - `sdk/`
    - TypeScript SDK for:
      - contract reads/writes
      - typed events
      - convenience functions (stake, publish, finalize)
  - `types/`
    - shared TypeScript types (Article, EvidenceManifest, FundBucket, Round)
  - `ui/` (optional)
    - shared UI components

- `indexer/`
  - `subgraph/` (if using The Graph)
  - or `worker/` (custom indexer consuming RPC logs)

- `docs/`
  - `architecture.md` (more detailed spec)
  - `tokenomics.md`
  - `threat-model.md`

- `.github/workflows/`
  - CI: lint + test contracts + build web + typecheck

---

## Evidence Manifest (Recommended Format)

Store a JSON manifest off-chain and anchor its CID/hash on-chain.

Minimal fields:
- `articleId` (or temporary client-side ID before publish)
- `createdAt`
- `items[]` where each item has:
  - `type` (image/video/document/link)
  - `cid` or URL
  - `sha256` (or multihash)
  - `description`
  - optional: `timestamp`, `location`, `source`

This keeps on-chain storage small while preserving integrity.

---

## “Market Staking Only” Considerations (Important)

Because v1 has no disputes, you should plan mitigations for:
- **spam publishing** → publish fees, minimum reputation gates (later), or rate limits
- **sybil accounts** → optional identity integrations later; for v1 consider:
  - minimum stake thresholds
  - quadratic-ish weighting caps (optional, but changes economics)
- **whale domination** → consider per-round maximum stake per wallet, or diminishing returns (careful: adds complexity)
- **brigading** → topic-specific rounds, bucket-specific rounds, or stake caps

For v1, keep it simple:
- publish fee (small)
- minimum stake
- clear disclaimers in UI about “market consensus ranking”

---

## Initial Milestones

### Milestone 1 — MVP (Market Ranking)
- ERC-20 token
- article registry w/ CID pointers
- staking rounds + stake tracking
- finalize round → top N winners → distribute rewards
- basic web UI

### Milestone 2 — Fund Buckets
- create/fund bucket
- bucket eligibility and boosted payouts
- funder dashboard

### Milestone 3 — Scaling + UX
- indexer/subgraph
- discovery feeds, filters, writer profiles
- better evidence viewer + integrity display

---

## Tech Choices (Proposed Defaults)

- Contracts: **Foundry** (fast tests) or Hardhat (wider plugins)
- Web: **Next.js + wagmi + viem**
- Indexing: **The Graph** (simplest) or a custom worker
- Storage: **IPFS + pinning service** (and later Arweave for permanence)

---

## License

TBD

## Contributing

Open an issue with a proposal before major contract changes.