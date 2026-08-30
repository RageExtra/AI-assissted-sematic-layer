const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');
code = code.replace(
  'function generateId() {\n  return Date.now() + Math.floor(Math.random() * 1000);\n}',
  'import { randomInt } from "crypto";\n\nfunction generateId() {\n  return Date.now() + randomInt(1000, 9999);\n}'
);
fs.writeFileSync('server/db.ts', code);
