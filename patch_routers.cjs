const fs = require('fs');
let code = fs.readFileSync('server/routers.ts', 'utf8');

// Imports
code = code.replace(
  'import { adminProcedure, publicProcedure, router, stewardProcedure } from "./_core/trpc";',
  'import { adminProcedure, publicProcedure, protectedProcedure, router, stewardProcedure } from "./_core/trpc";'
);

// Endpoints
code = code.replace(/    chat: publicProcedure/g, '    chat: protectedProcedure');
code = code.replace(/    validate: publicProcedure/g, '    validate: protectedProcedure');
code = code.replace(/    demo: publicProcedure/g, '    demo: protectedProcedure');
code = code.replace(/    run: publicProcedure/g, '    run: protectedProcedure');
code = code.replace(/    history: publicProcedure/g, '    history: protectedProcedure');
code = code.replace(/    feedback: publicProcedure/g, '    feedback: protectedProcedure');
code = code.replace(/    uploadDataset: publicProcedure/g, '    uploadDataset: protectedProcedure');
code = code.replace(/    uploadDocument: publicProcedure/g, '    uploadDocument: protectedProcedure');

code = code.replace(/    sources: publicProcedure/g, '    sources: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    definitions: publicProcedure/g, '    definitions: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    definitionEvents: publicProcedure/g, '    definitionEvents: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    datasets: publicProcedure/g, '    datasets: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    evaluationRuns: publicProcedure/g, '    evaluationRuns: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    evaluationTrends: publicProcedure/g, '    evaluationTrends: stewardProcedure(["viewer", "editor", "approver"])');
code = code.replace(/    automationState: publicProcedure/g, '    automationState: stewardProcedure(["viewer", "editor", "approver"])');

fs.writeFileSync('server/routers.ts', code);
