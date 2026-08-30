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
  Paperclip,
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

export default function Home() {
  const [question, setQuestion] = useState(suggestions[0]);
  const [activeRun, setActiveRun] = useState<SemanticQueryRun | null>(null);
  
  const queryMutation = trpc.semantic.run.useMutation({
    onSuccess: run => {
      setActiveRun(run);
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

  const isLoading = queryMutation.isPending;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-[#112235]">
      <div className="flex flex-col min-h-screen items-center">
        <header className="flex w-full h-[72px] items-center justify-between border-b border-[#dfe3df] bg-[#faf9f5]/95 px-5 backdrop-blur lg:px-9">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
              <Network className="size-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-[#102130]">Business Assistant</p>
            </div>
          </div>
          <div>
             <a href="/admin" className="text-xs font-semibold text-[#68767e] hover:text-[#112235] transition-colors">Admin Portal &rarr;</a>
          </div>
        </header>

        <main className="w-full max-w-4xl px-4 py-8 sm:px-6">
          <section className="enter-up rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_10px_35px_rgba(24,45,57,0.045)] sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-md bg-[#e1f1e8] text-[#1f7053]"><Sparkles className="size-3.5" /></span>
                  <Label>Ask the semantic layer</Label>
                </div>
                <h1 className="mt-3 font-editorial text-[30px] leading-[1.05] tracking-[-0.03em] text-[#132838] sm:text-[34px]">Ask in business language.<br className="hidden sm:block" /> Get accurate answers.</h1>
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => toast.info("Unstructured File RAG feature coming soon. Please contact an admin to set up the Vector Database.", { description: "You will soon be able to upload PDFs, Docs, and Spreadsheets to combine structured and unstructured search." })} className="h-9 gap-2 rounded-lg px-3 text-xs shadow-none border-[#cfdcd5] text-[#53636b] hover:bg-[#eef2ef] hover:text-[#183347]">
                    <Paperclip className="size-3.5" /> Attach File
                  </Button>
                  <Button onClick={() => runQuestion()} disabled={queryMutation.isPending} className="h-9 gap-2 rounded-lg bg-[#183347] px-4 text-xs shadow-none transition-transform active:scale-[0.97] hover:bg-[#25495e]">
                    {queryMutation.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Ask
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {isLoading ? (
            <div className="mt-6 grid min-h-[300px] place-items-center rounded-2xl border border-[#dfe3df] bg-white">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-5 animate-spin text-[#5a9479]" />
                <p className="mt-3 text-sm text-[#65747b]">Analyzing intent and querying database...</p>
              </div>
            </div>
          ) : activeRun && (
            <div className="mt-6 space-y-6">
              <section className="enter-up stagger-1 grid gap-4">
                <div className="rounded-2xl border border-[#dfe3df] bg-white p-5 shadow-[0_8px_26px_rgba(24,45,57,0.035)] sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <Label>Interpretation</Label>
                      <p className="mt-2 text-[17px] font-semibold tracking-[-0.015em] text-[#183043]">{activeRun.question}</p>
                    </div>
                    <ConfidencePill value={activeRun.confidence} />
                  </div>
                  
                  {activeRun.ambiguity.detected && (
                    <div className="mt-5 rounded-xl border border-[#edd7a7] bg-[#fff9eb] p-4">
                      <div className="flex gap-2.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-[#a66c16]" /><div><p className="text-sm font-semibold text-[#744b12]">A clarification is needed before execution.</p><p className="mt-1 text-xs leading-5 text-[#8b651e]">{activeRun.ambiguity.explanation}</p></div></div>
                      <div className="mt-3 flex flex-wrap gap-2">{activeRun.ambiguity.questions.map(item => <button key={item} onClick={() => { setQuestion(item); runQuestion(item); }} className="rounded-md border border-[#ead6a7] bg-white px-2.5 py-1.5 text-left text-[11px] text-[#74531c] hover:bg-[#fffdf6]">{item}</button>)}</div>
                    </div>
                  )}

                  <div className="mt-5 rounded-xl bg-[#f3f6f4] p-4">
                    <div className="flex items-center gap-2"><Bot className="size-4 text-[#397a60]" /><span className="text-xs font-semibold text-[#355649]">Grounded answer</span></div>
                    <p className="mt-2 text-sm leading-6 text-[#2d414c]">{activeRun.answer}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dfe3df] bg-white shadow-[0_8px_26px_rgba(24,45,57,0.035)]">
                  <div className="flex flex-col gap-3 border-b border-[#e5e9e6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div><Label>Result preview</Label><p className="mt-1 text-sm font-semibold text-[#213846]">{activeRun.result.summary}</p></div>
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[#eaf3ed] px-2.5 py-1.5 text-[11px] font-semibold text-[#2b7757]"><Check className="size-3.5" /> Execution sandbox verified</div>
                  </div>
                  {activeRun.result.rows.length > 0 ? <ResultTable run={activeRun} /> : <div className="px-6 py-10 text-center text-sm text-[#718087]">The query was intentionally not executed while clarification is required.</div>}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function InfoCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <div className="rounded-lg border border-[#e0e6e2] bg-[#fbfcfb] px-3.5 py-3"><div className="flex items-center gap-1.5 text-[#799097]">{icon}<span className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</span></div><p className="mt-1.5 truncate text-xs font-semibold text-[#29424f]" title={value}>{value}</p></div>;
}

function ResultTable({ run }: { run: SemanticQueryRun }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left"><thead><tr className="border-b border-[#e5e9e6] bg-[#fafbf9]">{run.result.columns.map(column => <th key={column} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#718087] sm:px-6">{column}</th>)}</tr></thead><tbody>{run.result.rows.map((row, index) => <tr key={index} className="border-b border-[#edf0ed] last:border-0 hover:bg-[#fbfcfb]">{run.result.columns.map(column => <td key={column} className="px-5 py-3.5 text-xs font-medium text-[#39515b] sm:px-6">{row[column]}</td>)}</tr>)}</tbody></table></div>;
}

function GroundingRow({ item }: { item: GroundingItem }) {
  return <div className="rounded-lg border border-[#e3e9e5] bg-[#fbfcfb] p-3"><div className="flex items-start gap-2.5"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-[#edf4ef] text-[#3a7e61]"><GroundingIcon kind={item.kind} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-semibold text-[#36505b]">{item.label}</p><span className="shrink-0 text-[10px] font-semibold text-[#4c956f]">{Math.round(item.confidence * 100)}%</span></div><p className="mt-1 text-[10px] leading-4 text-[#7b8a90]">{item.detail}</p><p className="mt-1.5 truncate font-mono-ui text-[9px] text-[#a0aaad]">{item.source}</p></div></div></div>;
}

