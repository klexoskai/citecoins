import { useState, useEffect } from "react";
import { Link } from "wouter";
import { PlusCircle, Layers } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBucketActions, fetchFromIPFS } from "@/lib/contracts/hooks";
import type { Bucket, TopicMetadata } from "@/lib/contracts/types";
import { formatEther } from "ethers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRewards(wei: bigint): string {
  const val = parseFloat(formatEther(wei));
  if (val === 0) return "0 CITE";
  if (val < 0.01) return "< 0.01 CITE";
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} CITE`;
}

// ── Bucket Card ───────────────────────────────────────────────────────────────

function BucketCard({ bucket }: { bucket: Bucket }) {
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
    <Link href={`/buckets/${bucket.id}`}>
      <Card
        className="group h-full cursor-pointer hover:border-primary/50 transition-colors"
        data-testid={`bucket-card-${bucket.id}`}
      >
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
            <span>funded</span>
          </div>
        </CardContent>
      </Card>
    </Link>
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

      {/* Empty state */}
      {!loading && !error && buckets.length === 0 && (
        <div
          className="flex flex-col items-center justify-center py-20 text-center"
          data-testid="feed-empty"
        >
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Layers size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No topics yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Be the first to create a citation bounty topic.
          </p>
          <Link href="/create-bucket">
            <Button size="sm" className="gap-2" data-testid="feed-empty-cta">
              <PlusCircle size={15} />
              Create New Topic
            </Button>
          </Link>
        </div>
      )}

      {/* Bucket grid */}
      {!loading && buckets.length > 0 && (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="feed-grid"
        >
          {buckets.map((bucket) => (
            <BucketCard key={bucket.id} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}
