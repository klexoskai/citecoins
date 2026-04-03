import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trophy,
  PenLine,
  Eye,
  Search,
  Info,
} from "lucide-react";
import { useRewardsActions } from "@/lib/contracts/hooks";
import { useWallet } from "@/lib/contracts/wallet";

type ClaimStatus = "idle" | "checking" | "claiming" | "claimed" | "error";

interface WriterClaimState {
  epochId: string;
  articleId: string;
  status: ClaimStatus;
  alreadyClaimed: boolean | null;
  error: string | null;
}

interface ReaderClaimState {
  epochId: string;
  status: ClaimStatus;
  alreadyClaimed: boolean | null;
  error: string | null;
}

function initialWriterState(): WriterClaimState {
  return {
    epochId: "",
    articleId: "",
    status: "idle",
    alreadyClaimed: null,
    error: null,
  };
}

function initialReaderState(): ReaderClaimState {
  return {
    epochId: "",
    status: "idle",
    alreadyClaimed: null,
    error: null,
  };
}

export default function ClaimPage() {
  const { address } = useWallet();
  const { claimWriter, claimReader, isWriterClaimed, isReaderClaimed } =
    useRewardsActions();

  const [writerState, setWriterState] = useState<WriterClaimState>(
    initialWriterState()
  );
  const [readerState, setReaderState] = useState<ReaderClaimState>(
    initialReaderState()
  );

  // Writer flow
  async function handleCheckWriter() {
    if (!writerState.epochId || !writerState.articleId) return;
    setWriterState((s) => ({ ...s, status: "checking", error: null, alreadyClaimed: null }));
    try {
      const claimed = await isWriterClaimed(
        Number(writerState.epochId),
        Number(writerState.articleId)
      );
      setWriterState((s) => ({ ...s, status: "idle", alreadyClaimed: claimed }));
    } catch (err: any) {
      setWriterState((s) => ({
        ...s,
        status: "error",
        error: err?.message ?? "Check failed",
      }));
    }
  }

  async function handleClaimWriter() {
    if (!writerState.epochId || !writerState.articleId) return;
    setWriterState((s) => ({ ...s, status: "claiming", error: null }));
    try {
      await claimWriter(
        Number(writerState.epochId),
        Number(writerState.articleId)
      );
      setWriterState((s) => ({ ...s, status: "claimed", alreadyClaimed: true }));
    } catch (err: any) {
      setWriterState((s) => ({
        ...s,
        status: "error",
        error: err?.message ?? "Claim failed",
      }));
    }
  }

  // Reader flow
  async function handleCheckReader() {
    if (!readerState.epochId || !address) return;
    setReaderState((s) => ({ ...s, status: "checking", error: null, alreadyClaimed: null }));
    try {
      const claimed = await isReaderClaimed(Number(readerState.epochId), address);
      setReaderState((s) => ({ ...s, status: "idle", alreadyClaimed: claimed }));
    } catch (err: any) {
      setReaderState((s) => ({
        ...s,
        status: "error",
        error: err?.message ?? "Check failed",
      }));
    }
  }

  async function handleClaimReader() {
    if (!readerState.epochId) return;
    setReaderState((s) => ({ ...s, status: "claiming", error: null }));
    try {
      await claimReader(Number(readerState.epochId));
      setReaderState((s) => ({ ...s, status: "claimed", alreadyClaimed: true }));
    } catch (err: any) {
      setReaderState((s) => ({
        ...s,
        status: "error",
        error: err?.message ?? "Claim failed",
      }));
    }
  }

  const writerChecking = writerState.status === "checking";
  const writerClaiming = writerState.status === "claiming";
  const writerLoading = writerChecking || writerClaiming;
  const readerChecking = readerState.status === "checking";
  const readerClaiming = readerState.status === "claiming";
  const readerLoading = readerChecking || readerClaiming;

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)]">
          Claim Rewards
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Claim your CITE rewards from finalized epochs.
        </p>
      </div>

      {!address && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="wallet-warning">
          <CardContent className="pt-4 pb-4 flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm">Connect your wallet to claim rewards.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="writer" data-testid="claim-tabs">
        <TabsList className="w-full">
          <TabsTrigger value="writer" className="flex-1" data-testid="writer-tab">
            <PenLine className="h-3.5 w-3.5 mr-1.5" />
            Writer Rewards
          </TabsTrigger>
          <TabsTrigger value="reader" className="flex-1" data-testid="reader-tab">
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Reader Rewards
          </TabsTrigger>
        </TabsList>

        {/* Writer tab */}
        <TabsContent value="writer" className="space-y-4 mt-4">
          <Card data-testid="writer-claim-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Claim Writer Reward
              </CardTitle>
              <CardDescription>
                Enter the epoch and article ID for an article you authored in a
                finalized epoch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="writer-epoch-id">Epoch ID</Label>
                  <Input
                    id="writer-epoch-id"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={writerState.epochId}
                    onChange={(e) =>
                      setWriterState((s) => ({
                        ...s,
                        epochId: e.target.value,
                        alreadyClaimed: null,
                        status: "idle",
                        error: null,
                      }))
                    }
                    data-testid="input-writer-epoch-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="writer-article-id">Article ID</Label>
                  <Input
                    id="writer-article-id"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={writerState.articleId}
                    onChange={(e) =>
                      setWriterState((s) => ({
                        ...s,
                        articleId: e.target.value,
                        alreadyClaimed: null,
                        status: "idle",
                        error: null,
                      }))
                    }
                    data-testid="input-writer-article-id"
                  />
                </div>
              </div>

              {/* Status */}
              {writerState.alreadyClaimed === true &&
                writerState.status !== "claimed" && (
                  <div
                    className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border border-border/50 p-3"
                    data-testid="writer-already-claimed"
                  >
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    This reward has already been claimed.
                  </div>
                )}

              {writerState.alreadyClaimed === false && (
                <div
                  className="flex items-center gap-2 text-sm rounded-md border border-primary/30 bg-primary/5 p-3"
                  data-testid="writer-unclaimed"
                >
                  <Trophy className="h-4 w-4 text-primary shrink-0" />
                  Reward available — not yet claimed.
                </div>
              )}

              {writerState.status === "claimed" && (
                <div
                  className="flex items-center gap-2 text-sm text-primary rounded-md border border-primary/40 bg-primary/5 p-3"
                  data-testid="writer-claim-success"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Reward claimed successfully!
                </div>
              )}

              {writerState.status === "error" && writerState.error && (
                <div
                  className="flex items-start gap-2 text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 p-3"
                  data-testid="writer-error"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{writerState.error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    writerLoading ||
                    !writerState.epochId ||
                    !writerState.articleId
                  }
                  onClick={handleCheckWriter}
                  data-testid="check-writer-claim-btn"
                >
                  {writerChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Check Status
                </Button>

                <Button
                  size="sm"
                  disabled={
                    writerLoading ||
                    !writerState.epochId ||
                    !writerState.articleId ||
                    writerState.alreadyClaimed === true ||
                    writerState.status === "claimed" ||
                    !address
                  }
                  onClick={handleClaimWriter}
                  data-testid="claim-writer-btn"
                >
                  {writerClaiming ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Claiming…
                    </>
                  ) : (
                    <>
                      <Trophy className="h-3.5 w-3.5 mr-1.5" />
                      Claim Reward
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-muted/20" data-testid="writer-info-card">
            <CardContent className="pt-4 pb-4 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Writer rewards are distributed to eligible article authors based
                on rank after the epoch is finalized. Only one claim per article
                per epoch.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reader tab */}
        <TabsContent value="reader" className="space-y-4 mt-4">
          <Card data-testid="reader-claim-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Claim Reader Reward
              </CardTitle>
              <CardDescription>
                Enter the epoch ID where you staked during the staking phase to
                claim your reader reward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reader-epoch-id">Epoch ID</Label>
                <Input
                  id="reader-epoch-id"
                  type="number"
                  min={1}
                  placeholder="e.g. 1"
                  value={readerState.epochId}
                  onChange={(e) =>
                    setReaderState((s) => ({
                      ...s,
                      epochId: e.target.value,
                      alreadyClaimed: null,
                      status: "idle",
                      error: null,
                    }))
                  }
                  data-testid="input-reader-epoch-id"
                />
              </div>

              {/* Status */}
              {readerState.alreadyClaimed === true &&
                readerState.status !== "claimed" && (
                  <div
                    className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border border-border/50 p-3"
                    data-testid="reader-already-claimed"
                  >
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    This reward has already been claimed.
                  </div>
                )}

              {readerState.alreadyClaimed === false && (
                <div
                  className="flex items-center gap-2 text-sm rounded-md border border-primary/30 bg-primary/5 p-3"
                  data-testid="reader-unclaimed"
                >
                  <Trophy className="h-4 w-4 text-primary shrink-0" />
                  Reward available — not yet claimed.
                </div>
              )}

              {readerState.status === "claimed" && (
                <div
                  className="flex items-center gap-2 text-sm text-primary rounded-md border border-primary/40 bg-primary/5 p-3"
                  data-testid="reader-claim-success"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Reward claimed successfully!
                </div>
              )}

              {readerState.status === "error" && readerState.error && (
                <div
                  className="flex items-start gap-2 text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 p-3"
                  data-testid="reader-error"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{readerState.error}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={readerLoading || !readerState.epochId || !address}
                  onClick={handleCheckReader}
                  data-testid="check-reader-claim-btn"
                >
                  {readerChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Check Status
                </Button>

                <Button
                  size="sm"
                  disabled={
                    readerLoading ||
                    !readerState.epochId ||
                    readerState.alreadyClaimed === true ||
                    readerState.status === "claimed" ||
                    !address
                  }
                  onClick={handleClaimReader}
                  data-testid="claim-reader-btn"
                >
                  {readerClaiming ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Claiming…
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Claim Reward
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-muted/20" data-testid="reader-info-card">
            <CardContent className="pt-4 pb-4 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Reader rewards go to stakers who voted with the majority after
                the epoch is finalized. You must have committed and revealed
                your vote to be eligible.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
