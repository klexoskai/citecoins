import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { formatEther } from "ethers";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Link as LinkIcon,
  Image,
  Video,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Eye,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  Key,
  Copy,
  Check,
} from "lucide-react";
import {
  useArticleActions,
  useEpochActions,
  useStakingActions,
  fetchFromIPFS,
  ipfsUrl,
} from "@/lib/contracts/hooks";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import { Phase, PHASE_LABELS, PHASE_COLORS } from "@/lib/contracts/types";
import type { Article, ArticleContent, EvidenceItem, VoteCommit, Tally } from "@/lib/contracts/types";

const EVIDENCE_ICONS: Record<string, React.ReactNode> = {
  link: <LinkIcon className="h-3.5 w-3.5" />,
  image: <Image className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
};

function renderMarkdown(text: string): string {
  // Very minimal markdown → HTML conversion (no external dep)
  return text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const articleId = Number(id);
  const { address } = useWallet();

  const [article, setArticle] = useState<Article | null>(null);
  const [content, setContent] = useState<ArticleContent | null>(null);
  const [phase, setPhase] = useState<Phase>(Phase.NotStarted);
  const [tally, setTally] = useState<Tally | null>(null);
  const [userCommit, setUserCommit] = useState<VoteCommit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Vote commit dialog
  const [voteDialogOpen, setVoteDialogOpen] = useState(false);
  const [pendingVoteTrue, setPendingVoteTrue] = useState<boolean>(true);
  const [stakeAmount, setStakeAmount] = useState("");
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [savedSalt, setSavedSalt] = useState<string | null>(null);
  const [saltCopied, setSaltCopied] = useState(false);

  // Reveal dialog
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);
  const [revealSalt, setRevealSalt] = useState("");
  const [revealVoteTrue, setRevealVoteTrue] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealSuccess, setRevealSuccess] = useState(false);

  const { getArticle } = useArticleActions();
  const { getPhase } = useEpochActions();
  const { commitVote, revealVote, getTally, getCommit } = useStakingActions();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const art = await getArticle(articleId);
      if (!art) throw new Error(`Article ${articleId} not found`);
      setArticle(art);

      // Load phase for this epoch
      const p = await getPhase(art.epochId);
      setPhase(p);

      // Load tally
      const t = await getTally(art.epochId, articleId);
      setTally(t);

      // Check user commit
      if (address) {
        const commit = await getCommit(art.epochId, articleId, address);
        setUserCommit(commit);
        if (commit && commit.voteTrue !== undefined) {
          setRevealVoteTrue(commit.voteTrue);
        }
      }

      // Load IPFS content
      if (art.contentCID) {
        setContentLoading(true);
        const c = await fetchFromIPFS<ArticleContent>(art.contentCID);
        setContent(c);
        setContentLoading(false);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load article");
    } finally {
      setLoading(false);
    }
  }, [articleId, address, getArticle, getPhase, getTally, getCommit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pre-fill reveal salt if still in state
  useEffect(() => {
    if (savedSalt) setRevealSalt(savedSalt);
  }, [savedSalt, revealDialogOpen]);

  async function handleCommitVote() {
    if (!article || !stakeAmount) return;
    setVoting(true);
    setVoteError(null);
    try {
      const result = await commitVote(
        article.epochId,
        articleId,
        pendingVoteTrue,
        stakeAmount
      );
      setSavedSalt(result.salt);
      setRevealSalt(result.salt);
      // Reload commit
      if (address) {
        const commit = await getCommit(article.epochId, articleId, address);
        setUserCommit(commit);
      }
    } catch (err: any) {
      setVoteError(err?.message ?? "Vote commit failed");
    } finally {
      setVoting(false);
    }
  }

  async function handleRevealVote() {
    if (!article || !revealSalt) return;
    setRevealing(true);
    setRevealError(null);
    try {
      await revealVote(article.epochId, articleId, revealVoteTrue, revealSalt);
      setRevealSuccess(true);
      setRevealDialogOpen(false);
      loadData();
    } catch (err: any) {
      setRevealError(err?.message ?? "Reveal failed");
    } finally {
      setRevealing(false);
    }
  }

  function copySalt() {
    if (!savedSalt) return;
    navigator.clipboard.writeText(savedSalt).then(() => {
      setSaltCopied(true);
      setTimeout(() => setSaltCopied(false), 2000);
    });
  }

  function openVoteDialog(voteTrue: boolean) {
    setPendingVoteTrue(voteTrue);
    setVoteError(null);
    setStakeAmount("");
    setSavedSalt(null);
    setVoteDialogOpen(true);
  }

  const totalWeight =
    tally ? Number(tally.trueWeight + tally.falseWeight) : 0;
  const truePercent =
    totalWeight > 0 ? (Number(tally!.trueWeight) / totalWeight) * 100 : 50;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="article-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4" data-testid="article-error">
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Failed to load article</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={loadData}
                data-testid="article-retry-btn"
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isStakingPhase = phase === Phase.Staking;
  const hasPendingCommit = userCommit && !userCommit.revealed;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/epochs/${article.epochId}`}>
          <span className="hover:underline cursor-pointer">
            Epoch #{article.epochId}
          </span>
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>Article #{articleId}</span>
      </div>

      {/* Metadata card */}
      <Card data-testid="article-meta">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-[family-name:var(--font-display)]">
                {content?.title ?? `Article #${articleId}`}
              </CardTitle>
              <CardDescription className="mt-1">
                Submitted to{" "}
                <Link href={`/epochs/${article.epochId}`}>
                  <span className="text-primary hover:underline cursor-pointer">
                    Epoch #{article.epochId}
                  </span>
                </Link>{" "}
                ·{" "}
                <Link href={`/buckets/${article.bucketId}`}>
                  <span className="text-primary hover:underline cursor-pointer">
                    Bucket #{article.bucketId}
                  </span>
                </Link>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {article.eligible && (
                <Badge
                  variant="default"
                  className="text-xs"
                  data-testid="article-eligible-badge"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Eligible
                </Badge>
              )}
              {hasPendingCommit && (
                <Badge
                  variant="secondary"
                  className="text-xs"
                  data-testid="pending-reveal-badge"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Pending Reveal
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Author</span>
              <span className="font-mono text-xs" data-testid="article-author">
                {shortenAddress(article.author)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Writer Stake</span>
              <span className="font-mono text-xs" data-testid="article-stake">
                {parseFloat(formatEther(article.writerStake)).toFixed(2)} CITE
              </span>
            </div>
            <div className="flex items-center justify-between col-span-2">
              <span className="text-muted-foreground">Content CID</span>
              <a
                href={ipfsUrl(article.contentCID)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                data-testid="article-cid"
              >
                {article.contentCID
                  ? article.contentCID.slice(0, 24) + "…"
                  : "None"}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Article body */}
      <Card data-testid="article-content">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent>
          {contentLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading from IPFS…
            </div>
          )}
          {!contentLoading && !content && (
            <p className="text-sm text-muted-foreground py-4">
              Content not available or IPFS gateway unreachable.
            </p>
          )}
          {!contentLoading && content && (
            <ScrollArea className="max-h-96">
              <div
                className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content.body) }}
                data-testid="article-body"
              />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Evidence */}
      {content?.evidenceManifest && content.evidenceManifest.length > 0 && (
        <Card data-testid="article-evidence">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {content.evidenceManifest.map((item: EvidenceItem, idx: number) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-md border border-border/50 p-3"
                data-testid={`evidence-item-${idx}`}
              >
                <div className="text-muted-foreground mt-0.5 shrink-0">
                  {EVIDENCE_ICONS[item.type] ?? (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">
                      {item.type}
                    </Badge>
                  </div>
                  {item.description && (
                    <p className="text-sm">{item.description}</p>
                  )}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                      data-testid={`evidence-url-${idx}`}
                    >
                      {item.url}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Staking section */}
      {isStakingPhase && (
        <Card data-testid="staking-section">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Staking</CardTitle>
                <CardDescription>
                  Vote on this article&apos;s credibility during the staking phase.
                </CardDescription>
              </div>
              <Badge
                variant="default"
                className={PHASE_COLORS[Phase.Staking]}
                data-testid="staking-phase-badge"
              >
                Staking Open
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tally */}
            {tally && (
              <div className="space-y-2" data-testid="vote-tally">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3 text-primary" />
                    Credible:{" "}
                    {parseFloat(formatEther(tally.trueWeight)).toFixed(2)} CITE
                  </span>
                  <span className="flex items-center gap-1">
                    Not Credible:{" "}
                    {parseFloat(formatEther(tally.falseWeight)).toFixed(2)} CITE
                    <ThumbsDown className="h-3 w-3 text-destructive" />
                  </span>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden bg-muted">
                  <div
                    className="absolute left-0 top-0 h-full bg-primary transition-all"
                    style={{ width: `${truePercent}%` }}
                    data-testid="tally-bar"
                  />
                </div>
              </div>
            )}

            <Separator />

            {!address && (
              <p className="text-sm text-muted-foreground">
                Connect your wallet to vote.
              </p>
            )}

            {address && !hasPendingCommit && (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => openVoteDialog(true)}
                  data-testid="vote-credible-btn"
                >
                  <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                  Vote Credible
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => openVoteDialog(false)}
                  data-testid="vote-not-credible-btn"
                >
                  <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                  Vote Not Credible
                </Button>
              </div>
            )}

            {address && hasPendingCommit && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium text-primary flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  You have a pending vote to reveal
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Your vote has been committed. Reveal it before the staking
                  period ends.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setRevealDialogOpen(true)}
                  data-testid="reveal-vote-btn"
                >
                  Reveal Vote
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reveal section — visible if user has committed but staking phase ended or ongoing */}
      {!isStakingPhase && hasPendingCommit && (
        <Card
          className="border-amber-500/30 bg-amber-500/5"
          data-testid="reveal-section"
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  You have an unrevealed vote
                </p>
                <p className="text-xs text-muted-foreground">
                  Reveal your vote to finalize your stake contribution.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRevealDialogOpen(true)}
                  data-testid="reveal-vote-btn-outer"
                >
                  Reveal Vote
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vote commit dialog */}
      <Dialog open={voteDialogOpen} onOpenChange={setVoteDialogOpen}>
        <DialogContent data-testid="vote-dialog">
          <DialogHeader>
            <DialogTitle>
              {pendingVoteTrue ? "Vote Credible" : "Vote Not Credible"}
            </DialogTitle>
            <DialogDescription>
              Commit a stake to vote on this article. Your vote is encrypted
              using commit-reveal — you&apos;ll need to reveal it before the
              staking period ends.
            </DialogDescription>
          </DialogHeader>

          {!savedSalt ? (
            <div className="space-y-4 py-1">
              <div className="rounded-md bg-muted/50 border border-border/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <Key className="h-3 w-3" />
                  Commit-Reveal Voting
                </p>
                <p>
                  Your vote is encrypted with a random salt. After committing,{" "}
                  <strong>save the salt</strong> — you will need it to reveal
                  your vote before the staking period closes.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stakeAmt">Stake Amount (CITE)</Label>
                <Input
                  id="stakeAmt"
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 100"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  data-testid="input-stake-amount"
                />
              </div>
              {voteError && (
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {voteError}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setVoteDialogOpen(false)}
                  disabled={voting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCommitVote}
                  disabled={voting || !stakeAmount}
                  data-testid="confirm-commit-btn"
                >
                  {voting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Committing…
                    </>
                  ) : (
                    "Commit Vote"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-primary flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Vote committed!
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Save this salt securely. You will need it to reveal your vote.
                </p>
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">
                    Your Salt (SAVE THIS)
                  </Label>
                  <div className="flex items-start gap-2 mt-1">
                    <code
                      className="flex-1 block text-xs font-mono bg-background border border-border/60 rounded p-2 break-all"
                      data-testid="vote-salt-display"
                    >
                      {savedSalt}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0 mt-0.5"
                      onClick={copySalt}
                      data-testid="copy-salt-btn"
                    >
                      {saltCopied ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => setVoteDialogOpen(false)}
                  data-testid="close-vote-dialog-btn"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reveal dialog */}
      <Dialog open={revealDialogOpen} onOpenChange={setRevealDialogOpen}>
        <DialogContent data-testid="reveal-dialog">
          <DialogHeader>
            <DialogTitle>Reveal Your Vote</DialogTitle>
            <DialogDescription>
              Enter your salt to reveal the vote you committed. Make sure your
              vote direction matches what you originally chose.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="revealSaltInput">Salt</Label>
              <Input
                id="revealSaltInput"
                placeholder="0x…"
                value={revealSalt}
                onChange={(e) => setRevealSalt(e.target.value)}
                className="font-mono text-xs"
                data-testid="input-reveal-salt"
              />
              {savedSalt && (
                <p className="text-xs text-muted-foreground">
                  Pre-filled from your session.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Vote Direction</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={revealVoteTrue ? "default" : "outline"}
                  onClick={() => setRevealVoteTrue(true)}
                  data-testid="reveal-vote-true-btn"
                >
                  <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                  Credible
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!revealVoteTrue ? "default" : "outline"}
                  onClick={() => setRevealVoteTrue(false)}
                  data-testid="reveal-vote-false-btn"
                >
                  <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                  Not Credible
                </Button>
              </div>
            </div>
            {revealError && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5" />
                {revealError}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRevealDialogOpen(false)}
                disabled={revealing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRevealVote}
                disabled={revealing || !revealSalt}
                data-testid="confirm-reveal-btn"
              >
                {revealing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Revealing…
                  </>
                ) : (
                  "Reveal Vote"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
