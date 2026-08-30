import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { Network } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

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
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Welcome. Upload a business or finance dataset, then ask me about it in normal language. I can also explain business terms and formulas. I will say when the uploaded data or semantic definitions are insufficient instead of inventing an answer." },
  ]);
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
      setMessages(previous => [...previous, { role: "assistant", content: "I received the dataset and started background indexing. I will let you know when its schema and semantic definitions are ready." }]);
    },
    onError: error => toast.error(error.message || "Dataset upload failed."),
  });

  const uploadDocumentMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: data => {
      toast.success(`Document indexed: ${data.chunksGenerated} chunks`);
      setMessages(previous => [...previous, { role: "assistant", content: `I indexed **${data.chunksGenerated} searchable document sections**. Ask me to explain a term or find a policy, definition, or business rule from the uploaded material.` }]);
    },
    onError: error => toast.error(error.message || "Document upload failed."),
  });

  useEffect(() => {
    const job = datasetJobQuery.data;
    if (!job || !datasetJobId || job.status === "queued" || job.status === "processing" || handledJobId === datasetJobId) return;
    setHandledJobId(datasetJobId);
    if (job.status === "failed") {
      setMessages(previous => [...previous, { role: "assistant", content: `Dataset indexing failed: ${job.error ?? "Unknown processing error"}` }]);
      return;
    }
    const result = job.result;
    if (!result) return;
    const fields = Object.keys(result.schema).slice(0, 6).join(", ");
    setMessages(previous => [...previous, { role: "assistant", content: `Your dataset is ready. I indexed **${result.rowCount.toLocaleString()} rows** across **${result.fieldCount} fields** and generated **${result.definitionsCreated} semantic definitions** for review.\\n\\nDetected fields include: ${fields}${result.fieldCount > 6 ? ", and more" : ""}. You can now ask questions such as “What was total revenue by region?” or “Explain EBITDA.”` }]);
  }, [datasetJobId, datasetJobQuery.data, handledJobId]);

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: response => {
      const answer = response.choices[0]?.message.content;
      setMessages(previous => [...previous, { role: "assistant", content: typeof answer === "string" ? answer : "I could not produce a grounded answer. Please rephrase your question." }]);
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
        <a href="/admin" className="text-xs font-semibold text-[#68767e] transition-colors hover:text-[#112235]">Background workspace →</a>
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
