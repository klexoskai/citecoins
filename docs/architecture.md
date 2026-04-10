# Architecture (v1) — Buckets, Epochs, Articles, Staking, Rewards

This document describes the on-chain and off-chain architecture of Citecoins v1.

**v1 design choices:**
- Market staking only; no oracle/dispute-based "truth"
- Evidence integrity anchored on-chain via content hashes/CIDs
- Quadratic staking affects **ranking/influence only**
- Reader reward share is **effectiveStake-proportional** (quadratic) among winning stakers
- Commit-reveal voting prevents bandwagoning (votes hidden until epoch ends)
- Writer stake slashed if article loses; bucket creator stake slashed if no eligible articles

---

## 1) On-chain Components

### 1.1 `CitecoinToken` (ERC-20)
Standard ERC-20 used for staking and bucket funding. Minting is restricted to `Rewards.sol` (for future protocol emissions). Initial supply minted to deployer at deploy time.

### 1.2 `BucketManager`
Responsibilities:
- Create topic buckets (topic URI pointer + creator stake)
- Hold and manage bucket reward pools (`fundedRewards`)
- Slash creator stake if epoch ends with no eligible articles (bad topic)
- Release creator stake and deactivate bucket on successful finalization

Key state:
- `bucketId => Bucket`

Bucket fields:
- `creator`
- `topicURI` (IPFS URI to topic statement + guidelines)
- `fundedRewards` (deposited by funders)
- `creatorStake` (locked at creation, returned or slashed at finalization)
- `active`

### 1.3 `EpochManager`
Responsibilities:
- Create time-windowed epochs for a bucket
- Track phase transitions: `NotStarted → Submission → Staking → Ended`
- Mark epochs as finalized (called by Rewards as the last step)

Phase logic (single source of truth, all other contracts call this):
- `NotStarted`: before `submissionStart` or between `submissionEnd` and `stakingStart`
- `Submission`: `submissionStart ≤ t ≤ submissionEnd`
- `Staking`: `stakingStart ≤ t ≤ stakingEnd`
- `Ended`: `t > stakingEnd`

Key state:
- `epochId => EpochConfig` (bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd, finalized)

### 1.4 `ArticleRegistry`
Responsibilities:
- Register article metadata (immutable after submission)
- Enforce submission phase window
- Require writer stake (`MIN_WRITER_STAKE = 10 CITE`) and evidence manifest
- Release or slash writer stake at finalization

Key fields per article:
- `author`, `bucketId`, `epochId`
- `contentCID`, `contentHash` (IPFS CID + keccak256, tamper-evident)
- `manifestCID`, `manifestHash` (evidence manifest CID + keccak256)
- `writerStake` (slashed if article doesn't win)
- `eligible` (set false to exclude from reward distribution)

### 1.5 `Staking` (Commit-Reveal)
Responsibilities:
- Accept blinded vote commitments during Staking phase
- Accept vote reveals only after epoch ends (Phase.Ended)
- Track quadratic-weighted vote totals per article for ranking
- Slash loser stakes at finalization; release winner stakes at claim

**Commit-reveal flow:**
1. **Commit** (during Staking phase): voter locks tokens and submits `commitHash = keccak256(abi.encode(epochId, articleId, salt))`. Vote is hidden.
2. **Reveal** (only after Phase.Ended): voter submits plaintext `(epochId, articleId, salt)`. Contract verifies hash, then computes `effectiveStake = sqrt(rep * rawStake)` and adds to tally.

One commit per voter per epoch; no topping up.

Key state:
- `commits[epochId][voter] => Commit` (commitHash, rawStake, revealed, articleId, effectiveStake)
- `totalEffStake[epochId][articleId]` (quadratic-weighted tally, used for ranking)
- `stakerList[epochId][articleId]` (populated at reveal, iterated by Rewards)

### 1.6 `Rewards`
Responsibilities:
- Finalize epoch deterministically after `stakingEnd`
- Rank articles by effective stake (quadratic), select top `nPaid` as winners
- Slash loser reader stakes; release winner reader stakes at claim
- Settle writer stakes (release winners, slash losers)
- Pull writer pool from bucket; deactivate bucket
- Distribute writer payouts (rank-based exponential decay) via `claimWriter`
- Distribute reader payouts (effectiveStake-proportional share of loser pool) via `claimReader`

---

## 2) Off-chain Components

### 2.1 Storage (IPFS)
- Article content stored off-chain
- Evidence manifest stored off-chain (JSON)
- Contract stores CIDs and keccak256 hashes for tamper evidence

### 2.2 Indexer
Reads events to power feeds, profiles, and stake positions:
- `BucketCreated`, `BucketFunded`
- `EpochCreated`
- `ArticlePublished`
- `VoteCommitted`, `VoteRevealed`
- `EpochFinalized`
- `WriterClaimed`, `ReaderClaimed`

### 2.3 Web App
- Publish article flow (upload content + evidence, generate manifest, submit tx)
- Commit-reveal staking flow (commit during staking window, reveal after epoch ends)
- Claim rewards

---

## 3) Epoch Lifecycle (Per Bucket)

### Parameters
- `submissionStart`, `submissionEnd`
- `stakingStart`, `stakingEnd`
- `finalizeAfter = stakingEnd`

### Lifecycle steps
1. Bucket exists and is active
2. Epoch created with explicit time windows
3. Writers publish articles during Submission phase (with stake + manifest)
4. Readers commit votes during Staking phase (blinded)
5. After epoch ends: readers reveal votes
6. Anyone calls `finalizeEpoch` after epoch ends
7. Winners claim via `claimWriter` / `claimReader` (pull-based)

---

## 4) Ranking (Influence) vs Rewards (Economic Payout)

### 4.1 Influence / ranking metric (quadratic)
For each revealed vote of `x` tokens by voter with reputation `rep`:
- `eff = sqrt(rep * x)`
- `effStake(article) += eff`

Ranking:
- Sort eligible articles by `effStake(article)` descending
- Choose top `nPaid` articles as winners set `W`

### 4.2 Economic payout — writer rewards
Writer rewards are drawn from the bucket's `fundedRewards` pool, specified at `finalizeEpoch` call.

Rank-based exponential decay (see Section 6 below).

### 4.3 Economic payout — reader rewards
- `S_lose = Σ rawStake(losing reader stakes)`
- `slashedWriterStakes = Σ writerStake(losing articles)`
- `readerPoolBase = S_lose + slashedWriterStakes`
- `fee = readerPoolBase * 5%` (protocol fee)
- `readerPool = readerPoolBase - fee`

Winning readers receive back their `rawStake` principal plus a share of `readerPool` proportional to their `effectiveStake` (quadratic).

---

## 5) Winner Count Rule (nPaid)

Let:
- `A = number of eligible published articles in epoch`

Then:
- `nPaid = clamp(floor(A / 2), min=3, max=10)`
- Capped at `A` so nPaid never exceeds the article count

Winners set:
- `W = top nPaid articles by effStake`

---

## 6) Writer Rewards Calculation (Ranked Exponential Decay)

Define weights:
- `w(rank) = 1 / 2^(rank-1)`

Let:
- `W_total = writerRewardPool(epoch)` (pulled from bucket at finalization)
- `W_sum = Σ_{k=1..nPaid} w(k)`

Then:
- `writerPayout(rank=k) = W_total * w(k) / W_sum`

---

## 7) Reader Rewards Calculation

### 7.1 Define pools
- `S_lose = Σ_{a not in W} rawStake(a)` (raw reader stakes on losing articles)
- `slashedWriterStakes = Σ_{a not in W} writerStake(a)` (slashed writer stakes from losing articles)
- `readerPoolBase = S_lose + slashedWriterStakes`
- `fee = 5% * readerPoolBase`
- `readerPool = readerPoolBase - fee`

### 7.2 Payout per reader
For each winning reader `u`:
- `userWeighted = effectiveStake(u)` on winning articles (i.e. `sqrt(rep * rawStake(u))`)
- `totalWeighted = Σ effectiveStake(i)` across all revealed winning voters
- `rewardShare = (userWeighted / totalWeighted) * readerPool`
- `payout(u) = rawStake(u) + rewardShare`

Losing readers forfeit their stake entirely.

---

## 8) Finalization and Gas Considerations

### Ranking on-chain
- Maintain array of `articleIds` per epoch in `ArticleRegistry`
- Top-k selection (k ≤ 10) via insertion sort — O(A * k), acceptable for bounded A
- Tie-break: higher raw stake, then lower articleId

### Claiming strategy
Pull-based:
- `finalizeEpoch` stores winning set, writer pool, reader pool
- Authors call `claimWriter(epochId, articleId)` for their payout
- Voters call `claimReader(epochId)` to receive principal + reward share

### Commit-reveal (anti-bandwagon)
Votes are hidden until after the epoch ends. Revealing before `Phase.Ended` reverts.
Voters who committed but never revealed can reclaim their stake after finalization via `reclaimStake(epochId)`.

---

## 9) Events

```solidity
// BucketManager
event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI);
event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount);
event BucketDeactivated(uint256 indexed bucketId);
event BucketStakeSlashed(uint256 indexed bucketId, address indexed creator, uint256 amount);
event BucketStakeReleased(uint256 indexed bucketId, address indexed creator, uint256 amount);

// EpochManager
event EpochCreated(uint256 indexed epochId, uint256 indexed bucketId,
    uint64 submissionStart, uint64 submissionEnd, uint64 stakingStart, uint64 stakingEnd);

// ArticleRegistry
event ArticlePublished(uint256 indexed articleId, uint256 indexed bucketId,
    uint256 indexed epochId, address author, string contentCID);

// Staking
event VoteCommitted(uint256 indexed epochId, address indexed voter, bytes32 commitHash, uint256 rawStake);
event VoteRevealed(uint256 indexed epochId, uint256 indexed articleId, address indexed voter, uint256 effectiveStake);
event StakeReclaimed(uint256 indexed epochId, address indexed voter, uint256 amount);

// Rewards
event EpochFinalized(uint256 indexed epochId, uint256 indexed bucketId, uint8 nPaid, uint256 readerPool);
event WriterClaimed(uint256 indexed epochId, uint256 indexed articleId, address indexed author, uint256 amount);
event ReaderClaimed(uint256 indexed epochId, address indexed reader, uint256 amount);
```
