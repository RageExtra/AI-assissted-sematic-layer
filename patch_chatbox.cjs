const fs = require('fs');
let code = fs.readFileSync('client/src/components/AIChatBox.tsx', 'utf8');

// Add props
code = code.replace(
  'export interface AIChatBoxProps {',
  'export interface AIChatBoxProps {\n  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;\n  isUploadingFile?: boolean;'
);

// Add imports
code = code.replace(
  'import { Send, User, Bot, Loader2, Sparkles, Copy, Check, MousePointerClick, Zap } from "lucide-react";',
  'import { Send, User, Bot, Loader2, Sparkles, Copy, Check, MousePointerClick, Zap, Paperclip } from "lucide-react";'
);

// Add attach button in form
const searchForm = `<Textarea`;
const replaceForm = `{onFileUpload && (
          <div className="shrink-0 flex items-center justify-center">
            <input type="file" id="chat-file-upload" accept=".json,.pdf,.txt" className="hidden" onChange={onFileUpload} disabled={isUploadingFile} />
            <label htmlFor="chat-file-upload">
              <Button type="button" variant="outline" size="icon" className="h-[38px] w-[38px] cursor-pointer" disabled={isUploadingFile} asChild>
                <span>
                  {isUploadingFile ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
                </span>
              </Button>
            </label>
          </div>
        )}
        <Textarea`;
code = code.replace(searchForm, replaceForm);

fs.writeFileSync('client/src/components/AIChatBox.tsx', code);
