import { useState, useEffect } from "react";
import { Link } from "wouter";
import { PlusCircle, Layers, Coins } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBucketActions, fetchFromIPFS } from "@/lib/contracts/hooks";
import type { Bucket, TopicMetadata } from "@/lib/contracts/types";
import { formatEther, parseEther } from "ethers";
import { MOCK_TOPICS } from "@/lib/mockContent";
import { addTopicStake, getTopicStake } from "@/lib/mockStakes";
import { useWallet } from "@/lib/contracts/wallet";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRewards(wei: bigint): string {
  const val = parseFloat(formatEther(wei));
  if (val === 0) return "0 CITE";
  if (val < 0.01) return "< 0.01 CITE";
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} CITE`;
}

// ── Bucket Card ───────────────────────────────────────────────────────────────

function StakeBucketDialog({
  bucketId,
  onSuccess,
}: {
  bucketId: number;
  onSuccess: (amount: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { fundBucket } = useBucketActions();
  const { address } = useWallet();

  const handleFund = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus("pending");
    setErrorMsg("");
    try {
      await fundBucket(bucketId, amount);
      onSuccess(amount);
      setStatus("idle");
      setAmount("");
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!address}>
          Stake CITE
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <div className="space-y-4">
          <div>
            <h2 className="font-serif text-base font-normal">Stake in Bucket #{bucketId}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Add CITE to this bucket's pool to upvote the topic.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`stake-amount-${bucketId}`}>Amount (CITE)</Label>
            <Input
              id={`stake-amount-${bucketId}`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={status === "pending"}
            />
          </div>
          {status === "error" && <p className="text-xs text-destructive">{errorMsg}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={status === "pending"}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleFund}
              disabled={status === "pending" || !amount || parseFloat(amount) <= 0}
            >
              {status === "pending" ? "Staking…" : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BucketCard({
  bucket,
  onStakeSuccess,
}: {
  bucket: Bucket;
  onStakeSuccess: (bucketId: number, amount: string) => void;
}) {
  const [topicData, setTopicData] = useState<TopicMetadata | null>(null);

  useEffect(() => {
    if (bucket.topicURI) {
      fetchFromIPFS<TopicMetadata>(bucket.topicURI)
        .then((data) => {
          if (data) setTopicData(data);
        })
        .catch(() => {});
    }
  }, [bucket.topicURI]);

  const title = topicData?.title || bucket.topicURI || `Bucket #${bucket.id}`;
  const description = topicData?.description || "";
  const tags = topicData?.tags ?? [];

  return (
    <Card
      className="group h-full hover:border-primary/50 transition-colors"
      data-testid={`bucket-card-${bucket.id}`}
    >
      <Link href={`/buckets/${bucket.id}`}>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-mono text-muted-foreground" data-testid={`bucket-id-${bucket.id}`}>
              #{bucket.id}
            </span>
            <Badge
              variant={bucket.active ? "default" : "secondary"}
              className={
                bucket.active
                  ? "bg-chart-4/20 text-chart-4 border-chart-4/30 hover:bg-chart-4/20"
                  : "bg-muted text-muted-foreground"
              }
              data-testid={`bucket-status-${bucket.id}`}
            >
              {bucket.active ? "Active" : "Inactive"}
            </Badge>
          </div>
          <h3
            className="font-serif text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors"
            data-testid={`bucket-title-${bucket.id}`}
          >
            {title}
          </h3>
        </CardHeader>
      </Link>

      <CardContent className="pt-0 space-y-3">
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`bucket-desc-${bucket.id}`}>
              {description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-xs px-1.5 py-0 h-5 font-normal"
                >
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 font-normal">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          )}

        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid={`bucket-rewards-${bucket.id}`}
        >
          <span className="text-primary font-medium">{formatRewards(bucket.fundedRewards)}</span>
          <span>staked in bucket</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Link href={`/buckets/${bucket.id}`}>
            <Button size="sm" variant="outline">View</Button>
          </Link>
          <StakeBucketDialog
            bucketId={bucket.id}
            onSuccess={(amount) => onStakeSuccess(bucket.id, amount)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function BucketCardSkeleton() {
  return (
    <Card className="h-[170px]">
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="h-3 w-24" />
      </CardContent>
    </Card>
  );
}

// ── Feed page ─────────────────────────────────────────────────────────────────

export default function Feed() {
  const { getAllBuckets } = useBucketActions();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mockStakes, setMockStakes] = useState<Record<string, number>>({});
  const [mockStakeInputs, setMockStakeInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, number> = {};
    for (const topic of MOCK_TOPICS) {
      next[topic.id] = getTopicStake(topic.id);
    }
    setMockStakes(next);
  }, []);

  const handleMockStake = (topicId: string, amountText: string) => {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextStake = addTopicStake(topicId, amount);
    setMockStakes((prev) => ({ ...prev, [topicId]: nextStake }));
    setMockStakeInputs((prev) => ({ ...prev, [topicId]: "" }));
  };

  const handleBucketStakeSuccess = (bucketId: number, amount: string) => {
    try {
      const delta = parseEther(amount);
      setBuckets((prev) =>
        prev.map((b) =>
          b.id === bucketId ? { ...b, fundedRewards: b.fundedRewards + delta } : b
        )
      );
    } catch {
      // Ignore local optimistic update if parsing fails; on reload chain value still reflects truth.
    }
  };

  useEffect(() => {
    getAllBuckets()
      .then(setBuckets)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load buckets";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [getAllBuckets]);

  return (
    <div className="max-w-5xl mx-auto space-y-6" data-testid="feed-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl text-foreground" data-testid="feed-title">
            Active Topics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse citation bounty pools open for contributions
          </p>
        </div>
        <Link href="/create-bucket">
          <Button size="sm" className="gap-2" data-testid="create-bucket-cta">
            <PlusCircle size={15} />
            Create New Topic
          </Button>
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="p-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm"
          data-testid="feed-error"
        >
          {error} — Make sure your wallet is connected to the correct network.
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="feed-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <BucketCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state with built-in mock topics */}
      {!loading && !error && buckets.length === 0 && (
        <div className="space-y-4" data-testid="feed-empty">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Layers size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No on-chain topics yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Explore mock topics below or create your own bucket.
            </p>
            <Link href="/create-bucket">
              <Button size="sm" className="gap-2" data-testid="feed-empty-cta">
                <PlusCircle size={15} />
                Create New Topic
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_TOPICS.map((topic) => (
              <Card key={topic.id} className="group h-full hover:border-primary/50 transition-colors">
                  <div className="aspect-[16/8] w-full overflow-hidden rounded-t-lg border-b border-border">
                    <img
                      src={topic.imageUrl}
                      alt={topic.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </div>
                <Link href={`/topics/${topic.id}`}>
                  <CardHeader className="pb-2">
                    <h3 className="font-serif text-base leading-snug group-hover:text-primary transition-colors">
                      {topic.title}
                    </h3>
                  </CardHeader>
                </Link>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{topic.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {topic.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 h-5 font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="text-primary font-medium">{(mockStakes[topic.id] ?? 0).toLocaleString()} CITE</span>
                    <span>staked in topic</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link href={`/topics/${topic.id}`}>
                      <Button size="sm" variant="outline" className="shrink-0">Open</Button>
                    </Link>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      className="h-8 w-full min-w-[96px] sm:w-24 flex-1"
                      value={mockStakeInputs[topic.id] ?? ""}
                      onChange={(e) =>
                        setMockStakeInputs((prev) => ({ ...prev, [topic.id]: e.target.value }))
                      }
                    />
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleMockStake(topic.id, mockStakeInputs[topic.id] ?? "")}
                    >
                      Stake
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Bucket grid */}
      {!loading && buckets.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="feed-grid"
        >
          {buckets.map((bucket) => (
            <BucketCard
              key={bucket.id}
              bucket={bucket}
              onStakeSuccess={handleBucketStakeSuccess}
            />
          ))}
        </div>
      )}
    </div>
  );
}
