const fs = require('fs');

let envCode = fs.readFileSync('server/_core/env.ts', 'utf8');
envCode = envCode.replace('process.env.OPENAI_BASE_URL ?? "https://api.openai.com"', 'process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"');
fs.writeFileSync('server/_core/env.ts', envCode);

let llmCode = fs.readFileSync('server/_core/llm.ts', 'utf8');
llmCode = llmCode.replace('`${ENV.openaiApiUrl.replace(/\\/$/, "")}/v1/chat/completions`', '`${ENV.openaiApiUrl.replace(/\\/$/, "")}/chat/completions`');
llmCode = llmCode.replace('? `${ENV.openaiApiUrl.replace(/\\/$/, "")}/v1/models`', '? `${ENV.openaiApiUrl.replace(/\\/$/, "")}/models`');
fs.writeFileSync('server/_core/llm.ts', llmCode);
