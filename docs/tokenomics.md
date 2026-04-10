# Tokenomics (v1 Spec Draft) — Citecoins

This document specifies the initial tokenomics and mechanism design for Citecoins v1.

**Scope assumptions (v1):**
- Solidity smart contracts deployed on an EVM L2
- “Ground truth” is approximated by **market staking only** (no oracle, no disputes)
- Evidence/media stored off-chain; integrity anchored on-chain
- Quadratic staking is used to reduce whale domination in **influence** (ranking) only
- Rewards are based on **raw stake amounts** (actual tokens), not quadratic stake

---

## 1) First Principles

The reward system must:

### Incentivize
- Writers to produce **high-quality, evidence-backed reporting**
- Readers to **accurately identify credibility** (and ideally do so earlier)

### Discourage
- Blind copying / plagiarism
- Herd voting / late bandwagoning
- Whale domination
- Low-effort spam and farming

### Core design pattern
A hybrid of:
- **Prediction-market-style redistribution** for readers (losers subsidize winners)
- **Ranked rewards** for writers (top articles earn most)
- **Time advantage** (reward earlier conviction without minting extra tokens)

---

## 2) Key Entities and Definitions

### Token
- `CITE` = Citecoin (ERC-20)
- Used for: bucket funding, staking, rewards, topic creation stake, fees

### Bucket (Topic Reward Pool)
A **Bucket** is a topic-specific bounty pool that runs epochs (rounds).

**Bucket reward pool sources**
- `fundedRewards`: deposited by funders (NGOs, communities, DAOs, individuals)
- `protocolMatch` (optional): protocol adds a co-pay/match amount
- `fees` (optional): platform fees routed into buckets
- `inflation` (optional): protocol emissions routed into buckets

**Question: does a protocol co-pay (“match”) make sense?**
Yes, if and only if bounded by rules:
- helps cold start and underfunded topics
- must be capped to prevent farming and runaway emissions

Recommended v1 policy:
- `protocolMatch = min(matchRate * fundedRewards, matchCapPerBucket, matchBudgetPerEpochRemaining)`

### Epoch (Round)
Each bucket contains epochs with:
- `submission window` (writers publish)
- `staking window` (readers stake)
- `finalize` (deterministic ranking + payouts)

### Article
An article is a content pointer + evidence pointer:
- `contentCID`
- `evidenceManifestCID`
- optional hashes for both (recommended)

---

## 3) Bucket Creation + Anti-Bad-Topic Safeguard

### Who can create buckets
- Permissionless: anyone can create a bucket by locking `creationStake`
- Funders: can create high-value buckets with large reward pools

### Topic creation stake
- Creator locks `creationStake` when calling `createBucket`
- If the bucket epoch fails participation thresholds, a portion is burned/slashed

**Failure / low participation condition (example)**
- `numArticles < 2` OR `totalStake < MIN_TOTAL_STAKE`
- creator loses e.g. 20–100% of `creationStake` (policy parameter)

Reasoning:
- prevents spam topics
- aligns topic creators with community interest and clarity

---

## 4) Writer Rewards (Rank-Based)

Writer rewards are paid from a bucket’s `writerRewardPool` for a given epoch.

### 4.1 Eligibility gating (anti-spam)
An article is eligible only if:
- it was published within the submission window
- it includes a valid evidence manifest reference
- it meets bucket-specific minimum fields (enforced off-chain in v1; optionally enforced on-chain later)

Optional (future, stronger):
- writer must post `writerSubmissionStake`, partially forfeited if article ranks too low

### 4.2 Winner count (anti-tail farming)
Let:
- `A = number of eligible articles` in epoch

Define number of paid ranks:
- `nPaid = clamp(floor(A/2), min=3, max=10)`, capped at `A`

Only ranks `1..nPaid` receive writer rewards.
This prevents bots from farming tiny “tail” payouts.

### 4.3 Reward curve: exponential decay by rank
Define:
- `weight(rank) = 1 / 2^(rank-1)` for rank starting at 1

Total writer rewards:
- `W_total = writerRewardPool(epoch)`

Normalized payouts:
- `writerReward(rank) = W_total * weight(rank) / sum_{k=1..nPaid}(weight(k))`

Illustrative (if nPaid≥3, approx):
- 1st ~ 50%
- 2nd ~ 25%
- 3rd ~ 12.5%
- … with a small tail up to rank 10

---

## 5) Reader Rewards (Prediction-Market Redistribution)

Readers stake CITE on articles they believe will be top-ranked.

### 5.1 Critical rule: Quadratic influence ONLY, not rewards
We define two stake measures:

1) **Raw stake** (real tokens at risk):
- `rawStake(u, article) = tokens u staked on article`

2) **Effective stake** (influence/ranking and reward share):
- `effStake(u, article) = sqrt(rep(u) * rawStake(u, article))`
- `rep(u) = 1 + reputationBonus(u)` (floor 1 for new voters)

Aggregate per-article:
- `rawStake(article) = sum_u rawStake(u, article)`
- `effStake(article) = sum_u sqrt(rep(u) * rawStake(u, article))`

**Ranking uses `effStake(article)`**
**Reader reward share uses `effStake(u)` proportionally among winning voters**

This reduces whale domination in outcome selection; reputation gives consistent winners greater long-term influence.

### 5.2 Define winning set W
At finalize time:
- compute `effStake(article)` for each eligible article
- rank descending
- winning set `W` = top `nPaid` articles

### 5.3 Redistribution math
Let:
- `S_lose = sum_{a not in W} rawStake(a)` (losing reader stakes)
- `slashedWriterStakes = sum_{a not in W} writerStake(a)` (losing writer stakes)
- `readerPoolBase = S_lose + slashedWriterStakes`
- `fee = 5% * readerPoolBase` (protocol fee, `FEE_BPS = 500`)
- `readerPool = readerPoolBase - fee`

Winning readers receive back their `rawStake` principal plus a share of `readerPool`:
- `rewardShare(u) = (effectiveStake(u) / totalEffStake(winners)) * readerPool`
  where `effectiveStake(u) = sqrt(rep(u) * rawStake(u))`

Total received at claim:
- `payout(u) = rawStake(u) + rewardShare(u)`

Losing stakers forfeit their stake entirely.

### 5.4 Anti-bandwagoning — commit-reveal
Rather than time-weighted redistribution, v1 uses **commit-reveal voting** to prevent herding:

- During the Staking phase, voters submit a blinded commitment: `keccak256(abi.encode(epochId, articleId, salt))`
- Votes are only revealed after the epoch ends (Phase.Ended), making it impossible to watch others’ votes and pile in at the last moment
- One commitment per voter per epoch; no changing votes after committing

### 5.5 Constraints
- Minimum writer stake (`10 CITE`) reduces spam publishing
- Minimum bucket creation stake (`100 CITE`) deters low-quality topics
- Cap number of articles per epoch to keep finalize gas bounded

---

## 6) Platform / Treasury Fees and Sustainability

Costs:
- contracts (users pay gas)
- indexing, storage/pinning, ops, audits

v1-fee options:
- **Fee on losing stake redistribution** (recommended)
- **Fee on bucket creation** (topic creation tax)
- **Fee on reward pool deposit** (funder deposit fee)

Recommended v1:
- `feeBps` applied to `S_lose` at finalize, routed to treasury
- small bucket creation fee or partial burn of `creationStake`

---

## 7) Anti-Farming / Anti-Spam Safeguards (v1)

- Minimum evidence manifest requirement for writer eligibility
- Topic creation stake with participation thresholds
- Publish fee (small) OR per-epoch publish cap per address
- Quadratic influence for ranking only
- Reputation multiplier rewards consistent accurate voters over time

Future (v2+):
- writer submission stake slashing
- identity/reputation gating
- disputes/slashing/oracle mechanism if “truth resolution” becomes necessary

---

## 8) Emissions, Supply, and Long-Term Equilibrium

### Supply structure
- fixed genesis supply (e.g. 1M–10M)
- plus low, declining inflation routed to bucket matches/subsidies (optional)

Example emission schedule:
- `Inflation(t) = BaseRate * e^(-k t)`

### Reward sources
- Funded rewards: from funders to bucket pools (real demand)
- Protocol match/subsidy: inflation budget (bootstrap)
- Penalty redistribution: losing stakes

### Burns
- topic creation burn (percentage of creation stake)
- optional publish fee burn
- future: slashing/burn for proven manipulation (requires dispute or verifiers)

Goal:
- net inflation = emissions − burns trends toward 0 over time