# Threat Model (v1 Spec Draft) — Market Staking Only + Quadratic Influence

This threat model focuses on the risks of using staking markets to approximate credibility/ground truth.

**Important v1 statement:** the protocol does not *verify* truth. It produces a **market-ranked credibility outcome**.

---

## 1) Core Threat: Market manipulation can promote misinformation

### Attack
Coordinated actors stake to push an article into the top-ranked set.

### v1 mitigations
- Quadratic influence (sqrt) reduces marginal influence of whales
- Topic-specific buckets reduce scope of manipulation
- Time-weighted redistribution rewards early conviction and reduces last-minute bandwagons

Residual risk remains: coordinated sybils can still manipulate.

---

## 2) Whale domination

### Attack
A single whale (or small group) can dominate rankings by staking large amounts.

### v1 mitigation
- **Quadratic influence ONLY for ranking:**
  - outcome selection uses `Σ sqrt(stake)`
- This reduces the ability to “buy the winner set”.

### Residual risk
Whales can still:
- earn large rewards if they back winners (rewards are raw-stake-based by design)
- influence outcomes somewhat (quadratic reduces, does not eliminate)

---

## 3) Sybil attacks

### Attack
An attacker splits stake across many wallets to bypass quadratic influence.

### Mitigations (v1-light)
- Minimum stake per action (stake/publish)
- Bucket creation stake and participation thresholds
- Rate limits per epoch (optional): max articles per address, max stake transactions per address
- Encourage identity integrations later (Passport/WorldID) but keep v1 simple

Residual risk: sybil remains a major limitation without identity.

---

## 4) Bandwagon / herding

### Attack
Users wait until the last moment and pile into the expected winner.

### Mitigation
- Implement time advantage as **redistribution weighting**:
  - earlier winning stakes capture a larger share of `S_lose_net`
  - no extra emissions required
- Stake lock until finalize prevents “flip-flopping” after signals emerge

---

## 5) Spam publishing / farming

### Attack
Bots publish many low-quality articles to capture tail rewards or distract.

### Mitigations
- Winner count bounded: `nPaid = clamp(A, 3, 10)` (no unlimited tail)
- Publish fee and/or per-epoch article caps per address
- Evidence manifest requirement for eligibility
- Bucket topic creation stake disincentivizes low-quality buckets

---

## 6) Plagiarism / copying

### Attack
Actors copy content/evidence to free-ride on original reporting.

### Mitigations (v1 practical)
- Off-chain plagiarism detection in the indexer/UI
- Community reporting + UI-level hiding
- Stronger writer staking/slashing requires disputes (not in v1)

---

## 7) Illegal / harmful content in evidence

### Attack / risk
Evidence may include illegal material or harmful content.

### Mitigations
- Never store media on-chain
- Use off-chain storage with moderation layers in the UI
- Bucket guidelines should specify acceptable evidence and safety constraints

---

## 8) Censorship / takedown / availability risks

### Risks
- IPFS pins removed
- hosting providers block content
- UI blocked

### Mitigations
- multi-provider pinning strategy
- consider Arweave for permanence (later)
- open-source UI + multiple deployments
- keep chain pointers/hashes so integrity is preserved even if availability varies

---

## 9) Finalization / MEV / timing attacks

### Attack
Manipulate finalize timing or stake ordering.

### Mitigations
- deterministic finalize after `stakingEnd`
- stake lock and strict window enforcement
- consider commit-reveal staking later if needed (adds complexity)

---

## 10) Summary of v1 security posture

v1 is intentionally minimal:
- credibility is market-ranked, not verified
- quadratic influence reduces whale dominance but is sybilable
- anti-spam measures must exist from day one (fees, caps, topic stake)
- clear UI disclaimers are required to avoid “truth oracle” claims