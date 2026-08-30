const fs = require('fs');
let code = fs.readFileSync('shared/governance.ts', 'utf8');
code = code.replace(/id: number;/g, 'id: string;');
code = code.replace(/id: number,/g, 'id: string,');
code = code.replace(/datasetId: number;/g, 'datasetId: string;');
code = code.replace(/datasetId: number,/g, 'datasetId: string,');
code = code.replace(/scheduleId: number \| null;/g, 'scheduleId: string | null;');
code = code.replace(/evaluationRunId: number;/g, 'evaluationRunId: string;');
fs.writeFileSync('shared/governance.ts', code);
