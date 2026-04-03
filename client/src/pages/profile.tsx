import { useState, useEffect, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Copy,
  Check,
  Wallet,
  FileText,
  Shield,
  PenLine,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  useTokenActions,
  useArticleActions,
  useStakingActions,
} from "@/lib/contracts/hooks";
import { useWallet, shortenAddress } from "@/lib/contracts/wallet";
import { ADDRESSES } from "@/lib/contracts/addresses";
import type { Article, VoteCommit } from "@/lib/contracts/types";

const CONTRACT_NAMES: Record<string, string> = {
  [ADDRESSES.articles]: "Article Registry",
  [ADDRESSES.staking]: "Staking",
  [ADDRESSES.buckets]: "Bucket Manager",
  [ADDRESSES.rewards]: "Rewards",
};

interface AllowanceState {
  value: string | null;
  loading: boolean;
  error: string | null;
}

interface ApproveState {
  amount: string;
  loading: boolean;
  error: string | null;
  success: boolean;
}

export default function ProfilePage() {
  const { address } = useWallet();
  const { getBalance, getAllowance, approve } = useTokenActions();
  const { getArticle } = useArticleActions();
  const { getCommit } = useStakingActions();

  // Balance
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  // Articles lookup
  const [articleRangeFrom, setArticleRangeFrom] = useState("1");
  const [articleRangeTo, setArticleRangeTo] = useState("10");
  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState<string | null>(null);

  // Stake lookup
  const [stakeEpochId, setStakeEpochId] = useState("");
  const [stakeArticleId, setStakeArticleId] = useState("");
  const [stakeCommit, setStakeCommit] = useState<VoteCommit | null>(null);
  const [stakeLoading, setStakeLoading] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [stakeChecked, setStakeChecked] = useState(false);

  // Allowances
  const spenderAddresses = Object.keys(CONTRACT_NAMES).filter(Boolean);
  const [allowances, setAllowances] = useState<
    Record<string, AllowanceState>
  >(() =>
    Object.fromEntries(
      spenderAddresses.map((addr) => [
        addr,
        { value: null, loading: false, error: null },
      ])
    )
  );
  const [approveStates, setApproveStates] = useState<
    Record<string, ApproveState>
  >(() =>
    Object.fromEntries(
      spenderAddresses.map((addr) => [
        addr,
        { amount: "", loading: false, error: null, success: false },
      ])
    )
  );

  // Load balance
  const loadBalance = useCallback(async () => {
    if (!address) return;
    setBalanceLoading(true);
    try {
      const bal = await getBalance();
      setBalance(bal);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [address, getBalance]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    });
  }

  // Load allowances for a spender
  async function loadAllowance(spender: string) {
    if (!address) return;
    setAllowances((prev) => ({
      ...prev,
      [spender]: { ...prev[spender], loading: true, error: null },
    }));
    try {
      const val = await getAllowance(spender);
      setAllowances((prev) => ({
        ...prev,
        [spender]: { value: val, loading: false, error: null },
      }));
    } catch (err: any) {
      setAllowances((prev) => ({
        ...prev,
        [spender]: {
          value: null,
          loading: false,
          error: err?.message ?? "Failed",
        },
      }));
    }
  }

  async function loadAllAllowances() {
    for (const spender of spenderAddresses) {
      await loadAllowance(spender);
    }
  }

  useEffect(() => {
    if (address) {
      loadAllAllowances();
    }
  }, [address]);

  async function handleApprove(spender: string) {
    const amt = approveStates[spender]?.amount;
    if (!amt) return;
    setApproveStates((prev) => ({
      ...prev,
      [spender]: { ...prev[spender], loading: true, error: null, success: false },
    }));
    try {
      await approve(spender, amt);
      setApproveStates((prev) => ({
        ...prev,
        [spender]: { ...prev[spender], loading: false, success: true },
      }));
      await loadAllowance(spender);
    } catch (err: any) {
      setApproveStates((prev) => ({
        ...prev,
        [spender]: {
          ...prev[spender],
          loading: false,
          error: err?.message ?? "Approval failed",
        },
      }));
    }
  }

  // Articles lookup
  async function handleFetchArticles() {
    if (!address) return;
    setArticlesLoading(true);
    setArticlesError(null);
    setArticles([]);
    try {
      const from = Number(articleRangeFrom);
      const to = Number(articleRangeTo);
      const results: Article[] = [];
      for (let i = from; i <= to; i++) {
        try {
          const art = await getArticle(i);
          if (
            art &&
            art.author.toLowerCase() === address.toLowerCase()
          ) {
            results.push(art);
          }
        } catch {
          // Skip inaccessible articles
        }
      }
      setArticles(results);
    } catch (err: any) {
      setArticlesError(err?.message ?? "Failed to fetch articles");
    } finally {
      setArticlesLoading(false);
    }
  }

  // Stake lookup
  async function handleCheckStake() {
    if (!address || !stakeEpochId || !stakeArticleId) return;
    setStakeLoading(true);
    setStakeError(null);
    setStakeCommit(null);
    setStakeChecked(false);
    try {
      const commit = await getCommit(
        Number(stakeEpochId),
        Number(stakeArticleId),
        address
      );
      setStakeCommit(commit);
      setStakeChecked(true);
    } catch (err: any) {
      setStakeError(err?.message ?? "Failed to check stake");
    } finally {
      setStakeLoading(false);
    }
  }

  if (!address) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4" data-testid="profile-not-connected">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <Wallet className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Connect your wallet to view your profile.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)]">
          My Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your wallet, articles, stakes, and token approvals.
        </p>
      </div>

      {/* Wallet card */}
      <Card data-testid="wallet-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Address</p>
              <p className="font-mono text-sm" data-testid="wallet-full-address">
                {address}
              </p>
              <p className="text-xs text-muted-foreground font-mono" data-testid="wallet-short-address">
                {shortenAddress(address)}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={copyAddress}
              data-testid="copy-address-btn"
            >
              {addressCopied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">
                CITE Balance
              </p>
              <p className="font-mono text-sm" data-testid="cite-balance">
                {balanceLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                ) : balance !== null ? (
                  `${parseFloat(balance).toFixed(4)} CITE`
                ) : (
                  "—"
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={loadBalance}
              disabled={balanceLoading}
              data-testid="refresh-balance-btn"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="articles" data-testid="profile-tabs">
        <TabsList className="w-full">
          <TabsTrigger value="articles" className="flex-1" data-testid="articles-tab">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            My Articles
          </TabsTrigger>
          <TabsTrigger value="stakes" className="flex-1" data-testid="stakes-tab">
            <PenLine className="h-3.5 w-3.5 mr-1.5" />
            My Stakes
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex-1" data-testid="approvals-tab">
            <Shield className="h-3.5 w-3.5 mr-1.5" />
            Approvals
          </TabsTrigger>
        </TabsList>

        {/* Articles tab */}
        <TabsContent value="articles" className="space-y-4 mt-4">
          <Card data-testid="articles-lookup-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Article Lookup</CardTitle>
              <CardDescription>
                Scan a range of article IDs for articles authored by your
                wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="art-from">From ID</Label>
                  <Input
                    id="art-from"
                    type="number"
                    min={1}
                    value={articleRangeFrom}
                    onChange={(e) => setArticleRangeFrom(e.target.value)}
                    data-testid="input-article-from"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="art-to">To ID</Label>
                  <Input
                    id="art-to"
                    type="number"
                    min={1}
                    value={articleRangeTo}
                    onChange={(e) => setArticleRangeTo(e.target.value)}
                    data-testid="input-article-to"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={articlesLoading}
                  onClick={handleFetchArticles}
                  data-testid="fetch-articles-btn"
                >
                  {articlesLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Scan
                </Button>
              </div>

              {articlesError && (
                <p
                  className="text-sm text-destructive flex items-center gap-1.5"
                  data-testid="articles-error"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {articlesError}
                </p>
              )}

              {!articlesLoading && articles.length === 0 && articlesError === null && (
                <p className="text-sm text-muted-foreground" data-testid="no-articles-msg">
                  No articles found in this range for your address.
                </p>
              )}

              {articles.map((art) => (
                <div
                  key={art.id}
                  className="rounded-md border border-border/50 p-3 flex items-center justify-between gap-3"
                  data-testid={`profile-article-${art.id}`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{art.id}
                      </span>
                      {art.eligible && (
                        <Badge variant="default" className="text-[10px] h-4 px-1.5">
                          Eligible
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Epoch #{art.epochId} · Stake:{" "}
                      {parseFloat(formatEther(art.writerStake)).toFixed(2)} CITE
                    </div>
                  </div>
                  <Link href={`/articles/${art.id}`}>
                    <Button size="sm" variant="ghost" data-testid={`view-art-${art.id}`}>
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stakes tab */}
        <TabsContent value="stakes" className="space-y-4 mt-4">
          <Card data-testid="stakes-lookup-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Stake Lookup</CardTitle>
              <CardDescription>
                Check your commit details for a specific epoch and article.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="stake-epoch">Epoch ID</Label>
                  <Input
                    id="stake-epoch"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={stakeEpochId}
                    onChange={(e) => {
                      setStakeEpochId(e.target.value);
                      setStakeChecked(false);
                    }}
                    data-testid="input-stake-epoch"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stake-article">Article ID</Label>
                  <Input
                    id="stake-article"
                    type="number"
                    min={1}
                    placeholder="e.g. 1"
                    value={stakeArticleId}
                    onChange={(e) => {
                      setStakeArticleId(e.target.value);
                      setStakeChecked(false);
                    }}
                    data-testid="input-stake-article"
                  />
                </div>
              </div>

              <Button
                size="sm"
                disabled={stakeLoading || !stakeEpochId || !stakeArticleId}
                onClick={handleCheckStake}
                data-testid="check-stake-btn"
              >
                {stakeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                )}
                Check Stake
              </Button>

              {stakeError && (
                <p
                  className="text-sm text-destructive flex items-center gap-1.5"
                  data-testid="stake-error"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {stakeError}
                </p>
              )}

              {stakeChecked && !stakeCommit && (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="no-stake-found"
                >
                  No stake found for this epoch/article combination.
                </p>
              )}

              {stakeCommit && (
                <div
                  className="rounded-md border border-border/50 p-3 space-y-2 text-sm"
                  data-testid="stake-details"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Raw Stake</span>
                    <span className="font-mono">
                      {parseFloat(formatEther(stakeCommit.rawStake)).toFixed(2)}{" "}
                      CITE
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Effective Stake
                    </span>
                    <span className="font-mono">
                      {parseFloat(
                        formatEther(stakeCommit.effectiveStake)
                      ).toFixed(2)}{" "}
                      CITE
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Revealed</span>
                    <Badge
                      variant={stakeCommit.revealed ? "default" : "secondary"}
                      data-testid="stake-revealed-badge"
                    >
                      {stakeCommit.revealed ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {stakeCommit.revealed && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Voted</span>
                      <Badge
                        variant={stakeCommit.voteTrue ? "default" : "outline"}
                      >
                        {stakeCommit.voteTrue ? "Credible" : "Not Credible"}
                      </Badge>
                    </div>
                  )}
                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground">
                      Commit Hash
                    </p>
                    <p
                      className="font-mono text-xs break-all mt-0.5"
                      data-testid="stake-commit-hash"
                    >
                      {stakeCommit.commitHash}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals tab */}
        <TabsContent value="approvals" className="space-y-4 mt-4">
          <Card data-testid="approvals-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Approve CITE Spending</CardTitle>
              <CardDescription>
                Approve contracts to spend CITE tokens on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {spenderAddresses.map((spender) => {
                const name =
                  CONTRACT_NAMES[spender] ?? shortenAddress(spender);
                const allowanceState = allowances[spender];
                const approveState = approveStates[spender];
                return (
                  <div
                    key={spender}
                    className="rounded-md border border-border/50 p-3 space-y-3"
                    data-testid={`approval-row-${name.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {shortenAddress(spender)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Allowance
                        </p>
                        <p
                          className="font-mono text-sm"
                          data-testid={`allowance-${name.toLowerCase().replace(/\s/g, "-")}`}
                        >
                          {allowanceState?.loading ? (
                            <Loader2 className="h-3 w-3 animate-spin inline" />
                          ) : allowanceState?.value !== null ? (
                            `${parseFloat(allowanceState.value!).toFixed(2)} CITE`
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Amount (CITE)"
                        className="h-8 text-sm"
                        value={approveState?.amount ?? ""}
                        onChange={(e) =>
                          setApproveStates((prev) => ({
                            ...prev,
                            [spender]: {
                              ...prev[spender],
                              amount: e.target.value,
                              success: false,
                              error: null,
                            },
                          }))
                        }
                        data-testid={`approve-input-${name.toLowerCase().replace(/\s/g, "-")}`}
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        disabled={
                          approveState?.loading || !approveState?.amount
                        }
                        onClick={() => handleApprove(spender)}
                        data-testid={`approve-btn-${name.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {approveState?.loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : approveState?.success ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          "Approve"
                        )}
                      </Button>
                    </div>
                    {approveState?.error && (
                      <p className="text-xs text-destructive">
                        {approveState.error}
                      </p>
                    )}
                    {approveState?.success && (
                      <p className="text-xs text-primary flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Approved successfully
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
