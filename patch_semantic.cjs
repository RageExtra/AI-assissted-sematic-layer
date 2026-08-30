const fs = require('fs');
let code = fs.readFileSync('server/semanticEngine.ts', 'utf8');
code = code.replace(
  'id: `demo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,',
  'id: `demo_${Date.now()}_${crypto.randomUUID().split("-")[0]}`, // Fixed audit finding'
);
if (!code.includes('crypto.randomUUID')) {
    code = 'import crypto from "crypto";\n' + code;
}
fs.writeFileSync('server/semanticEngine.ts', code);
