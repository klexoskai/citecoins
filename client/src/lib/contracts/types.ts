// Domain types for the CiteChain frontend

export enum Phase {
  NotStarted = 0,
  Submission = 1,
  Staking = 2,
  Ended = 3,
}

export const PHASE_LABELS: Record<Phase, string> = {
  [Phase.NotStarted]: "Not Started",
  [Phase.Submission]: "Submission",
  [Phase.Staking]: "Staking",
  [Phase.Ended]: "Ended",
};

export const PHASE_COLORS: Record<Phase, string> = {
  [Phase.NotStarted]: "text-muted-foreground",
  [Phase.Submission]: "text-chart-4",
  [Phase.Staking]: "text-primary",
  [Phase.Ended]: "text-muted-foreground",
};

export interface Bucket {
  id: number;
  creator: string;
  topicURI: string;
  fundedRewards: bigint;
  active: boolean;
  // Hydrated from IPFS
  topicData?: TopicMetadata;
}

export interface TopicMetadata {
  title: string;
  description: string;
  evidenceGuidelines?: string;
  mediaRequirements?: string;
  timeScope?: string;
  tags?: string[];
}

export interface EpochConfig {
  id: number;
  bucketId: number;
  submissionStart: number; // unix timestamp
  submissionEnd: number;
  stakingStart: number;
  stakingEnd: number;
  finalized: boolean;
  phase?: Phase;
}

export interface Article {
  id: number;
  author: string;
  epochId: number;
  bucketId: number;
  contentCID: string;
  contentHash: string;
  writerStake: bigint;
  eligible: boolean;
  // Hydrated from IPFS
  content?: ArticleContent;
}

export interface ArticleContent {
  title: string;
  body: string; // markdown
  evidenceManifest?: EvidenceItem[];
}

export interface EvidenceItem {
  type: "link" | "image" | "video" | "document";
  url: string;
  description: string;
  hash?: string;
}

export interface VoteCommit {
  commitHash: string;
  rawStake: bigint;
  revealed: boolean;
  voteTrue: boolean;
  effectiveStake: bigint;
}

export interface Tally {
  trueWeight: bigint;
  falseWeight: bigint;
}

export interface EpochResult {
  finalized: boolean;
  nPaid: number;
  winners: number[];
  writerPool: bigint;
  readerPool: bigint;
}
