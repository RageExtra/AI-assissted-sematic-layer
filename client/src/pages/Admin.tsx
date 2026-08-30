import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { GroundingItem, SemanticQueryRun } from "../../../shared/semantic";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpenText,
  Bot,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  FileSearch,
  GitBranch,
  History,
  LayoutGrid,
  LineChart,
  LoaderCircle,
  Network,
  PanelRight,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TableProperties,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ViewName = "Workspace" | "Semantic model" | "Query history" | "Evaluation";

const suggestions = [
  "What were our revenue and orders by region in the last quarter?",
  "Which customers generated the most completed revenue?",
  "Show the monthly revenue trend for the last six months.",
  "Show performance",
];

const navigation: Array<{ label: ViewName; icon: typeof LayoutGrid; path?: string }> = [
  { label: "Workspace", icon: LayoutGrid },
  { label: "Semantic model", icon: Network, path: "/governance" },
  { label: "Query history", icon: History },
  { label: "Evaluation", icon: BarChart3, path: "/evaluation" },
];

function ConfidencePill({ value, label = "confidence" }: { value: number; label?: string }) {
  const percent = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e5f2eb] px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em] text-[#267055]">
      <span className="size-1.5 rounded-full bg-[#48a87c]" />
      {percent}% {label}
    </span>
  );
}

function GroundingIcon({ kind }: { kind: GroundingItem["kind"] }) {
  const className = "size-3.5";
  if (kind === "relationship") return <GitBranch className={className} />;
  if (kind === "dimension") return <TableProperties className={className} />;
  if (kind === "metric" || kind === "business_rule") return <LineChart className={className} />;
  if (kind === "alias") return <WandSparkles className={className} />;
  return <Database className={className} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#75818a]">{children}</p>;
}

export default function Admin() {
  const [activeView, setActiveView] = useState<ViewName>("Workspace");
  const [, setLocation] = useLocation();
  const [question, setQuestion] = useState(suggestions[0]);
  const [activeRun, setActiveRun] = useState<SemanticQueryRun | null>(null);
  const demoQuery = trpc.semantic.demo.useQuery();
  const historyQuery = trpc.semantic.history.useQuery();
  const utils = trpc.useUtils();
  const queryMutation = trpc.semantic.run.useMutation({
    onSuccess: run => {
      setActiveRun(run);
      utils.semantic.history.invalidate();
      if (run.ambiguity.detected) {
        toast.message("Clarification needed", { description: "No SQL was drafted until the missing business context is resolved." });
      } else {
        toast.success("Grounded query ready", { description: "The read-only SQL draft passed safety validation." });
      }
    },
    onError: () => toast.error("The query workflow could not be completed. Please retry."),
  });
  const feedbackMutation = trpc.semantic.feedback.useMutation({
    onSuccess: (_, input) => toast.success(input.rating === "helpful" ? "Feedback recorded" : "Marked for steward review", { description: "Your feedback will improve future semantic definitions." }),
    onError: () => toast.error("Feedback could not be recorded. Please try again."),
  });

  useEffect(() => {
    if (demoQuery.data && !activeRun) setActiveRun(demoQuery.data);
  }, [activeRun, demoQuery.data]);

  const runQuestion = (nextQuestion?: string) => {
    const value = (nextQuestion ?? question).trim();
    if (value.length < 3) {
      toast.error("Add a more specific business question to continue.");
      return;
    }
    setQuestion(value);
    queryMutation.mutate({ question: value });
  };

  const copySql = async () => {
    if (!activeRun?.sql) return;
    await navigator.clipboard.writeText(activeRun.sql);
    toast.success("SQL draft copied");
  };

  const history = historyQuery.data ?? [];
  const isLoading = !activeRun || demoQuery.isLoading;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#112235]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[244px] shrink-0 flex-col bg-[#102130] px-4 py-5 text-[#dfe8e4] lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
              <Network className="size-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white">semantic</p>
              <p className="-mt-0.5 text-[10px] tracking-[0.16em] text-[#8fa79e]">LAYER STUDIO</p>
            </div>
          </div>

          <div className="mt-10 px-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72877f]">Workbench</p>
          </div>
          <nav className="mt-3 space-y-1">
            {navigation.map(({ label, icon: Icon, path }) => {
              const active = activeView === label;
              return (
                <button
                  key={label}
                  onClick={() => path ? setLocation(path) : setActiveView(label)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150 ease-out active:scale-[0.98] ${active ? "bg-[#234054] text-white shadow-[inset_0_0_0_1px_rgba(190,225,211,0.08)]" : "text-[#a9bbb5] hover:bg-[#193244] hover:text-white"}`}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                  {label === "Query history" && <span className="ml-auto rounded-md bg-[#315065] px-1.5 py-0.5 text-[10px] text-[#cfddd8]">{history.length || 2}</span>}
                </button>
              );
            })}
          </nav>

          <div className="mt-8 px-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72877f]">Data sources</p>
          </div>
          <div className="mt-3 rounded-xl border border-[#2a4555] bg-[#172f40] p-3.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 grid size-6 place-items-center rounded-md bg-[#24475a] text-[#a8d8c2]"><Database className="size-3.5" /></div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[#e7f1ed]">Commerce warehouse</p>
                <p className="mt-1 text-[11px] text-[#8fa79e]">Synced 4 minutes ago</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#a7d5bd]"><span className="size-1.5 rounded-full bg-[#67c695]" /> Healthy · 18 tables</div>
          </div>

          <div className="mt-auto border-t border-[#2a4555] pt-5">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#a9bbb5] transition-colors hover:bg-[#193244] hover:text-white"><Settings2 className="size-4" /> Workspace settings</button>
            <div className="mt-4 flex items-center gap-2.5 px-3">
              <div className="grid size-7 place-items-center rounded-full bg-[#d8c3a5] text-[10px] font-bold text-[#654e37]">AC</div>
              <div><p className="text-xs font-medium text-white">Alex Chen</p><p className="text-[10px] text-[#8fa79e]">Data steward</p></div>
              <ChevronDown className="ml-auto size-3.5 text-[#8fa79e]" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex h-[72px] items-center justify-between border-b border-[#dfe3df] bg-[#faf9f5]/95 px-5 backdrop-blur lg:px-9">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-[#102130] text-white lg:hidden"><Network className="size-4" /></div>
              <div>
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold">{activeView}</span><ChevronRight className="size-3.5 text-[#9aa5a9]" /><span className="hidden text-sm text-[#68767e] sm:inline">Commerce Intelligence</span></div>
                <p className="mt-0.5 text-[11px] text-[#809099]">{activeView === "Workspace" ? "Governed business answers, with every step reviewable." : activeView === "Semantic model" ? "Browse the governed definitions and data lineage used in every answer." : activeView === "Query history" ? "Return to a previous question, its sources, safety checks, and result." : "Compare grounded semantic queries with direct LLM-to-SQL generation."}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <button className="hidden items-center gap-2 rounded-lg border border-[#d7ded9] bg-white px-3 py-2 text-xs font-medium text-[#3b4c56] shadow-sm sm:flex"><span className="size-1.5 rounded-full bg-[#49b384]" /> Production model</button>
              <button className="grid size-9 place-items-center rounded-lg text-[#60717a] transition-colors hover:bg-[#e9eeeb]"><Bell className="size-4" /></button>
              <button className="grid size-9 place-items-center rounded-lg border border-[#d7ded9] bg-white text-[#50626b] shadow-sm"><CircleHelp className="size-4" /></button>
            </div>
          </header>

          <div className="mx-auto max-w-[1540px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
            {activeView !== "Workspace" && <section className="mb-6 rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6"><div className="flex items-start justify-between gap-4"><div><Label>{activeView}</Label><h2 className="mt-2 font-editorial text-2xl tracking-[-0.02em] text-[#193142]">{activeView === "Semantic model" ? "Governed commerce definitions" : activeView === "Query history" ? "Review a grounded question" : "Reliability evidence"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#687981]">{activeView === "Semantic model" ? "Completed Revenue, Customer Region, and the Customer → Order relationship are the approved concepts represented in this workspace." : activeView === "Query history" ? "Select a question below to restore its complete semantic trace, SQL draft, validation evidence, and results." : "The current comparison scores the semantic path on grounding, provenance, and safe compilation—not only whether raw SQL is syntactically valid."}</p></div><button onClick={() => setActiveView("Workspace")} className="shrink-0 rounded-lg border border-[#d6dfda] px-3 py-2 text-xs font-semibold text-[#49606a] hover:bg-[#f2f5f3]">Open workspace</button></div>
              {activeView === "Semantic model" && <div className="mt-5 grid gap-3 sm:grid-cols-3"><InfoCell label="Metric" value="Completed Revenue" icon={<LineChart className="size-3.5" />} /><InfoCell label="Dimension" value="Customer Region" icon={<TableProperties className="size-3.5" />} /><InfoCell label="Relation" value="Customer → Order" icon={<GitBranch className="size-3.5" />} /></div>}
              {activeView === "Query history" && <div className="mt-4 divide-y divide-[#e7ece8]">{history.map(item => <button key={item.id} onClick={() => { setActiveRun(item); setQuestion(item.question); setActiveView("Workspace"); }} className="flex w-full items-center gap-3 py-3 text-left"><span className="grid size-8 place-items-center rounded-lg bg-[#edf4ef] text-[#3e7b61]"><History className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#3a515b]">{item.question}</span><span className="text-[11px] text-[#89969a]">{Math.round(item.confidence * 100)}% confidence · {item.result.summary}</span></span><ChevronRight className="size-4 text-[#91a0a5]" /></button>)}</div>}
              {activeView === "Evaluation" && <div className="mt-5 grid gap-3 sm:grid-cols-2"><ComparisonCard title="Semantic Layer" score={activeRun ? Math.round(activeRun.confidence * 100) : 94} accent="green" rows={["Grounded definitions", "Visible provenance", "Read-only compiler"]} /><ComparisonCard title="Direct LLM baseline" score={activeRun ? Math.round(activeRun.baseline.score * 100) : 54} accent="amber" rows={["Raw schema inference", "No rule provenance", "Manual review needed"]} /></div>}
            </section>}
            <section className="enter-up rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_10px_35px_rgba(24,45,57,0.045)] sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-2"><span className="inline-flex size-6 items-center justify-center rounded-md bg-[#e1f1e8] text-[#1f7053]"><Sparkles className="size-3.5" /></span><Label>Ask the semantic layer</Label></div>
                  <h1 className="mt-3 font-editorial text-[30px] leading-[1.05] tracking-[-0.03em] text-[#132838] sm:text-[34px]">Ask in business language.<br className="hidden sm:block" /> Review with confidence.</h1>
                </div>
                <div className="flex shrink-0 items-center gap-2 rounded-lg bg-[#f1f5f2] px-3 py-2 text-xs text-[#587069]"><ShieldCheck className="size-4 text-[#319267]" /> Read-only execution enforced</div>
              </div>
              <div className="mt-6 rounded-xl border border-[#cfdcd5] bg-[#fbfcfb] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <Textarea
                  value={question}
                  onChange={event => setQuestion(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); runQuestion(); } }}
                  className="min-h-[70px] resize-none border-0 bg-transparent px-3 py-2 text-[15px] leading-6 text-[#162936] shadow-none focus-visible:ring-0"
                  placeholder="Ask a question about your business data..."
                />
                <div className="flex flex-col gap-3 border-t border-[#e1e7e3] px-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[11px] text-[#7a878d]">Try:</span>
                    {suggestions.slice(1, 4).map(suggestion => (
                      <button key={suggestion} onClick={() => { setQuestion(suggestion); runQuestion(suggestion); }} className="rounded-md bg-[#eef2ef] px-2.5 py-1.5 text-[11px] text-[#53636b] transition-colors hover:bg-[#dfe9e3] hover:text-[#224935]">{suggestion}</button>
                    ))}
                  </div>
                  <Button onClick={() => runQuestion()} disabled={queryMutation.isPending} className="h-9 gap-2 rounded-lg bg-[#183347] px-4 text-xs shadow-none transition-transform active:scale-[0.97] hover:bg-[#25495e]">
                    {queryMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Run grounded query
                  </Button>
                </div>
              </div>
            </section>

            {isLoading ? (
              <div className="mt-6 grid min-h-[420px] place-items-center rounded-2xl border border-[#dfe3df] bg-white"><div className="text-center"><LoaderCircle className="mx-auto size-5 animate-spin text-[#5a9479]" /><p className="mt-3 text-sm text-[#65747b]">Loading the governed query workspace…</p></div></div>
            ) : activeRun && (
              <div className="mt-6 space-y-6">
                <section className="enter-up stagger-1 grid gap-4 xl:grid-cols-[1.6fr_0.85fr]">
                  <div className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <Label>Interpretation</Label>
                        <p className="mt-2 text-[17px] font-semibold tracking-[-0.015em] text-[#183043]">{activeRun.question}</p>
                      </div>
                      <ConfidencePill value={activeRun.confidence} />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <InfoCell label="Intent" value={activeRun.intent === "clarification" ? "Clarify intent" : activeRun.intent} icon={<Search className="size-3.5" />} />
                      <InfoCell label="Governed metric" value={activeRun.metric} icon={<LineChart className="size-3.5" />} />
                      <InfoCell label="Analysis grain" value={activeRun.dimension} icon={<TableProperties className="size-3.5" />} />
                    </div>
                    {activeRun.ambiguity.detected && (
                      <div className="mt-5 rounded-xl border border-[#edd7a7] bg-[#fff9eb] p-4">
                        <div className="flex gap-2.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-[#a66c16]" /><div><p className="text-sm font-semibold text-[#744b12]">A clarification is needed before execution.</p><p className="mt-1 text-xs leading-5 text-[#8b651e]">{activeRun.ambiguity.explanation}</p></div></div>
                        <div className="mt-3 flex flex-wrap gap-2">{activeRun.ambiguity.questions.map(item => <button key={item} onClick={() => setQuestion(item)} className="rounded-md border border-[#ead6a7] bg-white px-2.5 py-1.5 text-left text-[11px] text-[#74531c] hover:bg-[#fffdf6]">{item}</button>)}</div>
                      </div>
                    )}
                    <div className="mt-5 rounded-xl bg-[#f3f6f4] p-4">
                      <div className="flex items-center gap-2"><Bot className="size-4 text-[#397a60]" /><span className="text-xs font-semibold text-[#355649]">Grounded answer</span><span className="ml-auto text-[10px] text-[#7a8a84]">{activeRun.llm.used ? "LLM-assisted · catalog-constrained" : "Catalog-guided demo"}</span></div>
                      <p className="mt-2 text-sm leading-6 text-[#2d414c]">{activeRun.answer}</p>
                      <div className="mt-3 flex items-center gap-2 border-t border-[#dce9df] pt-3"><span className="mr-auto text-[10px] text-[#71817b]">Was this definition useful?</span><button disabled={feedbackMutation.isPending} onClick={() => feedbackMutation.mutate({ runId: activeRun.id, rating: "helpful" })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[#4c7561] hover:bg-[#dcefe4]"><ThumbsUp className="size-3" /> Helpful</button><button disabled={feedbackMutation.isPending} onClick={() => feedbackMutation.mutate({ runId: activeRun.id, rating: "needs_review" })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[#7a7060] hover:bg-[#eeeae0]"><ThumbsDown className="size-3" /> Needs review</button></div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#143246] p-5 text-white shadow-[0_10px_28px_rgba(16,33,48,0.14)] sm:p-6">
                    <div className="flex items-center justify-between"><Label>Semantic trace</Label><span className="rounded-full bg-[#27536a] px-2 py-1 text-[10px] font-semibold text-[#b9dbc9]">{activeRun.retrieval.matchedChunks} sources grounded</span></div>
                    <div className="mt-5 space-y-0">
                      <TraceItem icon={<MessageSquareIcon />} title="Business question" detail="Intent and key business terms extracted" completed />
                      <TraceItem icon={<BookOpenText className="size-3.5" />} title="Semantic catalog" detail={`${activeRun.metric} · ${activeRun.dimension}`} completed />
                      <TraceItem icon={<Network className="size-3.5" />} title="Graph + vector retrieval" detail={`${activeRun.retrieval.confidence * 100}% grounded context match`} completed />
                      <TraceItem icon={<ShieldCheck className="size-3.5" />} title="Safe query compiler" detail={activeRun.safety.status === "validated" ? "Read-only draft verified" : "Execution paused for clarification"} completed />
                    </div>
                    <div className="mt-5 border-t border-[#2b5265] pt-4 text-xs leading-5 text-[#b8c9c6]">{activeRun.llm.note}</div>
                  </div>
                </section>

                <section className="enter-up stagger-2 grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(350px,0.9fr)]">
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-[#dfe3df] bg-white shadow-[0_8px_26px_rgba(24,45,57,0.035)]">
                      <div className="flex flex-col gap-3 border-b border-[#e5e9e6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div><Label>Result preview</Label><p className="mt-1 text-sm font-semibold text-[#213846]">{activeRun.result.summary}</p></div>
                        <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[#eaf3ed] px-2.5 py-1.5 text-[11px] font-semibold text-[#2b7757]"><Check className="size-3.5" /> Execution sandbox verified</div>
                      </div>
                      {activeRun.result.rows.length > 0 ? <ResultTable run={activeRun} /> : <div className="px-6 py-10 text-center text-sm text-[#718087]">The query was intentionally not executed while clarification is required.</div>}
                    </div>

                    <div className="rounded-2xl border border-[#dfe3df] bg-white shadow-[0_8px_26px_rgba(24,45,57,0.035)]">
                      <div className="flex items-center justify-between border-b border-[#e5e9e6] px-5 py-4 sm:px-6"><div><Label>Read-only SQL draft</Label><p className="mt-1 text-sm font-semibold text-[#213846]">Explainable, compiled from governed semantic context</p></div>{activeRun.sql && <button onClick={copySql} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-[#52656d] transition-colors hover:bg-[#edf1ee]"><Copy className="size-3.5" /> Copy</button>}</div>
                      {activeRun.sql ? <pre className="max-h-[320px] overflow-auto bg-[#102130] px-5 py-5 font-mono-ui text-[11px] leading-6 text-[#d6e8df] sm:px-6"><code>{activeRun.sql}</code></pre> : <div className="bg-[#fcfbf7] px-6 py-8 text-sm text-[#77827c]">No SQL draft was produced. This is a deliberate safety control, not a failed query.</div>}
                      <div className="border-t border-[#e5e9e6] px-5 py-4 sm:px-6"><p className="text-xs leading-5 text-[#667780]"><span className="font-semibold text-[#344d5a]">Why this query:</span> {activeRun.sqlExplanation}</p></div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <section className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                      <div className="flex items-center justify-between"><div><Label>Retrieved context</Label><p className="mt-1 text-sm font-semibold text-[#213846]">Provenance you can inspect</p></div><ConfidencePill value={activeRun.retrieval.confidence} label="grounding" /></div>
                      <div className="mt-4 space-y-2.5">{activeRun.semanticContext.map(item => <GroundingRow key={`${item.kind}-${item.label}`} item={item} />)}</div>
                      <button className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#316c53] hover:text-[#164c38]">Open semantic model <ArrowUpRight className="size-3.5" /></button>
                    </section>

                    <section className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                      <div className="flex items-start justify-between"><div><Label>Safety validation</Label><p className="mt-1 text-sm font-semibold text-[#213846]">{activeRun.safety.status === "validated" ? "Read-only draft approved" : "Execution withheld"}</p></div><ShieldCheck className="size-5 text-[#2f9469]" /></div>
                      <div className="mt-4 space-y-2.5">{activeRun.safety.checks.map(check => <div key={check.label} className="flex gap-2.5 rounded-lg bg-[#f4f7f5] px-3 py-2.5"><span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${check.passed ? "bg-[#d8efe2] text-[#257b56]" : "bg-[#f7dddd] text-[#ba4945]"}`}>{check.passed ? <Check className="size-2.5" strokeWidth={3} /> : "!"}</span><div><p className="text-[11px] font-semibold text-[#3b535d]">{check.label}</p><p className="mt-0.5 text-[10px] leading-4 text-[#77868d]">{check.detail}</p></div></div>)}</div>
                    </section>
                  </div>
                </section>

                <section className="enter-up stagger-3 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                  <div className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><Label>Reliability comparison</Label><p className="mt-1 text-sm font-semibold text-[#213846]">Semantic grounding versus direct LLM-to-SQL</p></div><span className="text-xs text-[#75828a]">Same question · same warehouse</span></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <ComparisonCard title="Semantic Layer" score={Math.round(activeRun.confidence * 100)} accent="green" rows={["Governed metric and aliases", "Graph-backed relationship", "Read-only safety validation"]} />
                      <ComparisonCard title="Direct LLM baseline" score={Math.round(activeRun.baseline.score * 100)} accent="amber" rows={["Raw schema inference", "No business-rule provenance", "Needs manual review"]} />
                    </div>
                    <p className="mt-4 rounded-lg bg-[#fcfaf4] px-3 py-2.5 text-[11px] leading-5 text-[#7a6841]"><span className="font-semibold text-[#69582f]">Baseline risk:</span> {activeRun.baseline.note}</p>
                  </div>
                  <div className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                    <div className="flex items-center justify-between"><div><Label>Recent questions</Label><p className="mt-1 text-sm font-semibold text-[#213846]">Query history</p></div><Clock3 className="size-4 text-[#74828a]" /></div>
                    <div className="mt-3 divide-y divide-[#e8ece9]">{history.slice(0, 3).map(item => <button key={item.id} onClick={() => { setActiveRun(item); setQuestion(item.question); }} className="group flex w-full items-center gap-3 py-3 text-left"><span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#eff4f0] text-[#4a8169]"><FileSearch className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[#39505a]">{item.question}</span><span className="mt-0.5 block text-[10px] text-[#8a969b]">{Math.round(item.confidence * 100)}% confidence · {item.intent}</span></span><ChevronRight className="size-3.5 text-[#94a1a6] transition-transform group-hover:translate-x-0.5" /></button>)}</div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function InfoCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-lg border border-[#e0e6e2] bg-[#fbfcfb] px-3.5 py-3"><div className="flex items-center gap-1.5 text-[#799097]">{icon}<span className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-1.5 truncate text-xs font-semibold text-[#29424f]" title={value}>{value}</p></div>;
}

function TraceItem({ icon, title, detail, completed }: { icon: React.ReactNode; title: string; detail: string; completed: boolean }) {
  return <div className="relative flex gap-3 pb-4 last:pb-0"><div className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full bg-[#245066] text-[#b8decb]">{icon}</div><div className="min-w-0 pt-0.5"><div className="flex items-center gap-2"><p className="text-xs font-semibold text-white">{title}</p>{completed && <Check className="size-3 text-[#7bcca2]" strokeWidth={3} />}</div><p className="mt-0.5 text-[10px] leading-4 text-[#9db2af]">{detail}</p></div><div className="absolute left-3 top-6 h-[calc(100%-10px)] border-l border-dashed border-[#366177] last:hidden" /></div>;
}

function MessageSquareIcon() { return <Search className="size-3.5" />; }

function ResultTable({ run }: { run: SemanticQueryRun }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left"><thead><tr className="border-b border-[#e5e9e6] bg-[#fafbf9]">{run.result.columns.map(column => <th key={column} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#718087] sm:px-6">{column}</th>)}</tr></thead><tbody>{run.result.rows.map((row, index) => <tr key={index} className="border-b border-[#edf0ed] last:border-0 hover:bg-[#fbfcfb]">{run.result.columns.map(column => <td key={column} className="px-5 py-3.5 text-xs font-medium text-[#39515b] sm:px-6">{row[column]}</td>)}</tr>)}</tbody></table></div>;
}

function GroundingRow({ item }: { item: GroundingItem }) {
  return <div className="rounded-lg border border-[#e3e9e5] bg-[#fbfcfb] p-3"><div className="flex items-start gap-2.5"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-[#edf4ef] text-[#3a7e61]"><GroundingIcon kind={item.kind} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-semibold text-[#36505b]">{item.label}</p><span className="shrink-0 text-[10px] font-semibold text-[#4c956f]">{Math.round(item.confidence * 100)}%</span></div><p className="mt-1 text-[10px] leading-4 text-[#7b8a90]">{item.detail}</p><p className="mt-1.5 truncate font-mono-ui text-[9px] text-[#a0aaad]">{item.source}</p></div></div></div>;
}

function ComparisonCard({ title, score, accent, rows }: { title: string; score: number; accent: "green" | "amber"; rows: string[] }) {
  const isGreen = accent === "green";
  return <div className={`rounded-xl border p-4 ${isGreen ? "border-[#cae5d5] bg-[#f5faf6]" : "border-[#ece1c7] bg-[#fdfbf6]"}`}><div className="flex items-start justify-between"><div><p className={`text-xs font-bold ${isGreen ? "text-[#226449]" : "text-[#755c27]"}`}>{title}</p><p className="mt-1 text-[10px] text-[#7d898a]">Reliability signal</p></div><span className={`font-editorial text-2xl ${isGreen ? "text-[#2f8b62]" : "text-[#ba8235]"}`}>{score}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80"><div className={`h-full rounded-full ${isGreen ? "bg-[#5eb284]" : "bg-[#d6a554]"}`} style={{ width: `${score}%` }} /></div><div className="mt-3 space-y-1.5">{rows.map(row => <p key={row} className="flex items-center gap-1.5 text-[10px] text-[#5b6a6d]"><span className={`size-1 rounded-full ${isGreen ? "bg-[#50a578]" : "bg-[#d3a04d]"}`} />{row}</p>)}</div></div>;
}
