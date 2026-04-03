import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useEpochActions } from "@/lib/contracts/hooks";
import { useWallet } from "@/lib/contracts/wallet";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toUnix(dtLocal: string): number {
  if (!dtLocal) return 0;
  return Math.floor(new Date(dtLocal).getTime() / 1000);
}

function nowDatetimeLocal(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.toISOString().slice(0, 16);
}

// ── Validation ────────────────────────────────────────────────────────────────

interface FormState {
  bucketId: string;
  submissionStart: string;
  submissionEnd: string;
  stakingStart: string;
  stakingEnd: string;
}

interface ValidationErrors {
  bucketId?: string;
  submissionStart?: string;
  submissionEnd?: string;
  stakingStart?: string;
  stakingEnd?: string;
}

function validate(form: FormState): ValidationErrors {
  const errors: ValidationErrors = {};
  const now = Math.floor(Date.now() / 1000);

  if (!form.bucketId || parseInt(form.bucketId, 10) <= 0) {
    errors.bucketId = "Bucket ID must be a positive number.";
  }

  const ss = toUnix(form.submissionStart);
  const se = toUnix(form.submissionEnd);
  const ks = toUnix(form.stakingStart);
  const ke = toUnix(form.stakingEnd);

  if (!form.submissionStart) {
    errors.submissionStart = "Required.";
  } else if (ss < now) {
    errors.submissionStart = "Submission start must be in the future.";
  }

  if (!form.submissionEnd) {
    errors.submissionEnd = "Required.";
  } else if (se <= ss) {
    errors.submissionEnd = "Must be after submission start.";
  }

  if (!form.stakingStart) {
    errors.stakingStart = "Required.";
  } else if (ks < se) {
    errors.stakingStart = "Staking start must be on or after submission end.";
  }

  if (!form.stakingEnd) {
    errors.stakingEnd = "Required.";
  } else if (ke <= ks) {
    errors.stakingEnd = "Must be after staking start.";
  }

  return errors;
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({
  id,
  label,
  children,
  error,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1" data-testid={`${id}-error`}>
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Create Epoch page ─────────────────────────────────────────────────────────

export default function CreateEpoch() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { address } = useWallet();
  const { createEpoch } = useEpochActions();

  // Pre-fill bucket from query param
  const params = new URLSearchParams(search);
  const prefilledBucket = params.get("bucket") ?? "";

  const [form, setForm] = useState<FormState>({
    bucketId: prefilledBucket,
    submissionStart: "",
    submissionEnd: "",
    stakingStart: "",
    stakingEnd: "",
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [step, setStep] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear individual field error on change
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setStep("pending");
    setErrorMsg("");

    try {
      const bucketId = parseInt(form.bucketId, 10);
      const ss = toUnix(form.submissionStart);
      const se = toUnix(form.submissionEnd);
      const ks = toUnix(form.stakingStart);
      const ke = toUnix(form.stakingEnd);

      const newEpochId = await createEpoch(bucketId, ss, se, ks, ke);

      setStep("done");
      setTimeout(() => {
        navigate(`/epochs/${newEpochId || 1}`);
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrorMsg(msg);
      setStep("error");
    }
  };

  const isSubmitting = step === "pending";
  const isDone = step === "done";

  // ── Wallet not connected ──────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="max-w-2xl mx-auto" data-testid="create-epoch-page">
        <div className="flex flex-col items-center py-20 text-center gap-3">
          <p className="text-sm font-medium">Connect your wallet to create an epoch</p>
          <p className="text-sm text-muted-foreground">
            You need a connected wallet to publish on-chain.
          </p>
        </div>
      </div>
    );
  }

  // ── Back link target ──────────────────────────────────────────────────────

  const backHref = prefilledBucket ? `/buckets/${prefilledBucket}` : "/";

  // ── Main form ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="create-epoch-page">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1 h-8" data-testid="back-btn">
            <ArrowLeft size={14} />
            {prefilledBucket ? `Bucket #${prefilledBucket}` : "Feed"}
          </Button>
        </Link>
      </div>

      <Card data-testid="create-epoch-card">
        <CardHeader className="pb-4">
          <CardTitle className="font-serif text-xl font-normal" data-testid="create-epoch-title">
            Create Epoch
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Define the submission and staking time windows for a citation round.
          </p>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-5" data-testid="create-epoch-form">
            {/* Bucket ID */}
            <Field id="epoch-bucket-id" label="Bucket ID" error={errors.bucketId}>
              <Input
                id="epoch-bucket-id"
                type="number"
                min="1"
                step="1"
                placeholder="1"
                value={form.bucketId}
                onChange={set("bucketId")}
                disabled={isSubmitting || isDone || !!prefilledBucket}
                data-testid="epoch-bucket-id-input"
              />
            </Field>

            <Separator />

            {/* Submission window */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Submission Window
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="submission-start" label="Submission Start" error={errors.submissionStart}>
                  <Input
                    id="submission-start"
                    type="datetime-local"
                    min={nowDatetimeLocal()}
                    value={form.submissionStart}
                    onChange={set("submissionStart")}
                    disabled={isSubmitting || isDone}
                    data-testid="submission-start-input"
                  />
                </Field>

                <Field id="submission-end" label="Submission End" error={errors.submissionEnd}>
                  <Input
                    id="submission-end"
                    type="datetime-local"
                    min={form.submissionStart || nowDatetimeLocal()}
                    value={form.submissionEnd}
                    onChange={set("submissionEnd")}
                    disabled={isSubmitting || isDone}
                    data-testid="submission-end-input"
                  />
                </Field>
              </div>
            </div>

            <Separator />

            {/* Staking window */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Staking Window
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="staking-start" label="Staking Start" error={errors.stakingStart}>
                  <Input
                    id="staking-start"
                    type="datetime-local"
                    min={form.submissionEnd || nowDatetimeLocal()}
                    value={form.stakingStart}
                    onChange={set("stakingStart")}
                    disabled={isSubmitting || isDone}
                    data-testid="staking-start-input"
                  />
                </Field>

                <Field id="staking-end" label="Staking End" error={errors.stakingEnd}>
                  <Input
                    id="staking-end"
                    type="datetime-local"
                    min={form.stakingStart || nowDatetimeLocal()}
                    value={form.stakingEnd}
                    onChange={set("stakingEnd")}
                    disabled={isSubmitting || isDone}
                    data-testid="staking-end-input"
                  />
                </Field>
              </div>
            </div>

            {/* Timeline hint */}
            <p className="text-xs text-muted-foreground">
              Order required: Submission Start → Submission End → Staking Start → Staking End
            </p>

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
                data-testid="epoch-tx-status"
              >
                {isDone && <CheckCircle2 size={15} />}
                <span>
                  {step === "error"
                    ? errorMsg
                    : isSubmitting
                    ? "Creating epoch on-chain…"
                    : "Epoch created! Redirecting…"}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-1">
              <Link href={backHref}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSubmitting}
                  data-testid="create-epoch-cancel"
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || isDone}
                data-testid="create-epoch-submit"
              >
                {isSubmitting ? "Creating…" : isDone ? "Created!" : "Create Epoch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
