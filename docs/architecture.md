# Architecture (v1 Spec Draft) — Buckets, Epochs, Articles, Staking, Rewards

This document translates the intended mechanism into an implementable architecture for Solidity on an L2.

**v1 design choices:**
- Market staking only; no oracle/dispute-based “truth”
- Evidence integrity anchored on-chain via content hashes/CIDs
- Quadratic staking affects **ranking/influence only**
- Rewards are based on **raw stake**
- Time advantage implemented as redistribution reweighting (no extra emissions needed)

---

## 1) On-chain Components (Proposed Contracts)

You can implement as separate contracts or modules within one contract suite.

### 1.1 `CitecoinToken` (ERC-20)
- Standard ERC-20 used for staking and bucket funding.

### 1.2 `BucketManager`
Responsibilities:
- Create buckets (topic statement + guidelines pointers)
- Hold bucket funds (reward pools)
- Manage epoch schedule/config

Key state (conceptual):
- `bucketId => Bucket`
- `bucketId => mapping(epochId => EpochConfig/EpochState)`

Bucket fields (minimal):
- `creator`
- `creationStakeAmount`
- `topicURI` (off-chain pointer to topic statement + guidelines)
- `epochDuration`
- participation thresholds

### 1.3 `ArticleRegistry`
Responsibilities:
- Register article metadata (immutable pointers)
- Associate with (bucketId, epochId)
- Enforce publish window + per-epoch article cap (optional)

Key fields:
- `articleId`
- `bucketId`, `epochId`
- `author`
- `contentCID`, `manifestCID`
- `contentHash`, `manifestHash` (recommended even with CID)
- timestamp

### 1.4 `Staking`
Responsibilities:
- Accept stakes for (epochId, articleId)
- Track raw totals per article
- Track *effective stake* for ranking:
  - `effStake(article) = Σ sqrt(rawStake_i)`
- Store per-user stake records (needed for time-weighted redistribution)

Important: time-weighted redistribution needs stake timestamps (or at least “early/late buckets”).

Implementation options:
- Store each user’s stake as a list of tranches: `(amount, timestamp)`
- Or compress timestamps into coarse bins (e.g., 8 bins) to reduce storage

### 1.5 `Rewards`
Responsibilities:
- Finalize epoch deterministically
- Compute ranking by effective stake
- Determine winners set W (top `nPaid`)
- Distribute writer rewards (rank-based exponential decay)
- Redistribute losing raw stake to winning stakers (time-weighted share)
- Apply protocol fee (optional)

---

## 2) Off-chain Components

### 2.1 Storage (IPFS/Arweave)
- Article content stored off-chain
- Evidence manifest stored off-chain (JSON)
- Contract stores pointers and hashes

### 2.2 Indexer
- The Graph Subgraph or custom indexer
- Reads events:
  - BucketCreated, BucketFunded
  - ArticlePublished
  - StakePlaced
  - EpochFinalized
  - RewardsClaimed
- Provides:
  - feeds (top by bucket/epoch)
  - profiles and earnings
  - stake positions and expected payouts

### 2.3 Web App
- Publish article flow:
  - upload content + evidence
  - generate manifest JSON
  - submit publish tx
- Stake flow:
  - select article
  - stake amount
  - shows time advantage effect
- Claim rewards

---

## 3) Epoch Lifecycle (Per Bucket)

### Parameters
- `submissionStart`, `submissionEnd`
- `stakingStart`, `stakingEnd`
- `finalizeAfter = stakingEnd`

You can simplify by making:
- submission allowed until stakingEnd, but ranking only counts stakes
- or separate strict windows for clarity

### Lifecycle steps
1) Bucket exists and epoch is active
2) Writers publish articles to that epoch
3) Readers stake during staking window
4) Anyone calls finalize after stakingEnd
5) Rewards become claimable (pull-based) or paid automatically (push-based)

Recommendation: pull-based claiming to avoid gas spikes.

---

## 4) Ranking (Influence) vs Rewards (Economic Payout)

This must be explicitly enforced in contract logic.

### 4.1 Influence / ranking metric (quadratic)
For each stake of `x` tokens:
- `eff = sqrt(x)`
- `effStake(article) += eff`

Ranking:
- sort eligible articles by `effStake(article)` descending
- choose top `nPaid` articles as winners set `W`

### 4.2 Economic payout metric (raw)
Raw totals:
- `rawStake(article) = Σ x`

Redistribution uses raw stake amounts (tokens).
No sqrt used in rewards distribution.

---

## 5) Winner Count Rule (nPaid)

Let:
- `A = number of eligible published articles in epoch`

Then:
- `nPaid = clamp(A, 3, 10)`

Winners set:
- `W = top nPaid articles by effStake`

Writer ranks:
- rank 1..nPaid based on same ordering.

---

## 6) Writer Rewards Calculation (Ranked Exponential Decay)

Define weights:
- `w(rank) = 1 / 2^(rank-1)`

Let:
- `W_total = writerRewardPool(epoch)`
- `W_sum = Σ_{k=1..nPaid} w(k)`

Then:
- `writerPayout(articleRank=k) = W_total * w(k) / W_sum`

---

## 7) Reader Rewards Calculation (Redistribution + Time Weighting)

### 7.1 Define pools
- `S_win = Σ_{a in W} rawStake(a)`
- `S_lose = Σ_{a not in W} rawStake(a)`

Optional fee:
- `fee = feeBps * S_lose`
- `S_lose_net = S_lose - fee`

### 7.2 Time-weighted redistribution WITHOUT extra emissions
For each stake tranche `i` by user `u`:
- amount `x_i`
- timestamp `t_i`
- if the tranche is on winning article, include it in weighted sum

Define time weight function:
- `timeWeight(t)` monotone decreasing from 2.0 → 1.0 across the staking window

Compute:
- `weightedStake_i = x_i * timeWeight(t_i)`
- `WS_win = Σ weightedStake_i across all winning tranches`

Then each user’s reward is:
- `reward(u) = (weightedStakeOnWinners(u) / WS_win) * S_lose_net`

The user also gets back their raw winning stake principal (design choice):
- `payout(u) = rawStakeOnWinners(u) + reward(u)`

Losing stakes are forfeited (or partially returned if you choose a softer penalty model).

---

## 8) Finalization and Gas Considerations

### Challenge: sorting top articles on-chain
Sorting a large list is expensive.

Practical v1 constraints:
- cap number of articles per epoch (e.g., <= 100)
- maintain an on-chain array of articleIds per epoch
- finalize by scanning all articles:
  - compute top-nPaid via selection (not full sort) to reduce gas

### Claiming strategy
- Use pull-based claims:
  - finalize stores:
    - winning set
    - writer payouts per winning article
    - reader redistribution totals and parameters
  - users call `claim(epochId)` to compute and withdraw their share

---

## 9) Required Events (Indexer-first)

Emit events for:
- `BucketCreated(bucketId, creator, topicURI, creationStake, epochDuration, ...)`
- `BucketFunded(bucketId, funder, amount)`
- `EpochStarted(bucketId, epochId, start, end)`
- `ArticlePublished(articleId, bucketId, epochId, author, contentCID, manifestCID, hashes...)`
- `Staked(epochId, articleId, staker, amount, timestamp)`
- `EpochFinalized(bucketId, epochId, winners[], nPaid, S_win, S_lose, fee, ...)`
- `Claimed(epochId, user, amount)`