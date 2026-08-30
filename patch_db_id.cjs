const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');
code = code.replace(
  'function generateId() {\n  return Date.now() + Math.floor(Math.random() * 1000);\n}',
  'import { randomUUID } from "crypto";\n\nfunction generateId() {\n  return randomUUID();\n}'
);
fs.writeFileSync('server/db.ts', code);
