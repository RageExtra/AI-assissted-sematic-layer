import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Network } from "lucide-react";

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am your AI assistant. I can answer questions about the unstructured documents you uploaded or help you with general queries." }
  ]);

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
          />
        </div>
      </main>
    </div>
  );
}
