const fs = require('fs');
let code = fs.readFileSync('server/db.ts', 'utf8');

// Patch updateDefinition
const updateDefSearch = `  await db.collection("semanticDefinitions").updateOne({ id }, {
    $set: {
      description: input.description ?? current.description,
      expression: input.expression ?? current.expression,
      aliases: input.aliases ?? current.aliases,
      rationale: input.rationale ?? current.rationale,
      status: input.status ?? current.status,
      version,
      updatedAt: now
    }
  });

  await db.collection("definitionEvents").insertOne({
    id: generateId(),
    definitionId: id,
    eventType,
    version,
    rationale: input.rationale ?? current.rationale,
    createdAt: now
  });`;

const updateDefReplace = `  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("semanticDefinitions").updateOne({ id }, {
        $set: {
          description: input.description ?? current.description,
          expression: input.expression ?? current.expression,
          aliases: input.aliases ?? current.aliases,
          rationale: input.rationale ?? current.rationale,
          status: input.status ?? current.status,
          version,
          updatedAt: now
        }
      }, { session });

      await db.collection("definitionEvents").insertOne({
        id: generateId(),
        definitionId: id,
        eventType,
        version,
        rationale: input.rationale ?? current.rationale,
        createdAt: now
      }, { session });
    });
  } finally {
    await session.endSession();
  }`;

code = code.replace(updateDefSearch, updateDefReplace);

// Patch createDatasetWithCases
const createDatasetSearch = `  const datasetDoc = {
    id: datasetId,
    name,
    description: description ?? "",
    createdAt: new Date().toISOString()
  };
  await db.collection("evaluationDatasets").insertOne(datasetDoc);

  const caseDocs = cases.map(c => ({
    id: generateId(),
    datasetId,
    query: c.query,
    expectedType: c.expectedType,
    expectedCount: c.expectedCount,
    expectedSql: c.expectedSql,
    createdAt: new Date().toISOString()
  }));

  await db.collection("evaluationCases").insertMany(caseDocs);`;

const createDatasetReplace = `  const datasetDoc = {
    id: datasetId,
    name,
    description: description ?? "",
    createdAt: new Date().toISOString()
  };
  
  const caseDocs = cases.map(c => ({
    id: generateId(),
    datasetId,
    query: c.query,
    expectedType: c.expectedType,
    expectedCount: c.expectedCount,
    expectedSql: c.expectedSql,
    createdAt: new Date().toISOString()
  }));

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("evaluationDatasets").insertOne(datasetDoc, { session });
      await db.collection("evaluationCases").insertMany(caseDocs, { session });
    });
  } finally {
    await session.endSession();
  }`;

code = code.replace(createDatasetSearch, createDatasetReplace);

fs.writeFileSync('server/db.ts', code);
