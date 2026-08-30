import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am your AI assistant. I can answer questions about the unstructured documents you uploaded or help you with general queries." }
  ]);

  const uploadDocMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: (data) => {
      toast.success(`Document uploaded! Generated ${data.chunksGenerated} RAG chunks.`);
      setMessages(prev => [...prev, { role: "assistant", content: "I have successfully processed your document! You can now ask me questions about it." }]);
    },
    onError: () => toast.error("Document upload failed."),
  });

  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: (data) => {
      toast.success(`Dataset uploaded! Auto-generated ${data.definitionsCreated} semantic definitions.`);
      setMessages(prev => [...prev, { role: "assistant", content: "I have processed your JSON dataset. Try asking queries about it!" }]);
    },
    onError: () => toast.error("Dataset upload failed."),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.name.toLowerCase().endsWith(".pdf") || file.name.toLowerCase().endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = (event.target?.result as string).split(',')[1];
        uploadDocMutation.mutate({ name: file.name, fileType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain"), base64Data });
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        uploadMutation.mutate({ name: file.name.replace(".json", ""), data: json });
      } catch (err) {
        toast.error("Invalid file. Please upload a JSON array or a PDF/TXT document.");
      }
    };
    reader.readAsText(file);
  };

  const chatMutation = trpc.ai.chat.useMutation({
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.choices[0].message.content as string,
        },
      ]);
    },
    onError: (error) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `**Error:** Failed to get response. (${error.message})`,
        },
      ]);
    }
  });

  const handleSendMessage = (content: string) => {
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    chatMutation.mutate({ messages: newMessages });
  };

  return (
    <div className="flex flex-col h-screen bg-[#f5f4ef] text-[#112235]">
      <header className="flex shrink-0 w-full h-[72px] items-center justify-between border-b border-[#dfe3df] bg-[#faf9f5]/95 px-5 backdrop-blur lg:px-9">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-[#dff0e6] text-[#143f31] shadow-[0_8px_22px_rgba(0,0,0,0.18)]">
            <Network className="size-5" strokeWidth={2.25} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-[#102130]">AI Chatbot</p>
          </div>
        </div>
        <div className="flex gap-4">
          <a href="/" className="text-xs font-semibold text-[#68767e] hover:text-[#112235] transition-colors">Semantic Query</a>
          <a href="/admin" className="text-xs font-semibold text-[#68767e] hover:text-[#112235] transition-colors">Admin Portal &rarr;</a>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-4 sm:p-6 w-full max-w-5xl mx-auto">
        <div className="h-full rounded-2xl border border-[#dfe3df] bg-white shadow-[0_10px_35px_rgba(24,45,57,0.045)] overflow-hidden">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSendMessage}
            isLoading={chatMutation.isPending}
            height="100%"
            placeholder="Ask a question about the documents..."
            onFileUpload={handleFileUpload}
            isUploadingFile={uploadDocMutation.isPending || uploadMutation.isPending}
          />
        </div>
      </main>
    </div>
  );
}
