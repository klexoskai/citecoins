# Contract Spec (v1) — Solidity / Hardhat (Remix-friendly)

This document is a **code-generation-oriented** specification for Citecoins v1 contracts.

**v1 commitments**
- EVM L2 deployment
- Market staking only; no disputes/oracles
- Evidence off-chain; integrity anchored on-chain (CID + optional hash)
- Quadratic staking affects **ranking/influence only**
- Rewards based on **raw stake**, with time advantage implemented as **redistribution weighting** (no extra emissions required)
- Winner count: `nPaid = clamp(A, 3, 10)` per epoch, where `A` is eligible article count

---

## 0) Implementation Notes (Hardhat + Remix-friendly)

- Prefer Solidity `^0.8.20` (no SafeMath needed).
- Keep dependencies minimal:
  - `openzeppelin-contracts` for ERC20 + Ownable (optional) + ReentrancyGuard.
- Keep contracts small and modular; Remix demo can deploy and call functions easily.
- Use “pull-based claims” for reader/writer payouts to avoid finalize gas spikes.

---

## 1) High-Level Modules

Recommended contract set:

1. `CitecoinToken.sol` (ERC20)
2. `CitecoinsProtocol.sol` (single “orchestrator” for v1 demo)
   - For demo simplicity, you can implement everything in one contract.
   - For production, split into Bucket/Article/Staking/Rewards modules.

This spec describes the protocol as if it’s a single contract, but sections can be moved into modules later.

---

## 2) Core Types (Structs / Enums)

### 2.1 Bucket

```solidity
struct Bucket {
    address creator;
    string topicURI;           // off-chain JSON: topicStatement, guidelines, rubric
    uint64 epochDuration;      // seconds
    uint256 creationStake;     // amount locked by creator

    // funds
    uint256 fundedRewards;     // deposited by funders
    uint256 protocolMatched;   // optional protocol match added
    uint256 feesAccrued;       // optional

    // rules
    uint16 feeBps;             // fee on losing stake redistribution (0..10000)
    uint32 minArticles;        // participation threshold (e.g., 2)
    uint256 minTotalStake;     // participation threshold

    bool active;
}
```

**topicURI format (off-chain):**
- statement, evidence guidelines, time scope, region, rubric, etc.
- Store immutable version (e.g., IPFS CID). Any edits should create a new bucket.

### 2.2 Epoch

We want epochs per bucket, indexed `epochIndex`, derived schedule:
- `epochStart = bucketStart + epochIndex * epochDuration`
- or explicitly started on-chain.

For demo simplicity: explicitly create epochs.

```solidity
struct Epoch {
    uint256 bucketId;
    uint64 submissionStart;
    uint64 submissionEnd;
    uint64 stakingStart;
    uint64 stakingEnd;

    // article set
    uint256[] articleIds;            // article ids in this epoch
    mapping(uint256 => bool) inEpoch; // articleId => true (optional helper)

    // stake totals per article
    mapping(uint256 => uint256) rawStakeByArticle; // articleId => tokens
    mapping(uint256 => uint256) effStakeByArticle; // articleId => SUM sqrt(tokens)

    // overall totals
    uint256 totalRawStake; // sum raw stakes all articles in epoch

    // finalization results
    bool finalized;
    uint8 nPaid;                // winners count (clamp(A,3,10))
    uint256[] winningArticleIds; // length nPaid
    uint256 S_win;              // sum raw stake on winners
    uint256 S_lose;             // sum raw stake on losers
    uint256 feeTaken;           // fee on losing stake redistribution
}
```

**Note:** Solidity does not allow mappings inside arrays/structs easily for external visibility. In practice you’ll store `Epoch` in a mapping and keep the arrays and mappings as separate mappings keyed by `(epochId, ...)`. For codegen, treat this as conceptual.

### 2.3 Article

```solidity
struct Article {
    address author;
    uint256 bucketId;
    uint256 epochId;

    string contentCID;
    string manifestCID;
    bytes32 contentHash;   // optional (0 if not provided)
    bytes32 manifestHash;  // optional

    uint64 publishedAt;
    bool eligible;         // v1: true if manifestCID non-empty, etc.
}
```

### 2.4 Stake tranches (for time weighting)

Time weighting requires stake timestamps.

```solidity
struct StakeTranche {
    uint256 amount;     // raw amount staked in this tranche
    uint64 timestamp;   // when staked
}
```

Per-user per-article per-epoch stake storage:

```solidity
mapping(uint256 epochId => mapping(uint256 articleId => mapping(address staker => StakeTranche[]))) public stakes;
mapping(uint256 epochId => mapping(uint256 articleId => mapping(address staker => uint256))) public rawStakeOf; // sum of tranches
```

This is storage-heavy; for a demo it’s fine. For production, compress into bins.

---

## 3) Key Parameters / Policy

### 3.1 Winner count
Let `A = eligible article count`:
- `nPaid = clamp(A, 3, 10)`

Where:

```solidity
function clampWinners(uint256 A) internal pure returns (uint8) {
    if (A <= 3) return 3;
    if (A >= 10) return 10;
    return uint8(A);
}
```

**Interpretation:** even if A=1 or 2, `nPaid=3` would exceed articles.
So define:

- `nPaid = min(clamp(A,3,10), A)` to avoid impossible winners.

This should be the actual rule.

### 3.2 Quadratic influence (ranking only)
On stake of amount `x`:
- `eff = isqrt(x)`
- `effStakeByArticle += eff`
- Ranking uses `effStakeByArticle`, not raw.

### 3.3 Rewards are raw-stake based
- Redistribution pool uses raw token totals:
  - `S_win = Σ rawStake(winners)`
  - `S_lose = totalRawStake - S_win`

### 3.4 Time advantage without minting
Time advantage changes *distribution weights* among winners, not total payout.

- Winning stakers share `S_lose_net` proportional to:

`weightedStake = amount * timeWeight(timestamp)`

Where `timeWeight` decreases linearly (or piecewise) from `maxWeight` to `minWeight` across the staking window.

Example policy:
- `maxWeight = 2.0` (represented as 20000 in fixed-point)
- `minWeight = 1.0` (10000)
- `weightBps(t) = minWeight + (maxWeight-minWeight) * (stakingEnd - t) / (stakingEnd - stakingStart)`

---

## 4) Public Functions (Protocol API)

### 4.1 Bucket management

```solidity
function createBucket(
    string calldata topicURI,
    uint64 epochDuration,
    uint256 creationStake,
    uint16 feeBps,
    uint32 minArticles,
    uint256 minTotalStake
) external returns (uint256 bucketId);
```

Behavior:
- transfer `creationStake` from creator to protocol (locked)
- initialize bucket config

```solidity
function fundBucket(uint256 bucketId, uint256 amount) external;
```

Behavior:
- transfer CITE from funder to protocol
- increase `bucket.fundedRewards`

Optional (protocol match):
```solidity
function addProtocolMatch(uint256 bucketId, uint256 amount) external onlyOwner;
```

For demo, owner = deployer.

### 4.2 Epoch management

For demo simplicity:

```solidity
function createEpoch(
    uint256 bucketId,
    uint64 submissionStart,
    uint64 submissionEnd,
    uint64 stakingStart,
    uint64 stakingEnd
) external returns (uint256 epochId);
```

Constraints:
- windows make sense:
  - submissionStart <= submissionEnd <= stakingEnd
  - stakingStart <= stakingEnd
- optionally require `msg.sender` is bucket creator or owner, or permissionless.

### 4.3 Publishing

```solidity
function publishArticle(
    uint256 bucketId,
    uint256 epochId,
    string calldata contentCID,
    string calldata manifestCID,
    bytes32 contentHash,
    bytes32 manifestHash
) external returns (uint256 articleId);
```

Constraints:
- must be within submission window
- `manifestCID` must be non-empty for eligibility
- store article and push to `epoch.articleIds`

### 4.4 Staking

```solidity
function stake(
    uint256 epochId,
    uint256 articleId,
    uint256 amount
) external;
```

Constraints:
- within staking window
- article belongs to epoch and is eligible
- transfer CITE from staker to protocol escrow
- record tranche (amount, block.timestamp)
- update:
  - `epoch.rawStakeByArticle[articleId] += amount`
  - `epoch.effStakeByArticle[articleId] += isqrt(amount)`
  - `epoch.totalRawStake += amount`

### 4.5 Finalize epoch

```solidity
function finalizeEpoch(uint256 epochId) external;
```

Constraints:
- `block.timestamp >= stakingEnd`
- not already finalized

Finalize algorithm (deterministic):

1) Determine eligible article count `A`
2) Compute `nPaid = min(clamp(A,3,10), A)`
3) Find top `nPaid` articles by `effStakeByArticle` (selection algorithm; no full sort)
4) Set `winningArticleIds`
5) Compute `S_win` as sum raw stakes on winners
6) `S_lose = totalRawStake - S_win`
7) Apply fee: `feeTaken = S_lose * feeBps / 10000`
8) Persist epoch finalization fields

**Writer rewards pool**
Decide writer reward source for v1:
- simplest: bucket has a fixed `writerRewardBudgetPerEpoch` pre-funded
- or use a portion of fundedRewards per epoch

Recommended v1:
- At epoch creation, set `epochWriterPool` funded by bucket funds (or fund on finalize).

### 4.6 Claiming rewards

Pull-based:

```solidity
function claimWriter(uint256 epochId, uint256 articleId) external;
```

Constraints:
- epoch finalized
- article is in winning set
- msg.sender is article.author
- not yet claimed

Writer payout formula:
- compute rank of `articleId` within winners (based on effStake order used in finalize)
- `writerPayout = W_total * w(rank)/sumW`
- transfer CITE to author

```solidity
function claimReader(uint256 epochId) external;
```

Constraints:
- epoch finalized
- not yet claimed

Reader payout formula:
- compute:
  - `S_lose_net = S_lose - feeTaken`
  - `WS_win` total winning weighted stake (needs to be computed)
- user’s reward share:
  - sum across user’s winning tranches:
    - `userWeighted += amount * weightBps(timestamp)`
  - `reward = userWeighted * S_lose_net / WS_win`
- return principal:
  - userRawWinning = sum user raw stake on winners
  - total payout = `userRawWinning + reward`
- transfer CITE

**Important performance note:** computing `WS_win` on demand is expensive.
Better finalize-time accounting:
- during finalize, compute and store `WS_win`
- store `winningArticleIds`
- then `claimReader` only computes `userWeighted` by iterating user tranches on winning articles

So add to epoch:
- `uint256 WS_win;`

### 4.7 Withdraw losing stake?
In the described mechanism, losing stake is forfeited to fund winners and treasury.
So **no** losing stake withdrawals.

Option (future):
- partial refund of losing stake to reduce harshness.

---

## 5) Math / Helper Functions

### 5.1 Integer sqrt (isqrt)
Need a deterministic integer sqrt for `uint256`.

```solidity
function isqrt(uint256 x) internal pure returns (uint256);
```

Use Babylonian method.

### 5.2 Time weight function (fixed-point)
Use basis points (BPS) or 1e4 scaling.

```solidity
function weightBps(uint64 t, uint64 stakingStart, uint64 stakingEnd)
    internal pure returns (uint256);
```

Example (linear decay):
- if t <= stakingStart => maxWeightBps
- if t >= stakingEnd => minWeightBps
- else interpolate

---

## 6) Ranking Selection Algorithm (Top-K without Full Sort)

Given list `articleIds` length `A` and target `k=nPaid`:

- Maintain arrays `topIds[k]` and `topScores[k]`
- For each article:
  - score = effStakeByArticle[articleId]
  - insert into top arrays if score is high enough (O(A*k))
- Since `k <= 10`, this is acceptable.

Tie-breaker:
- If scores equal, use higher `rawStakeByArticle` or lower `articleId` for determinism.

---

## 7) Events (Required for Indexing)

```solidity
event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI, uint256 creationStake);
event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount);
event EpochCreated(uint256 indexed epochId, uint256 indexed bucketId, uint64 submissionStart, uint64 submissionEnd, uint64 stakingStart, uint64 stakingEnd);
event ArticlePublished(uint256 indexed articleId, uint256 indexed bucketId, uint256 indexed epochId, address author, string contentCID, string manifestCID);
event Staked(uint256 indexed epochId, uint256 indexed articleId, address indexed staker, uint256 amount, uint64 timestamp);
event EpochFinalized(uint256 indexed epochId, uint256 indexed bucketId, uint8 nPaid, uint256 S_win, uint256 S_lose, uint256 feeTaken, uint256 WS_win);
event WriterClaimed(uint256 indexed epochId, uint256 indexed articleId, address indexed author, uint256 amount);
event ReaderClaimed(uint256 indexed epochId, address indexed reader, uint256 amount);
```

---

## 8) Invariants / Properties to Test (Hardhat)

Unit tests should verify:

### Epoch invariants
- Can’t stake outside staking window
- Can’t publish outside submission window
- Finalize only after stakingEnd and only once

### Influence vs rewards
- Quadratic stake affects winner selection:
  - many small stakers can outperform one whale in effStake
- Rewards remain raw-stake proportional among winners:
  - within winning set, raw stake drives principal return and base share
- Losing stake is not returned

### Conservation of redistribution
- Total redistributed to winning readers equals `S_lose_net`
- Protocol fee equals `feeTaken`
- Contract token balance decreases by sum of payouts and fees as expected

### Time weighting
- Early winning stake gets larger share of `S_lose_net` than late stake of same amount
- Total distributed remains `S_lose_net` (no inflation from multiplier)

---

## 9) Explicit Non-Goals (v1)

- Dispute resolution, slashing for misinformation
- Identity / sybil resistance (beyond minimal stake/fees)
- ZK proofs, confidential evidence, private voting
- Off-chain moderation enforcement at protocol layer

These can be v2+.

---

## 10) Suggested Minimal Remix Demo Flow

1) Deploy `CitecoinToken` (mint to demo accounts)
2) Deploy `CitecoinsProtocol` with token address
3) Create a bucket with topicURI
4) Create an epoch with short windows
5) Publish 3+ articles
6) Stake from multiple accounts (simulate quadratic influence)
7) Finalize epoch
8) Claim writer rewards (top nPaid)
9) Claim reader rewards (winning stakers)