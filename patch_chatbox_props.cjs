const fs = require('fs');
let code = fs.readFileSync('client/src/components/AIChatBox.tsx', 'utf8');

if (!code.includes('onFileUpload?:')) {
  code = code.replace(
    'export type AIChatBoxProps = {',
    'export type AIChatBoxProps = {\n  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;\n  isUploadingFile?: boolean;'
  );
}

if (!code.includes('onFileUpload,')) {
  code = code.replace(
    'export function AIChatBox({\n  messages,\n  onSendMessage,\n  isLoading = false,\n  placeholder = "Type your message...",\n  className,',
    'export function AIChatBox({\n  messages,\n  onSendMessage,\n  isLoading = false,\n  placeholder = "Type your message...",\n  className,\n  onFileUpload,\n  isUploadingFile,'
  );
}

fs.writeFileSync('client/src/components/AIChatBox.tsx', code);
