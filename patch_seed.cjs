const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

const seedSearch = `    await db.collection("semanticDefinitions").insertMany(toInsert);
    
    const events = toInsert.map(item => ({
      id: generateId(),
      definitionId: item.id,
      eventType: "created" as const,
      version: item.version,
      rationale: item.rationale,
      createdAt: new Date().toISOString()
    }));
    await db.collection("definitionEvents").insertMany(events);`;

const seedReplace = `    const events = toInsert.map(item => ({
      id: generateId(),
      definitionId: item.id,
      eventType: "created" as const,
      version: item.version,
      rationale: item.rationale,
      createdAt: new Date().toISOString()
    }));

    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection("semanticDefinitions").insertMany(toInsert, { session });
        await db.collection("definitionEvents").insertMany(events, { session });
      });
    } finally {
      await session.endSession();
    }`;

code = code.replace(seedSearch, seedReplace);
fs.writeFileSync('server/db.ts', code);
