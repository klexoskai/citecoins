import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import {
  Calendar,
  Clock,
  PlusCircle,
  Coins,
  ArrowLeft,
  User as UserIcon,
  AlertCircle,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useBucketActions,
  useEpochActions,
  fetchFromIPFS,
} from "@/lib/contracts/hooks";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import type { Bucket, EpochConfig, TopicMetadata } from "@/lib/contracts/types";
import { Phase, PHASE_LABELS } from "@/lib/contracts/types";
import { formatEther } from "ethers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRewards(wei: bigint): string {
  const val = parseFloat(formatEther(wei));
  if (val === 0) return "0 CITE";
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 4 })} CITE`;
}

function formatTs(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function phaseVariant(phase: Phase | undefined): "default" | "secondary" | "outline" | "destructive" {
  switch (phase) {
    case Phase.Submission: return "default";
    case Phase.Staking: return "default";
    case Phase.Ended: return "secondary";
    default: return "outline";
  }
}

function phaseColor(phase: Phase | undefined): string {
  switch (phase) {
    case Phase.Submission: return "bg-chart-4/20 text-chart-4 border-chart-4/30";
    case Phase.Staking: return "bg-primary/20 text-primary border-primary/30";
    case Phase.Ended: return "bg-muted text-muted-foreground border-border";
    default: return "bg-muted/50 text-muted-foreground border-border";
  }
}

// ── Fund Bucket Dialog ────────────────────────────────────────────────────────

function FundBucketDialog({ bucketId, onSuccess }: { bucketId: number; onSuccess: () => void }) {
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
      setStatus("idle");
      setAmount("");
      setOpen(false);
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={!address}
          data-testid="fund-bucket-trigger"
        >
          <Coins size={14} />
          Fund Bucket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm" data-testid="fund-bucket-dialog">
        <div className="space-y-4">
          <div>
            <h2 className="font-serif text-base font-normal">Fund Bucket #{bucketId}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Add CITE tokens to this bucket's reward pool.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fund-amount">Amount (CITE)</Label>
            <Input
              id="fund-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={status === "pending"}
              data-testid="fund-amount-input"
            />
          </div>
          {status === "error" && (
            <p className="text-xs text-destructive" data-testid="fund-error">
              {errorMsg}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={status === "pending"}
              data-testid="fund-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleFund}
              disabled={status === "pending" || !amount || parseFloat(amount) <= 0}
              data-testid="fund-confirm-btn"
            >
              {status === "pending" ? "Funding…" : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Epoch row ─────────────────────────────────────────────────────────────────

function EpochRow({ epoch }: { epoch: EpochConfig }) {
  return (
    <Link href={`/epochs/${epoch.id}`}>
      <div
        className="flex items-center gap-3 p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group"
        data-testid={`epoch-row-${epoch.id}`}
      >
        <div className="shrink-0">
          <span className="text-xs font-mono text-muted-foreground">#{epoch.id}</span>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-xs px-1.5 py-0 h-5 ${phaseColor(epoch.phase)}`}
              data-testid={`epoch-phase-${epoch.id}`}
            >
              {epoch.phase !== undefined ? PHASE_LABELS[epoch.phase] : "Unknown"}
            </Badge>
            {epoch.finalized && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                Finalized
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              Sub: {formatTs(epoch.submissionStart)} → {formatTs(epoch.submissionEnd)}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              Stake: {formatTs(epoch.stakingStart)} → {formatTs(epoch.stakingEnd)}
            </span>
          </div>
        </div>
        <ArrowLeft
          size={14}
          className="shrink-0 rotate-180 text-muted-foreground group-hover:text-foreground transition-colors"
        />
      </div>
    </Link>
  );
}

// ── Bucket Detail page ────────────────────────────────────────────────────────

export default function BucketDetail() {
  const params = useParams<{ id: string }>();
  const bucketId = parseInt(params.id ?? "0", 10);

  const { getBucket } = useBucketActions();
  const { getEpoch, getNextEpochId } = useEpochActions();
  const { address } = useWallet();

  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [topicData, setTopicData] = useState<TopicMetadata | null>(null);
  const [epochs, setEpochs] = useState<EpochConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await getBucket(bucketId);
      if (!b) {
        setError("Bucket not found.");
        return;
      }
      setBucket(b);

      // Fetch IPFS topic data
      if (b.topicURI) {
        fetchFromIPFS<TopicMetadata>(b.topicURI)
          .then((data) => { if (data) setTopicData(data); })
          .catch(() => {});
      }

      // Fetch epochs that belong to this bucket
      const nextId = await getNextEpochId();
      const matching: EpochConfig[] = [];
      for (let i = 1; i < nextId; i++) {
        const ep = await getEpoch(i);
        if (ep && ep.bucketId === bucketId) {
          matching.push(ep);
        }
      }
      setEpochs(matching);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load bucket";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [bucketId, getBucket, getEpoch, getNextEpochId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6" data-testid="bucket-detail-loading">
        <Skeleton className="h-6 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error || !bucket) {
    return (
      <div className="max-w-3xl mx-auto" data-testid="bucket-detail-error">
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <AlertCircle size={32} className="text-destructive" />
          <p className="text-sm font-medium">{error ?? "Bucket not found"}</p>
          <Link href="/">
            <Button variant="outline" size="sm">Back to Feed</Button>
          </Link>
        </div>
      </div>
    );
  }

  const title = topicData?.title || bucket.topicURI || `Bucket #${bucket.id}`;

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="bucket-detail-page">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 h-8" data-testid="back-to-feed">
            <ArrowLeft size={14} />
            Feed
          </Button>
        </Link>
      </div>

      {/* Bucket info card */}
      <Card data-testid="bucket-info-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground" data-testid="bucket-id">
                  Bucket #{bucket.id}
                </span>
                <Badge
                  variant="outline"
                  className={
                    bucket.active
                      ? "bg-chart-4/20 text-chart-4 border-chart-4/30 text-xs"
                      : "bg-muted text-muted-foreground text-xs"
                  }
                  data-testid="bucket-detail-status"
                >
                  {bucket.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <CardTitle
                className="font-serif text-xl font-normal leading-snug"
                data-testid="bucket-detail-title"
              >
                {title}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!address ? (
                <div
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  data-testid="connect-prompt"
                >
                  <Wallet size={13} />
                  Connect wallet to interact
                </div>
              ) : (
                <>
                  <FundBucketDialog bucketId={bucket.id} onSuccess={load} />
                  <Link href={`/create-epoch?bucket=${bucket.id}`}>
                    <Button size="sm" className="gap-2" data-testid="create-epoch-btn">
                      <PlusCircle size={14} />
                      Create Epoch
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-4 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div data-testid="bucket-detail-rewards">
              <p className="text-xs text-muted-foreground mb-0.5">Funded Rewards</p>
              <p className="font-medium text-primary">{formatRewards(bucket.fundedRewards)}</p>
            </div>
            <div data-testid="bucket-detail-creator">
              <p className="text-xs text-muted-foreground mb-0.5">Creator</p>
              <p className="font-mono text-xs flex items-center gap-1">
                <UserIcon size={11} className="text-muted-foreground" />
                {bucket.creator ? shortenAddress(bucket.creator) : "—"}
              </p>
            </div>
          </div>

          {/* Topic metadata */}
          {topicData && (
            <>
              <Separator />
              <div className="space-y-3">
                {topicData.description && (
                  <div data-testid="bucket-detail-description">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm text-foreground leading-relaxed">{topicData.description}</p>
                  </div>
                )}
                {topicData.evidenceGuidelines && (
                  <div data-testid="bucket-detail-evidence">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Evidence Guidelines</p>
                    <p className="text-sm text-foreground leading-relaxed">{topicData.evidenceGuidelines}</p>
                  </div>
                )}
                {topicData.mediaRequirements && (
                  <div data-testid="bucket-detail-media">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Media Requirements</p>
                    <p className="text-sm text-foreground leading-relaxed">{topicData.mediaRequirements}</p>
                  </div>
                )}
                {topicData.timeScope && (
                  <div data-testid="bucket-detail-timescope">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Time Scope</p>
                    <p className="text-sm text-foreground">{topicData.timeScope}</p>
                  </div>
                )}
                {topicData.tags && topicData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1" data-testid="bucket-detail-tags">
                    {topicData.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0 h-5 font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Epochs section */}
      <div data-testid="bucket-epochs-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium" data-testid="epochs-section-title">
            Epochs ({epochs.length})
          </h2>
          {address && (
            <Link href={`/create-epoch?bucket=${bucket.id}`}>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" data-testid="create-epoch-secondary">
                <PlusCircle size={12} />
                New Epoch
              </Button>
            </Link>
          )}
        </div>

        {epochs.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center" data-testid="epochs-empty">
              <p className="text-sm text-muted-foreground">No epochs yet for this bucket.</p>
              {address && (
                <Link href={`/create-epoch?bucket=${bucket.id}`}>
                  <Button size="sm" className="mt-3 gap-2" data-testid="epochs-empty-cta">
                    <PlusCircle size={14} />
                    Create First Epoch
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border" data-testid="epochs-list">
                {epochs.map((ep) => (
                  <EpochRow key={ep.id} epoch={ep} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
