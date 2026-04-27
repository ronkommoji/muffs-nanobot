import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Play, ToggleLeft, ToggleRight, X, Copy, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchMemory,
  fetchSystemPrompt,
  fetchCronJobs,
  fetchSessionMessages,
  toggleCronJob,
  runCronJob,
  type MemoryFiles,
  type CronJob,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type Tab = "memory" | "prompt" | "cron" | "errors";

interface DashboardPanelProps {
  open: boolean;
  onClose: () => void;
  token: string;
  /** Active session key used to load raw messages for the Errors tab. */
  activeSessionKey?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const delta = Date.now() - ms;
  if (delta < 0) {
    const s = Math.abs(Math.round(delta / 1000));
    if (s < 60) return `in ${s}s`;
    const m = Math.round(s / 60);
    if (m < 60) return `in ${m}m`;
    return `in ${Math.round(m / 60)}h`;
  }
  const s = Math.round(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function formatSchedule(job: CronJob): string {
  const s = job.schedule;
  if (s.kind === "cron" && s.expr) return s.expr + (s.tz ? ` (${s.tz})` : "");
  if (s.kind === "every" && s.everyMs) {
    const mins = Math.round(s.everyMs / 60_000);
    if (mins < 60) return `every ${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `every ${hrs}h`;
    return `every ${Math.round(hrs / 24)}d`;
  }
  if (s.kind === "at" && s.atMs) return new Date(s.atMs).toLocaleString();
  return "—";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function FileBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <CopyButton text={content} />
      </div>
      <ScrollArea className="h-48">
        <pre className="px-3 py-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground">
          {content || <span className="text-muted-foreground italic">empty</span>}
        </pre>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Memory
// ---------------------------------------------------------------------------

function MemoryTab({ token }: { token: string }) {
  const [data, setData] = useState<MemoryFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchMemory(token)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Live contents of your three memory files.
        </p>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={load}>
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}
      {data && (
        <>
          <FileBlock label="SOUL.md — Personality" content={data.soul} />
          <FileBlock label="USER.md — User Profile" content={data.user} />
          <FileBlock label="MEMORY.md — Project Facts" content={data.memory} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: System Prompt
// ---------------------------------------------------------------------------

function PromptTab({ token }: { token: string }) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchSystemPrompt(token)
      .then(setPrompt)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Exact system prompt sent to the model on each turn.
        </p>
        <div className="flex items-center gap-1">
          {prompt && <CopyButton text={prompt} />}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={load}>
            <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}
      {prompt !== null && (
        <div className="rounded-lg border border-border bg-muted/30">
          <ScrollArea className="h-[calc(100vh-260px)]">
            <pre className="px-3 py-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground">
              {prompt}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Cron Jobs
// ---------------------------------------------------------------------------

function CronTab({ token }: { token: string }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchCronJobs(token)
      .then(setJobs)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onToggle = useCallback(
    (id: string) => {
      setBusyIds((prev) => new Set([...prev, id]));
      toggleCronJob(token, id)
        .then(({ enabled }) => {
          setJobs((prev) =>
            prev.map((j) => (j.id === id ? { ...j, enabled } : j)),
          );
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setBusyIds((prev) => { const next = new Set(prev); next.delete(id); return next; }));
    },
    [token],
  );

  const onRun = useCallback(
    (id: string) => {
      setBusyIds((prev) => new Set([...prev, id]));
      runCronJob(token, id)
        .catch((e) => setError((e as Error).message))
        .finally(() => {
          setBusyIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
          setTimeout(load, 800);
        });
    },
    [token, load],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} scheduled
        </p>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={load}>
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}
      {jobs.length === 0 && !loading && !error && (
        <p className="text-center text-xs text-muted-foreground py-8">No cron jobs yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {jobs.map((job) => {
          const busy = busyIds.has(job.id);
          const lastStatus = job.state.lastStatus;
          return (
            <div
              key={job.id}
              className={cn(
                "rounded-lg border border-border bg-card px-3 py-2.5",
                !job.enabled && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{job.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">
                    {formatSchedule(job)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    disabled={busy}
                    onClick={() => onRun(job.id)}
                    title="Run now"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-40"
                    disabled={busy}
                    onClick={() => onToggle(job.id)}
                    title={job.enabled ? "Disable" : "Enable"}
                  >
                    {job.enabled ? (
                      <ToggleRight className="h-5 w-5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-muted-foreground">
                <span>
                  Next: <span className="text-foreground">{formatRelativeTime(job.state.nextRunAtMs)}</span>
                </span>
                {job.state.lastRunAtMs && (
                  <span>
                    Last: <span className="text-foreground">{formatRelativeTime(job.state.lastRunAtMs)}</span>
                    {lastStatus && (
                      <span
                        className={cn(
                          "ml-1 rounded px-1 py-0.5 text-[10px] font-medium",
                          lastStatus === "ok"
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >
                        {lastStatus}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {job.state.lastError && (
                <p className="mt-1 truncate text-[10.5px] text-destructive">
                  {job.state.lastError}
                </p>
              )}
              {job.payload.message && (
                <p className="mt-1.5 truncate text-[11px] text-muted-foreground italic">
                  "{job.payload.message}"
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Observability
// ---------------------------------------------------------------------------

type RawMsg = { role: string; content: string; name?: string };

function ObservabilityTab({
  token,
  sessionKey,
}: {
  token: string;
  sessionKey: string | null | undefined;
}) {
  const [messages, setMessages] = useState<RawMsg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!sessionKey) return;
    setLoading(true);
    setError(null);
    fetchSessionMessages(token, sessionKey)
      .then((body) => {
        setMessages(
          body.messages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            name: m.name,
          })),
        );
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, sessionKey]);

  useEffect(() => { load(); }, [load]);

  if (!sessionKey) {
    return (
      <p className="text-center text-xs text-muted-foreground py-8">
        Open a chat session to see observability data.
      </p>
    );
  }

  const toolMsgs = messages.map((m, i) => ({ ...m, index: i })).filter((m) => m.role === "tool");
  const errors = toolMsgs.filter((m) =>
    /error|failed|exception|traceback|cannot|invalid|not found/i.test(m.content),
  );
  const userTurns = messages.filter((m) => m.role === "user").length;
  const assistantTurns = messages.filter((m) => m.role === "assistant").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Active session breakdown</p>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={load}>
          <RefreshCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "User turns", value: userTurns },
          { label: "Agent turns", value: assistantTurns },
          { label: "Tool calls", value: toolMsgs.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-[10.5px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tool errors ({errors.length})
        </p>
        {errors.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            No tool errors detected.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {errors.map((m) => (
              <div key={m.index} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                <p className="text-xs font-medium text-destructive">{m.name ?? "tool"}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground whitespace-pre-wrap break-words">
                  {m.content.slice(0, 400)}{m.content.length > 400 && "…"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent tool calls
        </p>
        {toolMsgs.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">No tool calls yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {toolMsgs.slice(-20).map((m) => {
              const isErr = /error|failed|exception|traceback|cannot|invalid|not found/i.test(m.content);
              return (
                <div
                  key={m.index}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[11px]",
                    isErr ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/20",
                  )}
                >
                  <span className={cn("font-mono font-medium", isErr ? "text-destructive" : "text-foreground")}>
                    {m.name ?? "tool"}
                  </span>
                  <span className="ml-2 text-muted-foreground line-clamp-1">{m.content.slice(0, 120)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: "memory", label: "Memory" },
  { id: "prompt", label: "Prompt" },
  { id: "cron", label: "Cron" },
  { id: "errors", label: "Errors" },
];

export function DashboardPanel({
  open,
  onClose,
  token,
  activeSessionKey,
}: DashboardPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("memory");

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-[480px] flex-col gap-0 p-0 sm:max-w-[480px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Agent Dashboard</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "border-b-2 border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {activeTab === "memory" && <MemoryTab token={token} />}
            {activeTab === "prompt" && <PromptTab token={token} />}
            {activeTab === "cron" && <CronTab token={token} />}
            {activeTab === "errors" && <ObservabilityTab token={token} sessionKey={activeSessionKey} />}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
