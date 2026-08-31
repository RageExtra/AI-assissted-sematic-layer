import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Network, History, Plus, Trash2, Clock, ChevronRight, MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

interface ChatSession {
  id: string;
  updatedAt: number;
  messages: Message[];
}

const DEFAULT_MESSAGE: Message = { role: "assistant", content: "Welcome. Upload a business or finance dataset, then ask me about it in normal language. I can also explain business terms and formulas. I will say when the uploaded data or semantic definitions are insufficient instead of inventing an answer." };

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function parseDelimited(text: string, delimiter: "," | "\t") {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    const next = text[i + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = []; cell = "";
    } else cell += character;
  }
  if (quoted) throw new Error("The delimited file contains an unterminated quoted value.");
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  const headers = rows.shift()?.map(header => header || "field") ?? [];
  if (!headers.length || !rows.length) throw new Error("The file must contain a header row and at least one data row.");
  return rows.map(values => Object.fromEntries(headers.map((header, index) => {
    const value = values[index] ?? "";
    if (value === "") return [header, null];
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return [header, Number(value)];
    if (value.toLowerCase() === "true" || value.toLowerCase() === "false") return [header, value.toLowerCase() === "true"];
    return [header, value];
  })));
}

export default function Chat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("semantic_chat_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatSession[];
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
          setMessages(parsed[0].messages);
          return;
        }
      } catch (e) {}
    }
    const id = crypto.randomUUID();
    setCurrentSessionId(id);
    const initial = { id, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE] };
    setSessions([initial]);
    setMessages([DEFAULT_MESSAGE]);
  }, []);

  const appendMessage = (msg: Message) => {
    setMessages(prev => {
      const next = [...prev, msg];
      setSessions(prevSessions => {
        const updated = prevSessions.map(s => s.id === currentSessionId ? { ...s, updatedAt: Date.now(), messages: next } : s);
        if (!prevSessions.find(s => s.id === currentSessionId)) {
          updated.push({ id: currentSessionId, updatedAt: Date.now(), messages: next });
        }
        updated.sort((a, b) => b.updatedAt - a.updatedAt);
        localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
        return updated;
      });
      return next;
    });
  };

  const createNewChat = () => {
    const id = crypto.randomUUID();
    setCurrentSessionId(id);
    const initial = { id, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE] };
    setSessions(prev => {
      const updated = [initial, ...prev];
      localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
      return updated;
    });
    setMessages([DEFAULT_MESSAGE]);
  };

  const switchChat = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(session.id);
      setMessages(session.messages);
    }
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
      if (currentSessionId === id) {
        if (updated.length > 0) {
          setCurrentSessionId(updated[0].id);
          setMessages(updated[0].messages);
        } else {
          const newId = crypto.randomUUID();
          setCurrentSessionId(newId);
          const initial = { id: newId, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE] };
          setMessages([DEFAULT_MESSAGE]);
          updated.push(initial);
          localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
        }
      }
      return updated;
    });
  };
  const [datasetJobId, setDatasetJobId] = useState<string | null>(null);
  const [handledJobId, setHandledJobId] = useState<string | null>(null);
  const datasetJobQuery = trpc.semantic.datasetJob.useQuery(
    { jobId: datasetJobId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(datasetJobId), refetchInterval: datasetJobId ? 1000 : false },
  );

  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: data => {
      setDatasetJobId(data.jobId);
      setHandledJobId(null);
      toast.success("Dataset upload received; background indexing started.");
      appendMessage({ role: "assistant", content: "I received the dataset and started background indexing. I will let you know when its schema and semantic definitions are ready." });
    },
    onError: error => toast.error(error.message || "Dataset upload failed."),
  });

  const uploadDocumentMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: data => {
      toast.success(`Document indexed: ${data.chunksGenerated} chunks`);
      appendMessage({ role: "assistant", content: `I indexed **${data.chunksGenerated} searchable document sections**. Ask me to explain a term or find a policy, definition, or business rule from the uploaded material.` });
    },
    onError: error => toast.error(error.message || "Document upload failed."),
  });

  useEffect(() => {
    const job = datasetJobQuery.data;
    if (!job || !datasetJobId || job.status === "queued" || job.status === "processing" || handledJobId === datasetJobId) return;
    setHandledJobId(datasetJobId);
    if (job.status === "failed") {
      appendMessage({ role: "assistant", content: `Dataset indexing failed: ${job.error ?? "Unknown processing error"}` });
      return;
    }
    const result = job.result;
    if (!result) return;
    const fields = Object.keys(result.schema).slice(0, 6).join(", ");
    appendMessage({ role: "assistant", content: `Your dataset is ready. I indexed **${result.rowCount.toLocaleString()} rows** across **${result.fieldCount} fields** and generated **${result.definitionsCreated} semantic definitions** for review.\\n\\nDetected fields include: ${fields}${result.fieldCount > 6 ? ", and more" : ""}. You can now ask questions such as “What was total revenue by region?” or “Explain EBITDA.”` });
  }, [datasetJobId, datasetJobQuery.data, handledJobId]);

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: response => {
      const answer = response.choices[0]?.message.content;
      appendMessage({ role: "assistant", content: typeof answer === "string" ? answer : "I could not produce a grounded answer. Please rephrase your question." });
    },
    onError: error => setMessages(previous => [...previous, { role: "assistant", content: `I could not complete that request. ${error.message}` }]),
  });

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { toast.error("Files are limited to 25 MB."); return; }
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".json") || lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = String(reader.result ?? "");
          const data = lowerName.endsWith(".json") ? JSON.parse(raw) : parseDelimited(raw, lowerName.endsWith(".tsv") ? "\t" : ",");
          if (!Array.isArray(data)) throw new Error("JSON must contain an array of row objects.");
          uploadMutation.mutate({ name: file.name, data });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not parse the file.");
        }
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64Data = result.includes(",") ? result.split(",", 2)[1] : result;
      uploadDocumentMutation.mutate({ name: file.name, fileType: file.type || "application/octet-stream", base64Data });
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = (content: string) => {
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    chatMutation.mutate({ messages: nextMessages });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4ef] text-[#112235]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dfe3df] bg-[#faf9f5]/95 px-5 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31]"><Network className="size-5" /></div>
          <div><p className="text-sm font-semibold tracking-tight">Semantic Layer</p><p className="text-[10px] uppercase tracking-[0.18em] text-[#75818a]">Business intelligence assistant</p></div>
        </div>
        <div className="flex items-center gap-4">
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs font-semibold text-[#68767e] transition-colors hover:text-[#112235]">
                <History className="size-4" />
                History
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[340px] p-0 sm:w-[400px]">
              <SheetHeader className="border-b border-[#dfe3df] p-5">
                <SheetTitle className="flex items-center justify-between text-base">
                  Chat History
                  <Button variant="outline" size="sm" onClick={createNewChat} className="h-8 gap-1.5 text-xs">
                    <Plus className="size-3.5" /> New Chat
                  </Button>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 overflow-y-auto p-3 h-[calc(100vh-80px)]">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => switchChat(session.id)}
                    className={`group flex items-center justify-between rounded-lg px-3 py-3 text-left transition-colors ${session.id === currentSessionId ? 'bg-[#edf4ef] text-[#143f31]' : 'hover:bg-[#f5f7f5] text-[#39505a]'}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MessageSquare className="size-4 shrink-0 text-[#68767e]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {session.messages.find(m => m.role === 'user')?.content || 'New Conversation'}
                        </p>
                        <p className="text-[10px] text-[#8a969b]">
                          {new Date(session.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Trash2 
                      className="size-4 shrink-0 text-[#94a1a6] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100" 
                      onClick={(e) => deleteChat(session.id, e)} 
                    />
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
          <a href="/admin" className="text-xs font-semibold text-[#68767e] transition-colors hover:text-[#112235]">Background workspace &rarr;</a>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 py-3 sm:px-6 sm:py-6">
        <AIChatBox
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={chatMutation.isPending}
          height="calc(100vh - 120px)"
          placeholder="Ask about your data or explain a business term…"
          onFileUpload={handleFileUpload}
          isUploadingFile={uploadMutation.isPending || uploadDocumentMutation.isPending}
          emptyStateMessage="Upload a dataset or start a conversation"
          suggestedPrompts={["What fields are in my dataset?", "Explain EBITDA in simple terms", "What revenue trends can you find?"]}
        />
      </main>
    </div>
  );
}
