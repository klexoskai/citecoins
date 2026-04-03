import { Contract, parseEther, formatEther, keccak256, solidityPacked, randomBytes, hexlify } from "ethers";
import { useWallet } from "./wallet";
import { ADDRESSES } from "./addresses";
import {
  CitecoinTokenABI,
  BucketManagerABI,
  EpochManagerABI,
  ArticleRegistryABI,
  StakingABI,
  RewardsABI,
  CitecoinsProtocolABI,
} from "./abis";
import type { Bucket, EpochConfig, Article, Phase, Tally, VoteCommit, TopicMetadata, ArticleContent } from "./types";
import { useCallback, useMemo } from "react";

// ─── Contract instances ──────────────────────────────────────────────────────

function useContract(address: string, abi: string[]) {
  const { signer, provider } = useWallet();
  return useMemo(() => {
    if (!address) return null;
    const signerOrProvider = signer || provider;
    if (!signerOrProvider) return null;
    return new Contract(address, abi, signerOrProvider);
  }, [address, abi, signer, provider]);
}

export function useTokenContract() {
  return useContract(ADDRESSES.token, CitecoinTokenABI);
}

export function useBucketContract() {
  return useContract(ADDRESSES.buckets, BucketManagerABI);
}

export function useEpochContract() {
  return useContract(ADDRESSES.epochs, EpochManagerABI);
}

export function useArticleContract() {
  return useContract(ADDRESSES.articles, ArticleRegistryABI);
}

export function useStakingContract() {
  return useContract(ADDRESSES.staking, StakingABI);
}

export function useRewardsContract() {
  return useContract(ADDRESSES.rewards, RewardsABI);
}

export function useProtocolContract() {
  return useContract(ADDRESSES.protocol, CitecoinsProtocolABI);
}

// ─── Token helpers ───────────────────────────────────────────────────────────

export function useTokenActions() {
  const token = useTokenContract();
  const { address } = useWallet();

  const getBalance = useCallback(async (): Promise<string> => {
    if (!token || !address) return "0";
    const bal = await token.balanceOf(address);
    return formatEther(bal);
  }, [token, address]);

  const approve = useCallback(async (spender: string, amount: string) => {
    if (!token) throw new Error("Token contract not available");
    const tx = await token.approve(spender, parseEther(amount));
    await tx.wait();
    return tx;
  }, [token]);

  const getAllowance = useCallback(async (spender: string): Promise<string> => {
    if (!token || !address) return "0";
    const allowance = await token.allowance(address, spender);
    return formatEther(allowance);
  }, [token, address]);

  return { getBalance, approve, getAllowance };
}

// ─── Bucket actions ──────────────────────────────────────────────────────────

export function useBucketActions() {
  const buckets = useBucketContract();
  const token = useTokenContract();

  const createBucket = useCallback(async (topicURI: string): Promise<number> => {
    if (!buckets) throw new Error("Bucket contract not available");
    const tx = await buckets.createBucket(topicURI);
    const receipt = await tx.wait();
    // Parse BucketCreated event to get bucketId
    const event = receipt.logs.find((l: any) => {
      try {
        return buckets.interface.parseLog(l)?.name === "BucketCreated";
      } catch { return false; }
    });
    if (event) {
      const parsed = buckets.interface.parseLog(event);
      return Number(parsed!.args.bucketId);
    }
    return 0;
  }, [buckets]);

  const fundBucket = useCallback(async (bucketId: number, amount: string) => {
    if (!buckets || !token) throw new Error("Contracts not available");
    // Approve first
    const approveTx = await token.approve(ADDRESSES.buckets, parseEther(amount));
    await approveTx.wait();
    // Fund
    const tx = await buckets.fundBucket(bucketId, parseEther(amount));
    await tx.wait();
    return tx;
  }, [buckets, token]);

  const getBucket = useCallback(async (bucketId: number): Promise<Bucket | null> => {
    if (!buckets) return null;
    const [creator, topicURI, fundedRewards, active] = await buckets.getBucket(bucketId);
    return { id: bucketId, creator, topicURI, fundedRewards, active };
  }, [buckets]);

  const getNextBucketId = useCallback(async (): Promise<number> => {
    if (!buckets) return 1;
    return Number(await buckets.nextBucketId());
  }, [buckets]);

  const getAllBuckets = useCallback(async (): Promise<Bucket[]> => {
    if (!buckets) return [];
    const nextId = Number(await buckets.nextBucketId());
    const results: Bucket[] = [];
    for (let i = 1; i < nextId; i++) {
      const [creator, topicURI, fundedRewards, active] = await buckets.getBucket(i);
      results.push({ id: i, creator, topicURI, fundedRewards, active });
    }
    return results;
  }, [buckets]);

  return { createBucket, fundBucket, getBucket, getNextBucketId, getAllBuckets };
}

// ─── Epoch actions ───────────────────────────────────────────────────────────

export function useEpochActions() {
  const epochs = useEpochContract();

  const createEpoch = useCallback(async (
    bucketId: number,
    submissionStart: number,
    submissionEnd: number,
    stakingStart: number,
    stakingEnd: number,
  ): Promise<number> => {
    if (!epochs) throw new Error("Epoch contract not available");
    const tx = await epochs.createEpoch(bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd);
    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => {
      try {
        return epochs.interface.parseLog(l)?.name === "EpochCreated";
      } catch { return false; }
    });
    if (event) {
      const parsed = epochs.interface.parseLog(event);
      return Number(parsed!.args.epochId);
    }
    return 0;
  }, [epochs]);

  const getEpoch = useCallback(async (epochId: number): Promise<EpochConfig | null> => {
    if (!epochs) return null;
    const [bucketId, submissionStart, submissionEnd, stakingStart, stakingEnd, finalized] = await epochs.getEpoch(epochId);
    const phase = Number(await epochs.currentPhase(epochId)) as Phase;
    return {
      id: epochId,
      bucketId: Number(bucketId),
      submissionStart: Number(submissionStart),
      submissionEnd: Number(submissionEnd),
      stakingStart: Number(stakingStart),
      stakingEnd: Number(stakingEnd),
      finalized,
      phase,
    };
  }, [epochs]);

  const getNextEpochId = useCallback(async (): Promise<number> => {
    if (!epochs) return 1;
    return Number(await epochs.nextEpochId());
  }, [epochs]);

  const getPhase = useCallback(async (epochId: number): Promise<Phase> => {
    if (!epochs) return 0 as Phase;
    return Number(await epochs.currentPhase(epochId)) as Phase;
  }, [epochs]);

  return { createEpoch, getEpoch, getNextEpochId, getPhase };
}

// ─── Article actions ─────────────────────────────────────────────────────────

export function useArticleActions() {
  const articles = useArticleContract();
  const token = useTokenContract();

  const publishArticle = useCallback(async (
    epochId: number,
    contentCID: string,
    contentHash: string,
    writerStake: string,
  ): Promise<number> => {
    if (!articles || !token) throw new Error("Contracts not available");
    // Approve token spend
    const approveTx = await token.approve(ADDRESSES.articles, parseEther(writerStake));
    await approveTx.wait();
    // Publish
    const tx = await articles.publishArticle(epochId, contentCID, contentHash, parseEther(writerStake));
    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => {
      try {
        return articles.interface.parseLog(l)?.name === "ArticlePublished";
      } catch { return false; }
    });
    if (event) {
      const parsed = articles.interface.parseLog(event);
      return Number(parsed!.args.articleId);
    }
    return 0;
  }, [articles, token]);

  const getArticle = useCallback(async (articleId: number): Promise<Article | null> => {
    if (!articles) return null;
    const [author, epochId, bucketId, contentCID, contentHash, writerStake, eligible] =
      await articles.getArticle(articleId);
    return {
      id: articleId,
      author,
      epochId: Number(epochId),
      bucketId: Number(bucketId),
      contentCID,
      contentHash,
      writerStake,
      eligible,
    };
  }, [articles]);

  const getEpochArticles = useCallback(async (epochId: number): Promise<number[]> => {
    if (!articles) return [];
    const ids = await articles.getEpochArticles(epochId);
    return ids.map((id: bigint) => Number(id));
  }, [articles]);

  return { publishArticle, getArticle, getEpochArticles };
}

// ─── Staking actions ─────────────────────────────────────────────────────────

export function useStakingActions() {
  const staking = useStakingContract();
  const token = useTokenContract();

  const commitVote = useCallback(async (
    epochId: number,
    articleId: number,
    voteTrue: boolean,
    rawStake: string,
  ): Promise<{ salt: string }> => {
    if (!staking || !token) throw new Error("Contracts not available");
    // Generate random salt
    const salt = hexlify(randomBytes(32));
    // Compute commit hash: keccak256(abi.encodePacked(articleId, voteTrue, salt))
    const commitHash = keccak256(
      solidityPacked(["uint256", "bool", "bytes32"], [articleId, voteTrue, salt])
    );
    // Approve token spend
    const approveTx = await token.approve(ADDRESSES.staking, parseEther(rawStake));
    await approveTx.wait();
    // Commit
    const tx = await staking.commitVote(epochId, articleId, commitHash, parseEther(rawStake));
    await tx.wait();
    // Return salt so user can save it for reveal
    return { salt };
  }, [staking, token]);

  const revealVote = useCallback(async (
    epochId: number,
    articleId: number,
    voteTrue: boolean,
    salt: string,
  ) => {
    if (!staking) throw new Error("Staking contract not available");
    const tx = await staking.revealVote(epochId, articleId, voteTrue, salt);
    await tx.wait();
    return tx;
  }, [staking]);

  const getTally = useCallback(async (epochId: number, articleId: number): Promise<Tally> => {
    if (!staking) return { trueWeight: 0n, falseWeight: 0n };
    const [trueWeight, falseWeight] = await staking.getTally(epochId, articleId);
    return { trueWeight, falseWeight };
  }, [staking]);

  const getCommit = useCallback(async (
    epochId: number,
    articleId: number,
    voter: string
  ): Promise<VoteCommit | null> => {
    if (!staking) return null;
    const [commitHash, rawStake, revealed, voteTrue, effectiveStake] =
      await staking.getCommit(epochId, articleId, voter);
    if (rawStake === 0n) return null;
    return { commitHash, rawStake, revealed, voteTrue, effectiveStake };
  }, [staking]);

  return { commitVote, revealVote, getTally, getCommit };
}

// ─── Rewards actions ─────────────────────────────────────────────────────────

export function useRewardsActions() {
  const rewards = useRewardsContract();

  const finalizeEpoch = useCallback(async (epochId: number, writerPoolAmount: string) => {
    if (!rewards) throw new Error("Rewards contract not available");
    const tx = await rewards.finalizeEpoch(epochId, parseEther(writerPoolAmount));
    await tx.wait();
    return tx;
  }, [rewards]);

  const claimWriter = useCallback(async (epochId: number, articleId: number) => {
    if (!rewards) throw new Error("Rewards contract not available");
    const tx = await rewards.claimWriter(epochId, articleId);
    await tx.wait();
    return tx;
  }, [rewards]);

  const claimReader = useCallback(async (epochId: number) => {
    if (!rewards) throw new Error("Rewards contract not available");
    const tx = await rewards.claimReader(epochId);
    await tx.wait();
    return tx;
  }, [rewards]);

  const isWriterClaimed = useCallback(async (epochId: number, articleId: number): Promise<boolean> => {
    if (!rewards) return false;
    return await rewards.writerClaimed(epochId, articleId);
  }, [rewards]);

  const isReaderClaimed = useCallback(async (epochId: number, reader: string): Promise<boolean> => {
    if (!rewards) return false;
    return await rewards.readerClaimed(epochId, reader);
  }, [rewards]);

  return { finalizeEpoch, claimWriter, claimReader, isWriterClaimed, isReaderClaimed };
}

// ─── IPFS / Pinata helpers ───────────────────────────────────────────────────

const PINATA_API = "https://api.pinata.cloud";

export async function uploadToPinata(data: object | string, name: string): Promise<string> {
  const apiKey = import.meta.env.VITE_PINATA_API_KEY;
  const secret = import.meta.env.VITE_PINATA_SECRET;

  if (!apiKey || !secret) {
    throw new Error("Pinata API keys not configured. Set VITE_PINATA_API_KEY and VITE_PINATA_SECRET in .env");
  }

  const body = typeof data === "string" ? data : JSON.stringify(data);
  const blob = new Blob([body], { type: "application/json" });
  const formData = new FormData();
  formData.append("file", blob, `${name}.json`);
  formData.append("pinataMetadata", JSON.stringify({ name }));

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secret,
    },
    body: formData,
  });

  if (!res.ok) throw new Error(`Pinata upload failed: ${res.statusText}`);
  const result = await res.json();
  return result.IpfsHash; // CID
}

export function ipfsUrl(cid: string): string {
  if (!cid) return "";
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

export async function fetchFromIPFS<T>(cid: string): Promise<T | null> {
  if (!cid) return null;
  try {
    const res = await fetch(ipfsUrl(cid));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Utils ───────────────────────────────────────────────────────────────────

export function computeContentHash(content: string): string {
  return keccak256(new TextEncoder().encode(content));
}
