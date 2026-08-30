const fs = require('fs');
let code = fs.readFileSync('client/src/pages/Chat.tsx', 'utf8');

// Imports
code = code.replace(
  'import { Network } from "lucide-react";',
  'import { Network } from "lucide-react";\nimport { toast } from "sonner";'
);

// Add upload state and handlers
const searchMutation = '  const chatMutation = trpc.ai.chat.useMutation({';
const replaceMutation = `  const uploadDocMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: (data) => {
      toast.success(\`Document uploaded! Generated \${data.chunksGenerated} RAG chunks.\`);
      setMessages(prev => [...prev, { role: "assistant", content: "I have successfully processed your document! You can now ask me questions about it." }]);
    },
    onError: () => toast.error("Document upload failed."),
  });

  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: (data) => {
      toast.success(\`Dataset uploaded! Auto-generated \${data.definitionsCreated} semantic definitions.\`);
      setMessages(prev => [...prev, { role: "assistant", content: "I have processed your JSON dataset. Try asking queries about it!" }]);
    },
    onError: () => toast.error("Dataset upload failed."),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.name.endsWith(".pdf") || file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = (event.target?.result as string).split(',')[1];
        uploadDocMutation.mutate({ name: file.name, fileType: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "text/plain"), base64Data });
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

  const chatMutation = trpc.ai.chat.useMutation({`;

code = code.replace(searchMutation, replaceMutation);

// Pass props to AIChatBox
const searchProps = `            placeholder="Ask a question about the documents..."`;
const replaceProps = `            placeholder="Ask a question about the documents..."
            onFileUpload={handleFileUpload}
            isUploadingFile={uploadDocMutation.isPending || uploadMutation.isPending}`;
code = code.replace(searchProps, replaceProps);

fs.writeFileSync('client/src/pages/Chat.tsx', code);
