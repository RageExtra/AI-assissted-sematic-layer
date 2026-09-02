import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Network, Plus, Trash2, Clock, ChevronRight, MessageSquare , Menu} from "lucide-react";
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
  
  useEffect(() => {
    const saved = localStorage.getItem("semantic_chat_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatSession[];
        if (parsed.length > 0) {
          setSessions(parsed);
          setCurrentSessionId(parsed[0].id);
                    return;
        }
      } catch (e) {}
    }
    const id = crypto.randomUUID();
    setCurrentSessionId(id);
    const initial = { id, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE] };
    setSessions([initial]);
      }, []);

  const appendMessage = (msg: Message) => {
    setSessions(prevSessions => {
      const updated = prevSessions.map(s => s.id === currentSessionId ? { ...s, updatedAt: Date.now(), messages: [...s.messages, msg] } : s);
      if (!prevSessions.find(s => s.id === currentSessionId)) {
        updated.push({ id: currentSessionId, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE, msg] });
      }
      updated.sort((a, b) => b.updatedAt - a.updatedAt);
      localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
      return updated;
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
      };

  const switchChat = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(session.id);
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
                  } else {
          const newId = crypto.randomUUID();
          setCurrentSessionId(newId);
          const initial = { id: newId, updatedAt: Date.now(), messages: [DEFAULT_MESSAGE] };
                    updated.push(initial);
          localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
        }
      }
      return updated;
    });
  };
  const [datasetJobId, setDatasetJobId] = useState<string | null>(null);
  const [handledJobId, setHandledJobId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeStreams, setActiveStreams] = useState<Record<string, { isStreaming: boolean, content: string }>>({});
  const datasetJobQuery = trpc.semantic.datasetJob.useQuery(
    { jobId: datasetJobId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(datasetJobId), refetchInterval: datasetJobId ? 1000 : false },
  );

  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: data => {
      setDatasetJobId(data.jobId);
      setHandledJobId(null);
      toast.success("Dataset uploaded successfully! Processing data...");
      
    },
    onError: error => toast.error(error.message || "Dataset upload failed."),
  });

  const uploadDocumentMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: data => {
      toast.success("Document processed successfully!");
      
    },
    onError: error => toast.error(error.message || "Document upload failed."),
  });

  useEffect(() => {
    const job = datasetJobQuery.data;
    if (!job || !datasetJobId || job.status === "queued" || job.status === "processing" || handledJobId === datasetJobId) return;
    setHandledJobId(datasetJobId);
    if (job.status === "failed") {
      appendMessage({ role: "assistant", content: `There was an issue processing your dataset: ${job.error ?? "Unknown error"}` });
      return;
    }
    const result = job.result;
    if (!result) return;
    const fields = Object.keys(result.schema).slice(0, 6).join(", ");
    appendMessage({ role: "assistant", content: `I've successfully processed your dataset! It contains **${result.rowCount.toLocaleString()} rows** of data.\n\nI can see fields like ${fields}${result.fieldCount > 6 ? ", and more" : ""}. You can now ask me to analyze this data or ask specific questions like "What are the key trends?"` });
  }, [datasetJobId, datasetJobQuery.data, handledJobId]);

  const processFile = async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (file.size > 25 * 1024 * 1024) return reject(new Error("Files are limited to 25 MB."));
      const lowerName = file.name.toLowerCase();
      
      if (lowerName.endsWith(".json") || lowerName.endsWith(".csv") || lowerName.endsWith(".tsv")) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const raw = String(reader.result ?? "");
            const data = lowerName.endsWith(".json") ? JSON.parse(raw) : parseDelimited(raw, lowerName.endsWith(".tsv") ? "\t" : ",");
            if (!Array.isArray(data)) throw new Error("JSON must contain an array of row objects.");
            await uploadMutation.mutateAsync({ name: file.name, data });
            resolve();
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Could not parse the file."));
          }
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const result = String(reader.result ?? "");
            const base64Data = result.includes(",") ? result.split(",", 2)[1] : result;
            await uploadDocumentMutation.mutateAsync({ name: file.name, fileType: file.type || "application/octet-stream", base64Data });
            resolve();
          } catch(e) {
            reject(e instanceof Error ? e : new Error("Could not upload document."));
          }
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleSendMessage = async (content: string, stagedFile?: File | null) => {
    let finalContent = content.trim();
    if (!finalContent && stagedFile) {
      finalContent = "I have uploaded a file: " + stagedFile.name;
    }
    if (!finalContent) return;

    const targetSessionId = currentSessionId;
    const currentMsgs = sessions.find(s => s.id === targetSessionId)?.messages || [DEFAULT_MESSAGE];
    const userMsg = { 
      role: "user" as const, 
      content: finalContent,
      ...(stagedFile ? { attachmentName: stagedFile.name } : {})
    };
    const nextMessages = [...currentMsgs, userMsg];
    
    setSessions(prev => {
      const updated = prev.map(s => s.id === targetSessionId ? { ...s, messages: [...s.messages, userMsg], updatedAt: Date.now() } : s);
      localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
      return updated;
    });

    if (stagedFile) {
      try {
        await processFile(stagedFile);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "File upload failed");
        return; // stop if upload fails
      }
    }
      
    setActiveStreams(prev => ({ ...prev, [targetSessionId]: { isStreaming: true, content: "" } }));
    
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: nextMessages
        })
      });
      
      if (!response.ok || !response.body) throw new Error("Stream failed");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = "";
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.content) {
                  streamedContent += data.content;
                  setActiveStreams(prev => ({ ...prev, [targetSessionId]: { isStreaming: true, content: streamedContent } }));
                } else if (data.error) {
                  streamedContent += "\n\nError: " + data.error;
                  setActiveStreams(prev => ({ ...prev, [targetSessionId]: { isStreaming: true, content: streamedContent } }));
                }
              } catch (e) {}
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                streamedContent += data.content;
                setActiveStreams(prev => ({ ...prev, [targetSessionId]: { isStreaming: true, content: streamedContent } }));
              } else if (data.error) {
                streamedContent += "\n\nError: " + data.error;
                setActiveStreams(prev => ({ ...prev, [targetSessionId]: { isStreaming: true, content: streamedContent } }));
              }
            } catch (e) {}
          }
        }
      }
      
      setSessions(prev => {
        const updated = prev.map(s => {
          if (s.id !== targetSessionId) return s;
          return { 
            ...s, 
            messages: [...s.messages, { role: "assistant" as const, content: streamedContent || "I could not produce a grounded answer." }],
            updatedAt: Date.now()
          };
        });
        localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      setSessions(prev => {
        const updated = prev.map(s => {
          if (s.id !== targetSessionId) return s;
          return { 
            ...s, 
            messages: [...s.messages, { role: "assistant" as const, content: `I could not complete that request. ${error instanceof Error ? error.message : "Unknown error"}` }],
            updatedAt: Date.now()
          };
        });
        localStorage.setItem("semantic_chat_sessions", JSON.stringify(updated));
        return updated;
      });
    } finally {
      setActiveStreams(prev => {
        const next = { ...prev };
        delete next[targetSessionId];
        return next;
      });
    }
  };

  
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentMessages = currentSession?.messages || [DEFAULT_MESSAGE];
  const currentStream = activeStreams[currentSessionId];
  const displayMessages = currentStream?.isStreaming && currentStream.content 
    ? [...currentMessages, { role: "assistant" as const, content: currentStream.content }] 
    : currentMessages;

  return (
    <div className="flex h-screen bg-[#f5f4ef] text-[#112235] overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden w-[280px] shrink-0 flex-col border-r border-[#dfe3df] bg-[#faf9f5] sm:flex">
        <div className="flex h-[72px] shrink-0 items-center gap-3 px-5 border-b border-[#dfe3df]">
          <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31]">
            <Network className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">Semantic Layer</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#75818a]">Assistant</p>
          </div>
        </div>
        
        <div className="p-3">
          <Button variant="outline" className="w-full justify-start gap-2 bg-white" onClick={createNewChat}>
            <Plus className="size-4" /> New Chat
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 pt-0 flex flex-col gap-1">
          <p className="px-2 py-1.5 text-xs font-semibold text-[#8a969b]">Recent Chats</p>
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => switchChat(session.id)}
              className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${session.id === currentSessionId ? 'bg-[#edf4ef] text-[#143f31]' : 'hover:bg-[#f5f7f5] text-[#39505a]'}`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <MessageSquare className="size-4 shrink-0 text-[#68767e]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {session.messages.find(m => m.role === 'user')?.content || 'New Conversation'}
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
        

      </div>
      
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#dfe3df] bg-[#faf9f5]/95 px-5 backdrop-blur sm:hidden">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31]"><Network className="size-5" /></div>
            <p className="text-sm font-semibold tracking-tight">Semantic Layer</p>
          </div>
          
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <button className="grid size-9 place-items-center rounded-lg hover:bg-[#e9eeeb]">
                <Menu className="size-5 text-[#39505a]" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 flex flex-col bg-[#faf9f5]">
              <div className="p-3 border-b border-[#dfe3df]">
                <Button variant="outline" className="w-full justify-start gap-2 bg-white" onClick={() => { createNewChat(); setIsMobileMenuOpen(false); }}>
                  <Plus className="size-4" /> New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
                <p className="px-2 py-1.5 text-xs font-semibold text-[#8a969b]">Recent Chats</p>
                {sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => { switchChat(session.id); setIsMobileMenuOpen(false); }}
                    className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${session.id === currentSessionId ? 'bg-[#edf4ef] text-[#143f31]' : 'hover:bg-[#f5f7f5] text-[#39505a]'}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MessageSquare className="size-4 shrink-0 text-[#68767e]" />
                      <p className="truncate text-sm font-medium">
                        {session.messages.find(m => m.role === 'user')?.content || 'New Conversation'}
                      </p>
                    </div>
                    <Trash2 
                      className="size-4 shrink-0 text-[#94a1a6]" 
                      onClick={(e) => deleteChat(session.id, e)} 
                    />
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </header>
        
        <main className="flex-1 w-full mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-6 overflow-hidden flex flex-col">
          <AIChatBox
            messages={displayMessages}
            onSendMessage={handleSendMessage}
            isLoading={!!currentStream?.isStreaming}
            height="100%"
            placeholder="Ask about your data or explain a business term..."
            
            isUploadingFile={uploadMutation.isPending || uploadDocumentMutation.isPending}
            emptyStateMessage="Upload a dataset or start a conversation"
            suggestedPrompts={["What fields are in my dataset?", "Explain EBITDA in simple terms", "What revenue trends can you find?"]}
          />
        </main>
      </div>
    </div>
  );
}
