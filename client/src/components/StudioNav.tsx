import { Link, useLocation } from "wouter";
import { BarChart3, DatabaseZap, History, LayoutGrid, Network, Settings2, ShieldCheck, TimerReset, Database, GitBranch, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

const items = [
  { label: "Workspace", path: "/admin", icon: LayoutGrid },
  { label: "Data connections", path: "/connections", icon: DatabaseZap },
  { label: "Semantic model", path: "/governance", icon: Network },
  { label: "Evaluation", path: "/evaluation", icon: BarChart3 },
  { label: "Automation", path: "/automation", icon: TimerReset },
  { label: "Query history", path: "/admin?view=history", icon: History },
];

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function StudioNav({ eyebrow = "WORKBENCH" }: { eyebrow?: string }) {
  const [location] = useLocation();
  const historyQuery = trpc.semantic.history.useQuery();
  const historyCount = historyQuery.data?.length || 2;

  return (
    <aside className="hidden min-h-screen w-[244px] shrink-0 flex-col bg-[#102130] px-4 py-5 text-[#dfe8e4] lg:flex">
      {location === "/admin" ? (
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]"><Network className="size-5" strokeWidth={2.25} /></span>
          <div>
            <span className="block text-sm font-semibold tracking-tight text-white">semantic</span>
            <span className="-mt-0.5 block text-[10px] tracking-[0.16em] text-[#8fa79e]">LAYER STUDIO</span>
          </div>
        </div>
      ) : (
        <Link href="/admin" className="flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]"><Network className="size-5" strokeWidth={2.25} /></span>
          <div>
            <span className="block text-sm font-semibold tracking-tight text-white">semantic</span>
            <span className="-mt-0.5 block text-[10px] tracking-[0.16em] text-[#8fa79e]">LAYER STUDIO</span>
          </div>
        </Link>
      )}
      <div className="mt-10 px-2"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72877f]">{eyebrow}</p></div>
      <nav className="mt-3 space-y-1">
        {items.map(({ label, path, icon: Icon }) => {
          const search = typeof window !== 'undefined' ? window.location.search : "";
          const active = (location === path && label !== "Workspace") || 
                         (path === "/admin?view=history" && location === "/admin" && search.includes("view=history")) ||
                         (path === "/admin" && location === "/admin" && !search.includes("view=history"));
          return (
            <Link key={label} href={path} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active ? "bg-[#234054] text-white shadow-[inset_0_0_0_1px_rgba(190,225,211,0.08)]" : "text-[#a9bbb5] hover:bg-[#193244] hover:text-white"}`}>
              <Icon className="size-4" />
              <span>{label}</span>
              {label === "Query history" && (
                <span className="ml-auto rounded-md bg-[#315065] px-1.5 py-0.5 text-[10px] text-[#cfddd8]">{historyCount}</span>
              )}
            </Link>
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
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#a9bbb5] transition-colors hover:bg-[#193244] hover:text-white">
              <Settings2 className="size-4" /> Workspace settings
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Workspace Settings</DialogTitle>
              <DialogDescription>
                Configure global settings for this Semantic Layer workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 text-sm text-[#49606a]">
              <p>• <strong>Team Management:</strong> Invite Data Stewards or Analytics Engineers and configure SSO.</p>
              <p>• <strong>LLM Configuration:</strong> Switch between Groq, OpenAI, and internal models for the query compilation engine.</p>
              <p>• <strong>Caching & Performance:</strong> Set default TTLs for the exact-match AST query cache.</p>
              <p>• <strong>API Keys:</strong> Generate secure tokens for BI tool integration (e.g. Tableau, Looker).</p>
            </div>
          </DialogContent>
        </Dialog>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="mt-4 flex cursor-pointer items-center gap-2.5 px-3 hover:bg-[#193244] py-2 rounded-xl transition-colors">
              <div className="grid size-7 place-items-center rounded-full bg-[#d8c3a5] text-[10px] font-bold text-[#654e37]">AC</div>
              <div><p className="text-xs font-medium text-white">Alex Chen</p><p className="text-[10px] text-[#8fa79e]">Data steward</p></div>
              <ChevronDown className="ml-auto size-3.5 text-[#8fa79e]" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Personal API Tokens</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Impersonate Role...</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
