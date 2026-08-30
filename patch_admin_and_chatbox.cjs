const fs = require('fs');

// Fix AIChatBox.tsx
let code = fs.readFileSync('client/src/components/AIChatBox.tsx', 'utf8');
code = code.replace(
  'import { Loader2, Send, User, Sparkles } from "lucide-react";',
  'import { Loader2, Send, User, Sparkles, Paperclip } from "lucide-react";'
);
fs.writeFileSync('client/src/components/AIChatBox.tsx', code);

// Fix Admin.tsx
let adminCode = fs.readFileSync('client/src/pages/Admin.tsx', 'utf8');

const search = `  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: (data) => {
      toast.success(\`Dataset uploaded! Auto-generated \${data.definitionsCreated} semantic definitions.\`);
      refetchDefs();
    },
    onError: () => toast.error("Dataset upload failed."),
  });`;

const replace = `  const uploadMutation = trpc.semantic.uploadDataset.useMutation({
    onSuccess: (data) => {
      toast.success(\`Dataset uploaded! Auto-generated \${data.definitionsCreated} semantic definitions.\`);
      refetchDefs();
    },
    onError: () => toast.error("Dataset upload failed."),
  });

  const uploadDocMutation = trpc.semantic.uploadDocument.useMutation({
    onSuccess: (data) => {
      toast.success(\`Document uploaded! Generated \${data.chunksGenerated} RAG chunks.\`);
      refetchDefs();
    },
    onError: () => toast.error("Document upload failed."),
  });`;

adminCode = adminCode.replace(search, replace);
fs.writeFileSync('client/src/pages/Admin.tsx', adminCode);
