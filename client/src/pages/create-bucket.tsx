import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, CheckCircle2, Wallet, AlertCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useBucketActions, uploadToPinata } from "@/lib/contracts/hooks";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import type { TopicMetadata } from "@/lib/contracts/types";
import { MOCK_TOPICS } from "@/lib/mockContent";
import { addTopicStake, getTopicStake } from "@/lib/mockStakes";

// ── Status steps ──────────────────────────────────────────────────────────────

type TxStep = "idle" | "uploading" | "creating" | "funding" | "done" | "error";

const STEP_LABELS: Record<TxStep, string> = {
  idle: "",
  uploading: "Uploading to IPFS…",
  creating: "Creating bucket on-chain…",
  funding: "Funding bucket…",
  done: "Done!",
  error: "Error",
};

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  description: string;
  evidenceGuidelines: string;
  mediaRequirements: string;
  timeScope: string;
  tags: string;
  initialFunding: string;
}

const INITIAL_FORM: FormState = {
  title: "",
  description: "",
  evidenceGuidelines: "",
  mediaRequirements: "",
  timeScope: "",
  tags: "",
  initialFunding: "",
};

// ── Create Bucket page ────────────────────────────────────────────────────────

export default function CreateBucket() {
  const [, navigate] = useLocation();
  const { address, connect, isConnecting, error: walletError } = useWallet();
  const { createBucket, fundBucket, getNextBucketId } = useBucketActions();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [step, setStep] = useState<TxStep>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [mockStakes, setMockStakes] = useState<Record<string, number>>(() => {
    const next: Record<string, number> = {};
    for (const topic of MOCK_TOPICS) {
      next[topic.id] = getTopicStake(topic.id);
    }
    return next;
  });
  const [mockStakeInputs, setMockStakeInputs] = useState<Record<string, string>>({});

  const handleMockStake = (topicId: string, amountText: string) => {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const nextStake = addTopicStake(topicId, amount);
    setMockStakes((prev) => ({ ...prev, [topicId]: nextStake }));
    setMockStakeInputs((prev) => ({ ...prev, [topicId]: "" }));
  };

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;

    setStep("uploading");
    setErrorMsg("");

    try {
      // 1. Build metadata
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const metadata: TopicMetadata = {
        title: form.title.trim(),
        description: form.description.trim(),
        ...(form.evidenceGuidelines.trim() && { evidenceGuidelines: form.evidenceGuidelines.trim() }),
        ...(form.mediaRequirements.trim() && { mediaRequirements: form.mediaRequirements.trim() }),
        ...(form.timeScope.trim() && { timeScope: form.timeScope.trim() }),
        ...(tags.length > 0 && { tags }),
      };

      // 2. Upload to Pinata
      const cid = await uploadToPinata(metadata, `topic-${form.title.trim().toLowerCase().replace(/\s+/g, "-")}`);

      // 3. Create bucket on-chain
      setStep("creating");
      const newBucketId = await createBucket(cid);

      // 4. Fund if amount provided
      if (form.initialFunding && parseFloat(form.initialFunding) > 0) {
        setStep("funding");
        const idToFund = newBucketId || (await getNextBucketId()) - 1;
        await fundBucket(idToFund, form.initialFunding);
      }

      // 5. Done
      setStep("done");
      setTimeout(() => {
        const targetId = newBucketId || 1;
        navigate(`/buckets/${targetId}`);
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg);
      setStep("error");
    }
  };

  const isSubmitting = ["uploading", "creating", "funding"].includes(step);
  const isDone = step === "done";
  const canSubmit = !!address && !isSubmitting && !isDone && !!form.title.trim() && !!form.description.trim();

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="create-bucket-page">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 h-8" data-testid="back-to-feed-btn">
            <ArrowLeft size={14} />
            Feed
          </Button>
        </Link>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                Create a citation bounty bucket
              </p>
              <p className="text-xs text-muted-foreground">
                Wallet status is checked first so you can publish smoothly.
              </p>
              {address ? (
                <p className="text-xs text-primary">
                  Connected: <span className="font-mono">{shortenAddress(address)}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Connect wallet to enable on-chain creation and funding.
                </p>
              )}
              {walletError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  {walletError}
                </p>
              )}
            </div>
            {!address && (
              <Button
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => connect()}
                disabled={isConnecting}
                data-testid="connect-wallet-create-bucket"
              >
                <Wallet size={14} />
                {isConnecting ? "Connecting…" : "Connect Wallet"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="create-bucket-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-xl font-normal" data-testid="create-bucket-title">
            Create New Topic
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Define a citation bounty topic. Metadata is stored on IPFS, the bucket lives on-chain.
          </p>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-5" data-testid="create-bucket-form">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bucket-title"
                placeholder="e.g. Climate change attribution studies 2020–2024"
                value={form.title}
                onChange={set("title")}
                required
                disabled={isSubmitting || isDone}
                data-testid="bucket-title-input"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="bucket-description"
                placeholder="What kind of evidence or citations are you looking for?"
                value={form.description}
                onChange={set("description")}
                required
                rows={4}
                disabled={isSubmitting || isDone}
                data-testid="bucket-description-input"
              />
            </div>

            {/* Evidence Guidelines */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-evidence">Evidence Guidelines</Label>
              <Textarea
                id="bucket-evidence"
                placeholder="Describe accepted evidence types, standards, sources…"
                value={form.evidenceGuidelines}
                onChange={set("evidenceGuidelines")}
                rows={3}
                disabled={isSubmitting || isDone}
                data-testid="bucket-evidence-input"
              />
            </div>

            {/* Media Requirements */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-media">Media Requirements</Label>
              <Textarea
                id="bucket-media"
                placeholder="e.g. Must include primary source links, peer-reviewed journals preferred…"
                value={form.mediaRequirements}
                onChange={set("mediaRequirements")}
                rows={2}
                disabled={isSubmitting || isDone}
                data-testid="bucket-media-input"
              />
            </div>

            {/* Time Scope */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-timescope">Time Scope</Label>
              <Input
                id="bucket-timescope"
                placeholder="e.g. 2020–2024, last 5 years, any…"
                value={form.timeScope}
                onChange={set("timeScope")}
                disabled={isSubmitting || isDone}
                data-testid="bucket-timescope-input"
              />
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-tags">Tags</Label>
              <Input
                id="bucket-tags"
                placeholder="climate, science, policy (comma-separated)"
                value={form.tags}
                onChange={set("tags")}
                disabled={isSubmitting || isDone}
                data-testid="bucket-tags-input"
              />
              <p className="text-xs text-muted-foreground">Separate tags with commas.</p>
            </div>

            <Separator />

            {/* Initial Funding */}
            <div className="space-y-1.5">
              <Label htmlFor="bucket-funding">Initial Funding (CITE)</Label>
              <Input
                id="bucket-funding"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00 — optional"
                value={form.initialFunding}
                onChange={set("initialFunding")}
                disabled={isSubmitting || isDone}
                data-testid="bucket-funding-input"
              />
              <p className="text-xs text-muted-foreground">
                Optionally fund the reward pool at creation time. Requires CITE token approval.
              </p>
            </div>

            {!address && (
              <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2">
                <AlertCircle size={13} />
                Connect your wallet first. Form is visible for planning, but submission is disabled.
              </div>
            )}

            {/* Status display */}
            {(isSubmitting || isDone || step === "error") && (
              <div
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm ${
                  step === "error"
                    ? "bg-destructive/10 border border-destructive/20 text-destructive"
                    : isDone
                    ? "bg-chart-4/10 border border-chart-4/20 text-chart-4"
                    : "bg-primary/10 border border-primary/20 text-primary"
                }`}
                data-testid="tx-status"
              >
                {isDone ? (
                  <CheckCircle2 size={15} />
                ) : step !== "error" ? (
                  <Upload size={15} className="animate-pulse" />
                ) : null}
                <span>
                  {step === "error" ? errorMsg : STEP_LABELS[step]}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Link href="/">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSubmitting}
                  data-testid="create-bucket-cancel"
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit}
                data-testid="create-bucket-submit"
              >
                {isSubmitting ? "Processing…" : isDone ? "Created!" : "Create Bucket"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg font-normal">Quick Start Topics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Explore pre-populated demo topics. Clicking a topic opens six mock articles.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MOCK_TOPICS.map((topic) => (
              <Link key={topic.id} href={`/topics/${topic.id}`}>
                <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                  <div className="aspect-[16/8] w-full overflow-hidden rounded-t-lg border-b border-border">
                    <img
                      src={topic.imageUrl}
                      alt={topic.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <CardContent className="py-3 space-y-2">
                    <p className="text-sm font-medium leading-snug">{topic.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{topic.description}</p>
                    <p className="text-xs text-primary font-medium">
                      {(mockStakes[topic.id] ?? 0).toLocaleString()} CITE staked
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Amount"
                        className="h-8"
                        value={mockStakeInputs[topic.id] ?? ""}
                        onChange={(e) =>
                          setMockStakeInputs((prev) => ({ ...prev, [topic.id]: e.target.value }))
                        }
                        onClick={(e) => e.preventDefault()}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          handleMockStake(topic.id, mockStakeInputs[topic.id] ?? "");
                        }}
                      >
                        Stake
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
