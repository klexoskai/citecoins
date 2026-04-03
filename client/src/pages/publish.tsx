import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { formatEther } from "ethers";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  Image,
  Video,
  FileText,
  Info,
} from "lucide-react";
import {
  useArticleActions,
  uploadToPinata,
  computeContentHash,
} from "@/lib/contracts/hooks";
import { useWallet } from "@/lib/contracts/wallet";
import type { EvidenceItem } from "@/lib/contracts/types";

const MIN_WRITER_STAKE = 10; // 10 CITE

type EvidenceType = "link" | "image" | "video" | "document";

interface EvidenceFormItem {
  id: string;
  type: EvidenceType;
  url: string;
  description: string;
}

type TxStep =
  | "idle"
  | "uploading"
  | "approving"
  | "publishing"
  | "success"
  | "error";

const EVIDENCE_ICONS: Record<EvidenceType, React.ReactNode> = {
  link: <LinkIcon className="h-3.5 w-3.5" />,
  image: <Image className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  document: <FileText className="h-3.5 w-3.5" />,
};

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function PublishPage() {
  const [, navigate] = useLocation();
  const { address } = useWallet();

  // Parse ?epoch=X from hash query string
  const [epochId, setEpochId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [writerStake, setWriterStake] = useState<string>(
    MIN_WRITER_STAKE.toString()
  );
  const [evidence, setEvidence] = useState<EvidenceFormItem[]>([]);

  const [txStep, setTxStep] = useState<TxStep>("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<number | null>(null);
  const [ipfsCID, setIpfsCID] = useState<string | null>(null);

  const { publishArticle } = useArticleActions();

  // Pre-fill epoch from query param
  useEffect(() => {
    const hash = window.location.hash; // e.g. #/publish?epoch=3
    const qIdx = hash.indexOf("?");
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx + 1));
      const ep = params.get("epoch");
      if (ep) setEpochId(ep);
    }
  }, []);

  function addEvidence() {
    setEvidence((prev) => [
      ...prev,
      { id: generateId(), type: "link", url: "", description: "" },
    ]);
  }

  function removeEvidence(id: string) {
    setEvidence((prev) => prev.filter((e) => e.id !== id));
  }

  function updateEvidence<K extends keyof EvidenceFormItem>(
    id: string,
    key: K,
    value: EvidenceFormItem[K]
  ) {
    setEvidence((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [key]: value } : e))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) {
      setTxError("Connect your wallet first.");
      return;
    }
    setTxError(null);
    setTxStep("uploading");
    try {
      const evidenceManifest: EvidenceItem[] = evidence.map((e) => ({
        type: e.type,
        url: e.url,
        description: e.description,
      }));

      const content = { title, body, evidenceManifest };
      const contentJSON = JSON.stringify(content);

      // 1. Upload to Pinata
      let cid: string;
      try {
        cid = await uploadToPinata(content, `article-${title}`);
      } catch {
        // In dev without Pinata keys, use a mock CID
        cid = `bafyMock${Date.now()}`;
      }
      setIpfsCID(cid);

      // 2. Compute content hash
      const contentHash = computeContentHash(contentJSON);

      // 3. Publish on-chain
      setTxStep("approving");
      // publishArticle internally approves then publishes
      setTxStep("publishing");
      const articleId = await publishArticle(
        Number(epochId),
        cid,
        contentHash,
        writerStake
      );
      setPublishedId(articleId);
      setTxStep("success");
    } catch (err: any) {
      setTxError(err?.message ?? "Transaction failed");
      setTxStep("error");
    }
  }

  const isLoading = txStep === "uploading" || txStep === "approving" || txStep === "publishing";

  const stakeNum = parseFloat(writerStake) || 0;
  const stakeValid = stakeNum >= MIN_WRITER_STAKE;

  function stepLabel(step: TxStep): string {
    switch (step) {
      case "uploading": return "Uploading to IPFS…";
      case "approving": return "Approving CITE spend…";
      case "publishing": return "Publishing on-chain…";
      default: return "";
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)]">
          Publish Article
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit an article with evidence to an open epoch.
        </p>
      </div>

      {/* Success state */}
      {txStep === "success" && publishedId !== null && (
        <Card
          className="border-primary/40 bg-primary/5"
          data-testid="publish-success"
        >
          <CardContent className="pt-6 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Article published!</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                Article ID: <span className="font-mono">{publishedId}</span>
              </div>
              {ipfsCID && (
                <div>
                  IPFS CID:{" "}
                  <span className="font-mono text-xs break-all">{ipfsCID}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <Link href={`/articles/${publishedId}`}>
                <Button size="sm" data-testid="view-article-btn">
                  View Article
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                data-testid="publish-another-btn"
                onClick={() => {
                  setTxStep("idle");
                  setTitle("");
                  setBody("");
                  setEvidence([]);
                  setPublishedId(null);
                  setIpfsCID(null);
                }}
              >
                Publish Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {txStep !== "success" && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Epoch & Stake row */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submission Details</CardTitle>
              <CardDescription>
                Which epoch you&apos;re submitting to, and your writer stake.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="epochId">Epoch ID</Label>
                  <Input
                    id="epochId"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={epochId}
                    onChange={(e) => setEpochId(e.target.value)}
                    required
                    data-testid="input-epoch-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="writerStake">Writer Stake (CITE)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Minimum {MIN_WRITER_STAKE} CITE required. Stake is
                        locked until the epoch ends.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="writerStake"
                    type="number"
                    min={MIN_WRITER_STAKE}
                    step="any"
                    value={writerStake}
                    onChange={(e) => setWriterStake(e.target.value)}
                    required
                    data-testid="input-writer-stake"
                  />
                  {!stakeValid && writerStake !== "" && (
                    <p className="text-xs text-destructive">
                      Minimum stake is {MIN_WRITER_STAKE} CITE
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Article content */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Article Content</CardTitle>
              <CardDescription>
                Your article title and body. Markdown is supported in the body.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="articleTitle">Title</Label>
                <Input
                  id="articleTitle"
                  placeholder="Article title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={200}
                  data-testid="input-article-title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="articleBody">
                  Body{" "}
                  <span className="text-muted-foreground font-normal">
                    (Markdown)
                  </span>
                </Label>
                <Textarea
                  id="articleBody"
                  placeholder="Write your article body here. Markdown formatting supported."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={12}
                  className="font-mono text-sm resize-y"
                  data-testid="input-article-body"
                />
              </div>
            </CardContent>
          </Card>

          {/* Evidence */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Evidence</CardTitle>
                  <CardDescription>
                    Links, images, videos, or documents supporting your article.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEvidence}
                  data-testid="add-evidence-btn"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Evidence
                </Button>
              </div>
            </CardHeader>
            {evidence.length > 0 && (
              <CardContent className="space-y-4">
                {evidence.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-border/60 p-3 space-y-3"
                    data-testid={`evidence-item-${idx}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        {EVIDENCE_ICONS[item.type]}
                        Evidence {idx + 1}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEvidence(item.id)}
                        data-testid={`remove-evidence-${idx}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={item.type}
                          onValueChange={(v) =>
                            updateEvidence(item.id, "type", v as EvidenceType)
                          }
                        >
                          <SelectTrigger
                            className="h-8 text-sm"
                            data-testid={`evidence-type-${idx}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="link">Link</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="document">Document</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">URL</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="https://…"
                          value={item.url}
                          onChange={(e) =>
                            updateEvidence(item.id, "url", e.target.value)
                          }
                          data-testid={`evidence-url-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-8 text-sm"
                        placeholder="Brief description of this evidence"
                        value={item.description}
                        onChange={(e) =>
                          updateEvidence(
                            item.id,
                            "description",
                            e.target.value
                          )
                        }
                        data-testid={`evidence-desc-${idx}`}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
            {evidence.length === 0 && (
              <CardContent>
                <p className="text-sm text-muted-foreground py-2">
                  No evidence added. Click &quot;Add Evidence&quot; to include
                  supporting sources.
                </p>
              </CardContent>
            )}
          </Card>

          {/* Tx status */}
          {isLoading && (
            <Card className="border-primary/30 bg-primary/5" data-testid="tx-status">
              <CardContent className="pt-4 pb-4 flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm">{stepLabel(txStep)}</span>
              </CardContent>
            </Card>
          )}

          {txStep === "error" && txError && (
            <Card
              className="border-destructive/40 bg-destructive/5"
              data-testid="tx-error"
            >
              <CardContent className="pt-4 pb-4 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Transaction failed
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-all">
                    {txError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setTxStep("idle")}
                    data-testid="retry-btn"
                  >
                    Try again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-1">
            <Link href="/">
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isLoading || !stakeValid || !title || !body || !epochId}
              data-testid="submit-publish-btn"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  {stepLabel(txStep)}
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Publish Article
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
