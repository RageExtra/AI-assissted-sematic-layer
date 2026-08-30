import { Link, useLocation } from "wouter";
import { BarChart3, DatabaseZap, History, LayoutGrid, Network, Settings2, ShieldCheck, TimerReset } from "lucide-react";

const items = [
  { label: "Workspace", path: "/admin", icon: LayoutGrid },
  { label: "Data connections", path: "/connections", icon: DatabaseZap },
  { label: "Semantic governance", path: "/governance", icon: Network },
  { label: "Evaluation lab", path: "/evaluation", icon: BarChart3 },
  { label: "Automation", path: "/automation", icon: TimerReset },
  { label: "Query history", path: "/history", icon: History },
];

export function StudioNav({ eyebrow = "CONTROL PLANE" }: { eyebrow?: string }) {
  const [location] = useLocation();
  return (
    <aside className="hidden min-h-screen w-[244px] shrink-0 flex-col bg-[#102130] px-4 py-5 text-[#dfe8e4] lg:flex">
      {location === "/admin" ? (
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]"><Network className="size-5" strokeWidth={2.25} /></span>
          <span><span className="block text-sm font-semibold tracking-tight text-white">semantic</span><span className="-mt-0.5 block text-[10px] tracking-[0.16em] text-[#8fa79e]">LAYER STUDIO</span></span>
        </div>
      ) : (
        <Link href="/admin" className="flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]"><Network className="size-5" strokeWidth={2.25} /></span>
          <span><span className="block text-sm font-semibold tracking-tight text-white">semantic</span><span className="-mt-0.5 block text-[10px] tracking-[0.16em] text-[#8fa79e]">LAYER STUDIO</span></span>
        </Link>
      )}
      <div className="mt-10 px-2"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#72877f]">{eyebrow}</p></div>
      <nav className="mt-3 space-y-1">
        {items.map(({ label, path, icon: Icon }) => {
          const active = location === path;
          return <Link key={path} href={path} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active ? "bg-[#234054] text-white shadow-[inset_0_0_0_1px_rgba(190,225,211,0.08)]" : "text-[#a9bbb5] hover:bg-[#193244] hover:text-white"}`}><Icon className="size-4" />{label}</Link>;
        })}
      </nav>
      <div className="mt-8 rounded-xl border border-[#2a4555] bg-[#172f40] p-3.5"><div className="flex gap-2.5"><span className="grid size-7 place-items-center rounded-md bg-[#24475a] text-[#a8d8c2]"><ShieldCheck className="size-4" /></span><div><p className="text-xs font-semibold text-[#e7f1ed]">Evidence-first</p><p className="mt-1 text-[10px] leading-4 text-[#8fa79e]">Every definition, connection, and result carries a reviewable evidence trail.</p></div></div></div>
      <div className="mt-auto border-t border-[#2a4555] pt-5"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#a9bbb5] transition-colors hover:bg-[#193244] hover:text-white"><Settings2 className="size-4" /> Workspace settings</button><p className="mt-5 px-3 text-[10px] leading-4 text-[#72877f]">Portable deployment · secret-free profiles</p></div>
    </aside>
  );
}
