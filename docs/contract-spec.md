# Contract Spec (v1) — Solidity / Hardhat

This document is the code-oriented specification for Citecoins v1 contracts.

**v1 commitments**
- EVM L2 deployment
- Market staking only; no disputes/oracles
- Evidence off-chain; integrity anchored on-chain (CID + keccak256 hash)
- Quadratic staking affects **ranking/influence only**
- Reader reward *share* is **effectiveStake-proportional** (quadratic) among winning voters
- Winner count: `nPaid = clamp(floor(A/2), 3, 10)` where `A` is eligible article count
- Commit-reveal voting: votes hidden until epoch ends, preventing bandwagoning

---

## 0) Implementation Notes

- Solidity `^0.8.20` (no SafeMath needed).
- `openzeppelin-contracts` for ERC20 only.
- Contracts are modular; `CitecoinsProtocol` deploys and wires all components.
- Pull-based claims for reader/writer payouts to avoid finalize gas spikes.

---

## 1) Contract Set

1. `CitecoinToken.sol` — ERC-20 (CITE token)
2. `BucketManager.sol` — topic buckets and reward pools
3. `EpochManager.sol` — time windows and phase gating
4. `ArticleRegistry.sol` — article submission and writer stakes
5. `Staking.sol` — commit-reveal voting and reader stakes
6. `Rewards.sol` — finalization and reward distribution
7. `CitecoinsProtocol.sol` — deploys and wires all contracts

---

## 2) Core Types (Structs / Enums)

### 2.1 Bucket

```solidity
struct Bucket {
    address creator;
    string  topicURI;       // IPFS URI: topic statement, guidelines, rubric
    uint256 fundedRewards;  // deposited by funders (NGOs, DAOs, individuals)
    uint256 creatorStake;   // locked at creation; returned or slashed at finalization
    bool    active;
}
```

Constants:
- `MIN_BUCKET_STAKE = 100e18` (100 CITE to create a bucket)
- `FEE_BPS = 500` (5% fee on losing reader stakes)

### 2.2 Epoch

```solidity
struct EpochConfig {
    uint256 bucketId;
    uint64  submissionStart;
    uint64  submissionEnd;
    uint64  stakingStart;
    uint64  stakingEnd;
    bool    finalized;
}
```

Phase enum:
```solidity
enum Phase { NotStarted, Submission, Staking, Ended }
```

### 2.3 Article

```solidity
struct Article {
    address author;
    uint256 bucketId;
    uint256 epochId;
    string  contentCID;   // IPFS CID of article body
    bytes32 contentHash;  // keccak256 of content (tamper evidence)
    string  manifestCID;  // IPFS CID of evidence manifest
    bytes32 manifestHash; // keccak256 of manifest (tamper evidence)
    uint256 writerStake;  // tokens locked; slashed if article doesn't win
    bool    eligible;     // false = excluded from reward distribution
}
```

Constants:
- `MIN_WRITER_STAKE = 10e18` (10 CITE minimum writer stake)

### 2.4 Commit (Staking)

```solidity
struct Commit {
    bytes32 commitHash;     // keccak256(abi.encode(epochId, articleId, salt))
    uint256 rawStake;       // tokens locked at commit time
    bool    revealed;
    uint256 articleId;      // set at reveal time
    uint256 effectiveStake; // sqrt(rawStake), computed at reveal
}
```

---

## 3) Key Parameters / Policy

### 3.1 Winner count
Let `A = eligible article count`:

```solidity
function winnersCount(uint256 A) internal pure returns (uint8) {
    if (A == 0) return 0;
    uint256 n = A / 2;     // floor(A/2)
    if (n < 3) n = 3;
    if (n > 10) n = 10;
    if (n > A) n = A;      // cap at A so nPaid never exceeds article count
    return uint8(n);
}
```

### 3.2 Quadratic influence (ranking only)
On reveal of `rawStake` tokens:
- `eff = isqrt(rawStake)`
- `totalEffStake[epochId][articleId] += eff`
- Ranking uses `totalEffStake`, not raw.

### 3.3 Reader reward distribution
Among winning voters, `readerPool` is split proportionally to `effectiveStake`:
- `rewardShare(u) = (effectiveStake(u) / Σ effectiveStake(winners)) * readerPool`
- Each winning voter also gets back their `rawStake` principal.

### 3.4 Protocol fee
- `fee = S_lose * FEE_BPS / 10000` (5% of losing raw stakes)
- `readerPool = S_lose - fee`

---

## 4) Public Functions

### 4.1 Bucket management

```solidity
// BucketManager
function createBucket(
    string calldata topicURI,
    uint256 stakeAmount   // must be >= MIN_BUCKET_STAKE (100 CITE)
) external returns (uint256 bucketId);
```

Behavior:
- Transfer `stakeAmount` from creator to contract (locked)
- Initialize bucket; `active = true`

```solidity
function fundBucket(uint256 bucketId, uint256 amount) external;
```

Behavior:
- Transfer CITE from funder to contract
- Increase `bucket.fundedRewards`
- Callable by anyone; bucket must be active

### 4.2 Epoch management

```solidity
// EpochManager
function createEpoch(
    uint256 bucketId,
    uint64  submissionStart,
    uint64  submissionEnd,
    uint64  stakingStart,
    uint64  stakingEnd
) external returns (uint256 epochId);
```

Constraints:
- Bucket must be active
- `submissionStart >= block.timestamp`
- `submissionStart < submissionEnd <= stakingStart < stakingEnd`

### 4.3 Publishing

```solidity
// ArticleRegistry
function publishArticle(
    uint256 epochId,
    string  calldata contentCID,
    bytes32 contentHash,
    string  calldata manifestCID,
    bytes32 manifestHash,
    uint256 writerStake   // must be >= MIN_WRITER_STAKE (10 CITE)
) external returns (uint256 articleId);
```

Constraints:
- Must be in `Phase.Submission`
- `contentCID`, `contentHash`, `manifestCID`, `manifestHash` all required (non-empty/non-zero)
- `writerStake >= MIN_WRITER_STAKE`
- Transfers `writerStake` from author to contract

### 4.4 Staking (commit-reveal)

**Phase 1 — commit** (during `Phase.Staking`):

```solidity
// Staking
function commitVote(
    uint256 epochId,
    bytes32 commitHash,  // keccak256(abi.encode(epochId, articleId, salt))
    uint256 rawStake
) external;
```

Constraints:
- Must be in `Phase.Staking`
- One commit per voter per epoch (no topping up)
- Transfers `rawStake` from voter to contract

**Phase 2 — reveal** (only during `Phase.Ended`):

```solidity
function revealVote(
    uint256 epochId,
    uint256 articleId,
    bytes32 salt
) external;
```

Constraints:
- Must be in `Phase.Ended`
- Recomputes `keccak256(abi.encode(epochId, articleId, salt))` and verifies against stored `commitHash`
- Article must be eligible and belong to the epoch
- Sets `effectiveStake = isqrt(rawStake)`, updates tally
- Adds voter to `stakerList[epochId][articleId]` (iterated by Rewards at finalization)

**Stake reclaim** (for voters who committed but never revealed):

```solidity
function reclaimStake(uint256 epochId) external;
```

- Only callable after epoch is finalized
- Returns `rawStake` to voter; no reward share

### 4.5 Finalize epoch

```solidity
// Rewards
function finalizeEpoch(uint256 epochId, uint256 writerPoolAmount) external;
```

Constraints:
- Must be in `Phase.Ended`
- Not already finalized

Finalize algorithm:
1. Collect eligible articles from `ArticleRegistry`
2. If no eligible articles: slash bucket creator stake, mark finalized, exit
3. Compute `nPaid = winnersCount(eligibleCount)`
4. Select top `nPaid` by `effectiveStake` (insertion sort, tie-break: raw stake desc, articleId asc)
5. Compute `S_lose` and `readerPool = S_lose - fee`
6. Slash losing reader stakes → transferred to `Rewards`
7. Settle writer stakes (release winners, slash losers)
8. Pull `writerPoolAmount` from bucket into `Rewards`
9. Deactivate bucket (releases creator stake)
10. Mark epoch finalized; store `EpochResult`

### 4.6 Claiming rewards

```solidity
// Rewards
function claimWriter(uint256 epochId, uint256 articleId) external;
```

Constraints:
- Epoch finalized
- `articleId` is in the winners set
- `msg.sender` is article author
- Not yet claimed

Writer payout formula:
- `rank = position of articleId in winners (1-indexed)`
- `payout = writerPool * (1/2^(rank-1)) / sumWeights`

```solidity
function claimReader(uint256 epochId) external;
```

Constraints:
- Epoch finalized
- Not yet claimed

Reader payout:
- If voter backed a losing article: no payout (stake was slashed at finalization)
- If voter backed a winning article: `rawStake` (principal) + `rewardShare` from `readerPool`
- `rewardShare = (effectiveStake(user) / totalEffStake(winners)) * readerPool`

---

## 5) Math / Helper Functions

### 5.1 Integer sqrt (isqrt) — Babylonian method

```solidity
// MathUtils.isqrt
function isqrt(uint256 x) internal pure returns (uint256 y);
```

Used at reveal time for quadratic influence. Whale with 10000 tokens gets `sqrt(10000) = 100` weight.

### 5.2 Ranking selection — top-k without full sort

Given list of `eligibleCount` articles and target `k = nPaid`:
- Maintain `winners[k]` and `scores[k]` arrays
- For each article: insert if score is high enough (O(A * k), acceptable since k ≤ 10)
- Tie-break: higher raw stake → lower articleId

---

## 6) Events

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

---

## 7) Invariants / Properties to Test

### Epoch invariants
- Can't stake outside Staking phase
- Can't publish outside Submission phase
- Reveal only allowed in Ended phase
- Finalize only after Ended and only once

### Influence vs rewards
- Quadratic stake affects winner selection (many small stakers can outperform one whale in effStake)
- Within winning set, effectiveStake drives reader reward share
- Losing stake is not returned to losers

### Stake conservation
- Total slashed losing stakes = `S_lose`
- `readerPool = S_lose - fee` distributed to winning readers
- `fee` stays in Rewards contract (protocol treasury)
- Writer pool drawn exactly from bucket's `fundedRewards`

---

## 8) Explicit Non-Goals (v1)

- Dispute resolution, slashing for misinformation
- Identity / sybil resistance (beyond minimum stake/fees)
- ZK proofs, confidential evidence, private voting
- Off-chain moderation enforcement at protocol layer
- Time-weighted redistribution (replaced by commit-reveal anti-bandwagon)

---

## 9) Demo Flow

1. Deploy `CitecoinsProtocol` (deploys and wires all contracts)
2. Approve + `createBucket(topicURI, 100e18)`, then `fundBucket(bucketId, amount)`
3. `createEpoch(bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd)`
4. Writers: approve + `publishArticle(epochId, contentCID, contentHash, manifestCID, manifestHash, writerStake)`
5. Readers: approve + `commitVote(epochId, keccak256(abi.encode(epochId, articleId, salt)), rawStake)`
6. After epoch ends: `revealVote(epochId, articleId, salt)`
7. `finalizeEpoch(epochId, writerPoolAmount)`
8. Authors: `claimWriter(epochId, articleId)`
9. Readers: `claimReader(epochId)`
