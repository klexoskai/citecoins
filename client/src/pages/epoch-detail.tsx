import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { formatEther } from "ethers";
import { format, fromUnixTime } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { useEpochActions, useArticleActions, useRewardsActions } from "@/lib/contracts/hooks";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import { Phase, PHASE_LABELS, PHASE_COLORS } from "@/lib/contracts/types";
import type { EpochConfig, Article } from "@/lib/contracts/types";

function phaseBadgeVariant(phase: Phase): "default" | "secondary" | "outline" {
  switch (phase) {
    case Phase.Submission: return "default";
    case Phase.Staking: return "default";
    case Phase.Ended: return "secondary";
    default: return "outline";
  }
}

function computeProgress(epoch: EpochConfig): number {
  const now = Math.floor(Date.now() / 1000);
  const start = epoch.submissionStart;
  const end = epoch.stakingEnd;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function formatTs(ts: number): string {
  if (!ts) return "—";
  try {
    return format(fromUnixTime(ts), "MMM d, yyyy HH:mm");
  } catch {
    return String(ts);
  }
}

export default function EpochDetailPage() {
  const { id } = useParams<{ id: string }>();
  const epochId = Number(id);
  const { address } = useWallet();

  const [epoch, setEpoch] = useState<EpochConfig | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Finalize dialog
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [writerPoolAmount, setWriterPoolAmount] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeSuccess, setFinalizeSuccess] = useState(false);

  const { getEpoch } = useEpochActions();
  const { getEpochArticles, getArticle } = useArticleActions();
  const { finalizeEpoch } = useRewardsActions();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ep = await getEpoch(epochId);
      if (!ep) throw new Error(`Epoch ${epochId} not found`);
      setEpoch(ep);

      const ids = await getEpochArticles(epochId);
      const artList = await Promise.all(ids.map((aid) => getArticle(aid)));
      setArticles(artList.filter(Boolean) as Article[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load epoch");
    } finally {
      setLoading(false);
    }
  }, [epochId, getEpoch, getEpochArticles, getArticle]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleFinalize() {
    if (!writerPoolAmount) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await finalizeEpoch(epochId, writerPoolAmount);
      setFinalizeSuccess(true);
      setFinalizeOpen(false);
      loadData();
    } catch (err: any) {
      setFinalizeError(err?.message ?? "Finalization failed");
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="epoch-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !epoch) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4" data-testid="epoch-error">
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Failed to load epoch</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={loadData}
                data-testid="epoch-retry-btn"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = computeProgress(epoch);
  const phase = epoch.phase ?? Phase.NotStarted;
  const canFinalize =
    phase === Phase.Ended && !epoch.finalized && !finalizeSuccess;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/buckets">
              <span className="hover:underline cursor-pointer">Buckets</span>
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/buckets/${epoch.bucketId}`}>
              <span className="hover:underline cursor-pointer">
                Bucket #{epoch.bucketId}
              </span>
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Epoch #{epochId}</span>
          </div>
          <h1
            className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)]"
            data-testid="epoch-title"
          >
            Epoch #{epochId}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant={phaseBadgeVariant(phase)}
              className={PHASE_COLORS[phase]}
              data-testid="epoch-phase-badge"
            >
              {PHASE_LABELS[phase]}
            </Badge>
            {epoch.finalized && (
              <Badge variant="outline" className="text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Finalized
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {canFinalize && (
            <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  data-testid="finalize-epoch-btn"
                >
                  <Trophy className="h-3.5 w-3.5 mr-1.5" />
                  Finalize Epoch
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="finalize-dialog">
                <DialogHeader>
                  <DialogTitle>Finalize Epoch #{epochId}</DialogTitle>
                  <DialogDescription>
                    Set the writer pool amount (CITE) from funded bucket
                    rewards to distribute to eligible article authors.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="writerPool">Writer Pool Amount (CITE)</Label>
                    <Input
                      id="writerPool"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="e.g. 1000"
                      value={writerPoolAmount}
                      onChange={(e) => setWriterPoolAmount(e.target.value)}
                      data-testid="input-writer-pool"
                    />
                  </div>
                  {finalizeError && (
                    <p className="text-sm text-destructive flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {finalizeError}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setFinalizeOpen(false)}
                    disabled={finalizing}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleFinalize}
                    disabled={finalizing || !writerPoolAmount}
                    data-testid="confirm-finalize-btn"
                  >
                    {finalizing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Finalizing…
                      </>
                    ) : (
                      "Finalize"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Link href={`/publish?epoch=${epochId}`}>
            <Button variant="outline" size="sm" data-testid="submit-article-btn">
              Submit Article
            </Button>
          </Link>
        </div>
      </div>

      {/* Timeline card */}
      <Card data-testid="epoch-timeline">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Phase progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Start</span>
              <span>{progress}% complete</span>
              <span>End</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="epoch-progress" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatTs(epoch.submissionStart)}</span>
              <span>{formatTs(epoch.stakingEnd)}</span>
            </div>
          </div>

          <Separator />

          {/* Phase steps */}
          <div className="grid grid-cols-4 gap-2">
            {[Phase.NotStarted, Phase.Submission, Phase.Staking, Phase.Ended].map(
              (p) => (
                <div
                  key={p}
                  className={`text-center text-xs rounded-md py-1.5 px-2 ${
                    phase === p
                      ? "bg-primary/10 text-primary font-medium"
                      : phase > p
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                  data-testid={`phase-step-${p}`}
                >
                  {PHASE_LABELS[p]}
                </div>
              )
            )}
          </div>

          <Separator />

          {/* Time windows */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Submission window</span>
              <span className="font-mono text-xs">
                {formatTs(epoch.submissionStart)} →{" "}
                {formatTs(epoch.submissionEnd)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Staking window</span>
              <span className="font-mono text-xs">
                {formatTs(epoch.stakingStart)} → {formatTs(epoch.stakingEnd)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bucket</span>
              <Link href={`/buckets/${epoch.bucketId}`}>
                <span
                  className="text-primary hover:underline cursor-pointer text-xs"
                  data-testid="epoch-bucket-link"
                >
                  #{epoch.bucketId}
                </span>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">
            Articles{" "}
            <span className="text-muted-foreground font-normal text-sm">
              ({articles.length})
            </span>
          </h2>
        </div>

        {articles.length === 0 && (
          <Card data-testid="no-articles">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No articles submitted yet.
            </CardContent>
          </Card>
        )}

        {articles.map((article) => (
          <Card
            key={article.id}
            className="group hover:border-primary/40 transition-colors"
            data-testid={`article-card-${article.id}`}
          >
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">
                    #{article.id}
                  </span>
                  {article.eligible && (
                    <Badge
                      variant="default"
                      className="text-[10px] h-4 px-1.5"
                      data-testid={`article-eligible-${article.id}`}
                    >
                      Eligible
                    </Badge>
                  )}
                </div>
                <div className="text-sm font-medium truncate" data-testid={`article-cid-${article.id}`}>
                  {article.contentCID
                    ? article.contentCID.slice(0, 20) + "…"
                    : "No CID"}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Author:{" "}
                    <span className="font-mono">
                      {shortenAddress(article.author)}
                    </span>
                  </span>
                  <span>
                    Stake:{" "}
                    {parseFloat(formatEther(article.writerStake)).toFixed(2)}{" "}
                    CITE
                  </span>
                </div>
              </div>
              <Link href={`/articles/${article.id}`}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`view-article-${article.id}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
