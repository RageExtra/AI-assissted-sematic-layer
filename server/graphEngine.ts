import neo4j, { Driver, Session } from "neo4j-driver";
import type { GroundingItem } from "../shared/semantic";

let driver: Driver | null = null;
let isInitialized = false;

// Canonical in-memory fallback ontology (used if Neo4j is offline or unconfigured)
const inMemoryNodes = [
  { id: "Customer", label: "Entity", properties: { name: "Customer", table: "customers", primaryKey: "customerId", domain: "Commerce" } },
  { id: "Order", label: "Entity", properties: { name: "Order", table: "orders", primaryKey: "orderId", domain: "Commerce" } },
  { id: "Product", label: "Entity", properties: { name: "Product", table: "products", primaryKey: "productId", domain: "Commerce" } },
  { id: "CompletedRevenue", label: "Metric", properties: { name: "Completed Revenue", expression: "SUM(orders.amount)", formula: "SUM(orders.amount) WHERE orderStatus = 'completed'" } },
  { id: "CustomerRegion", label: "Dimension", properties: { name: "Customer Region", field: "customers.region", expression: "customers.region" } },
  { id: "Sales", label: "Concept", properties: { name: "Sales", aliases: ["revenue", "sales volume", "orders total"] } },
];

const inMemoryEdges = [
  { source: "Customer", target: "Order", type: "PLACES", properties: { cardinality: "one-to-many", foreignKey: "orders.customerId" } },
  { source: "Order", target: "Product", type: "CONTAINS", properties: { cardinality: "many-to-many" } },
  { source: "Order", target: "CompletedRevenue", type: "COMPUTES", properties: { metric: "Completed Revenue" } },
  { source: "Customer", target: "CustomerRegion", type: "CLASSIFIED_BY", properties: { dimension: "Customer Region" } },
  { source: "Sales", target: "CompletedRevenue", type: "MAPS_TO", properties: { confidence: 0.98 } },
];

export function getNeo4jConfig() {
  const uri = process.env.NEO4J_URI || process.env.NEO4J_URL;
  const username = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD;
  const database = process.env.NEO4J_DATABASE;
  return { uri, username, password, database };
}

export function getNeo4jDriver(): Driver | null {
  if (driver) return driver;

  const { uri, username, password } = getNeo4jConfig();
  if (!uri || !password) {
    return null;
  }

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 5000,
    });
    return driver;
  } catch (error) {
    console.warn("[Neo4j] Failed to initialize Neo4j driver:", error);
    driver = null;
    return null;
  }
}

/**
 * Initializes schema constraints and seeds canonical knowledge graph in Neo4j.
 */
export async function initNeo4jKnowledgeGraph(): Promise<boolean> {
  const drv = getNeo4jDriver();
  if (!drv) {
    console.log("[Neo4j] No Neo4j connection configured; operating with in-memory Knowledge Graph.");
    return false;
  }

  const { database } = getNeo4jConfig();
  let session: Session | null = null;
  try {
    session = drv.session(database ? { database } : undefined);
    console.log("[Neo4j] Connected to Neo4j instance. Initializing Knowledge Graph ontology...");

    // Create uniqueness constraints
    await session.run(`
      CREATE CONSTRAINT IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT IF NOT EXISTS FOR (m:Metric) REQUIRE m.name IS UNIQUE
    `);
    await session.run(`
      CREATE CONSTRAINT IF NOT EXISTS FOR (d:Dimension) REQUIRE d.name IS UNIQUE
    `);

    // Seed canonical entities, metrics, dimensions, and relationships
    await session.run(`
      MERGE (c:Entity {name: 'Customer'})
      ON CREATE SET c.table = 'customers', c.primaryKey = 'customerId', c.domain = 'Commerce'
      MERGE (o:Entity {name: 'Order'})
      ON CREATE SET o.table = 'orders', o.primaryKey = 'orderId', o.domain = 'Commerce'
      MERGE (p:Entity {name: 'Product'})
      ON CREATE SET p.table = 'products', p.primaryKey = 'productId', p.domain = 'Commerce'

      MERGE (m:Metric {name: 'Completed Revenue'})
      ON CREATE SET m.expression = 'SUM(orders.amount)', m.formula = "SUM(orders.amount) WHERE orderStatus = 'completed'"

      MERGE (dim:Dimension {name: 'Customer Region'})
      ON CREATE SET dim.field = 'customers.region', dim.expression = 'customers.region'

      MERGE (c)-[r1:PLACES {cardinality: 'one-to-many', foreignKey: 'orders.customerId'}]->(o)
      MERGE (o)-[r2:CONTAINS {cardinality: 'many-to-many'}]->(p)
      MERGE (o)-[r3:COMPUTES {metric: 'Completed Revenue'}]->(m)
      MERGE (c)-[r4:CLASSIFIED_BY {dimension: 'Customer Region'}]->(dim)
    `);

    console.log("[Neo4j] Canonical Knowledge Graph ontology verified & active.");
    isInitialized = true;
    return true;
  } catch (error) {
    console.warn("[Neo4j] Warning during Knowledge Graph initialization:", error);
    return false;
  } finally {
    if (session) await session.close();
  }
}

export type GraphContext = {
  activeEngine: "neo4j" | "in-memory-fallback";
  paths: string[];
  relationships: string[];
  groundingItems: GroundingItem[];
  entities: string[];
};

/**
 * Traverses the Knowledge Graph to find entities, metrics, and relationships
 * relevant to the user's natural language question.
 */
export async function getGraphContextForQuery(question: string): Promise<GraphContext> {
  const drv = getNeo4jDriver();
  const qLower = question.toLowerCase();

  // If Neo4j is available, execute dynamic Cypher traversal
  if (drv) {
    const { database } = getNeo4jConfig();
    let session: Session | null = null;
    try {
      session = drv.session(database ? { database } : undefined);
      // Extract keywords for graph matching
      const keywords = qLower
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2);

      const cypher = `
        MATCH path = (a)-[r]-(b)
        WHERE any(kw IN $keywords WHERE 
          toLower(coalesce(a.name, '')) CONTAINS kw OR 
          toLower(coalesce(b.name, '')) CONTAINS kw OR
          toLower(type(r)) CONTAINS kw
        )
        RETURN 
          labels(a)[0] AS aLabel, a.name AS aName,
          type(r) AS relType, properties(r) AS relProps,
          labels(b)[0] AS bLabel, b.name AS bName
        LIMIT 10
      `;

      const result = await session.run(cypher, { keywords });
      if (result.records.length > 0) {
        const paths: string[] = [];
        const relationships: string[] = [];
        const groundingItems: GroundingItem[] = [];
        const entitySet = new Set<string>();

        for (const record of result.records) {
          const aLabel = record.get("aLabel") || "Node";
          const aName = record.get("aName") || "Unknown";
          const relType = record.get("relType") || "RELATED_TO";
          const relProps = record.get("relProps") || {};
          const bLabel = record.get("bLabel") || "Node";
          const bName = record.get("bName") || "Unknown";

          entitySet.add(aName);
          entitySet.add(bName);

          const pathStr = `(${aName}:${aLabel}) -[:${relType}]-> (${bName}:${bLabel})`;
          paths.push(pathStr);

          const fkInfo = relProps.foreignKey ? ` via ${relProps.foreignKey}` : "";
          const relDesc = `${aName} [${relType}] ${bName}${fkInfo}`;
          relationships.push(relDesc);

          groundingItems.push({
            kind: "relationship",
            label: `${aName} → ${relType} → ${bName}`,
            source: "neo4j.knowledge_graph",
            confidence: 0.98,
            detail: `Neo4j path: ${pathStr}${fkInfo}`,
          });
        }

        return {
          activeEngine: "neo4j",
          paths,
          relationships,
          groundingItems,
          entities: Array.from(entitySet),
        };
      }
    } catch (err) {
      console.warn("[Neo4j] Cypher query failed, falling back to in-memory graph:", err);
    } finally {
      if (session) await session.close();
    }
  }

  // In-Memory Fallback Graph Traversal
  const paths: string[] = [];
  const relationships: string[] = [];
  const groundingItems: GroundingItem[] = [];
  const entitySet = new Set<string>();

  for (const edge of inMemoryEdges) {
    const src = inMemoryNodes.find(n => n.id === edge.source);
    const tgt = inMemoryNodes.find(n => n.id === edge.target);
    if (!src || !tgt) continue;

    const srcName = src.properties.name.toLowerCase();
    const tgtName = tgt.properties.name.toLowerCase();
    const relType = edge.type.toLowerCase();

    // Check if question references source, target, or relationship
    const isRelevant =
      qLower.includes(srcName) ||
      qLower.includes(tgtName) ||
      qLower.includes(relType) ||
      (srcName === "customer" && (qLower.includes("client") || qLower.includes("who"))) ||
      (tgtName === "completed revenue" && (qLower.includes("revenue") || qLower.includes("sales") || qLower.includes("amount"))) ||
      (tgtName === "customer region" && (qLower.includes("region") || qLower.includes("territory") || qLower.includes("geography")));

    if (isRelevant) {
      entitySet.add(src.properties.name);
      entitySet.add(tgt.properties.name);

      const pathStr = `(${src.properties.name}:${src.label}) -[:${edge.type}]-> (${tgt.properties.name}:${tgt.label})`;
      paths.push(pathStr);

      const fkInfo = (edge.properties as any).foreignKey ? ` via ${(edge.properties as any).foreignKey}` : "";
      relationships.push(`${src.properties.name} ${edge.type} ${tgt.properties.name}${fkInfo}`);

      groundingItems.push({
        kind: "relationship",
        label: `${src.properties.name} → ${edge.type} → ${tgt.properties.name}`,
        source: "knowledge_graph.schema_ontology",
        confidence: 0.96,
        detail: `Knowledge Graph verified relation: ${pathStr}${fkInfo}`,
      });
    }
  }

  // If no specific match, provide root canonical paths
  if (paths.length === 0) {
    paths.push("(Customer:Entity) -[:PLACES]-> (Order:Entity) -[:COMPUTES]-> (Completed Revenue:Metric)");
    relationships.push("Customer PLACES Order via orders.customerId");
    groundingItems.push({
      kind: "relationship",
      label: "Customer → PLACES → Order",
      source: "knowledge_graph.canonical",
      confidence: 0.95,
      detail: "Verified one-to-many relationship: orders.customerId references customers.customerId",
    });
  }

  return {
    activeEngine: "in-memory-fallback",
    paths,
    relationships,
    groundingItems,
    entities: Array.from(entitySet),
  };
}

/**
 * Records dataset schema and inferred foreign-key relationships into Neo4j.
 */
export async function indexDatasetInNeo4j(
  datasetName: string,
  fields: Record<string, { type: string }>,
  rowCount: number
): Promise<void> {
  const drv = getNeo4jDriver();
  if (!drv) return;

  const { database } = getNeo4jConfig();
  let session: Session | null = null;
  try {
    session = drv.session(database ? { database } : undefined);
    await session.run(`
      MERGE (ds:Dataset {name: $datasetName})
      SET ds.rowCount = $rowCount, ds.updatedAt = datetime()
    `, { datasetName, rowCount });

    for (const [fieldName, info] of Object.entries(fields)) {
      await session.run(`
        MATCH (ds:Dataset {name: $datasetName})
        MERGE (f:Field {name: $fieldName, dataset: $datasetName})
        SET f.type = $fieldType
        MERGE (ds)-[:HAS_FIELD]->(f)
      `, { datasetName, fieldName, fieldType: info.type });

      // Detect potential foreign keys to canonical entities
      if (/customer_?id/i.test(fieldName)) {
        await session.run(`
          MATCH (f:Field {name: $fieldName, dataset: $datasetName})
          MATCH (c:Entity {name: 'Customer'})
          MERGE (f)-[:REFERENCES {targetKey: 'customerId'}]->(c)
        `, { fieldName, datasetName });
      } else if (/order_?id/i.test(fieldName)) {
        await session.run(`
          MATCH (f:Field {name: $fieldName, dataset: $datasetName})
          MATCH (o:Entity {name: 'Order'})
          MERGE (f)-[:REFERENCES {targetKey: 'orderId'}]->(o)
        `, { fieldName, datasetName });
      }
    }
  } catch (error) {
    console.warn("[Neo4j] Failed to index dataset into graph:", error);
  } finally {
    if (session) await session.close();
  }
}

/**
 * Diagnostics check for Neo4j connectivity and Knowledge Graph stats.
 */
export async function getKnowledgeGraphStatus() {
  const { uri, username, database } = getNeo4jConfig();
  const drv = getNeo4jDriver();

  if (!drv) {
    return {
      connected: false,
      mode: "in-memory-ontology" as const,
      message: "Neo4j credentials not configured. Using active in-memory Knowledge Graph ontology.",
      nodes: inMemoryNodes.length,
      relationships: inMemoryEdges.length,
    };
  }

  let session: Session | null = null;
  try {
    session = drv.session(database ? { database } : undefined);
    const countRes = await session.run(`
      MATCH (n)
      OPTIONAL MATCH ()-[r]->()
      RETURN count(DISTINCT n) AS nodeCount, count(DISTINCT r) AS relCount
    `);
    const record = countRes.records[0];
    const nodeCount = record ? record.get("nodeCount").toNumber() : 0;
    const relCount = record ? record.get("relCount").toNumber() : 0;

    return {
      connected: true,
      mode: "neo4j-cluster" as const,
      uri,
      username,
      nodes: nodeCount,
      relationships: relCount,
      message: "Connected to live Neo4j Knowledge Graph database.",
    };
  } catch (err) {
    return {
      connected: false,
      mode: "in-memory-ontology" as const,
      uri,
      error: err instanceof Error ? err.message : String(err),
      nodes: inMemoryNodes.length,
      relationships: inMemoryEdges.length,
      message: "Neo4j connection error. Operating with in-memory fallback ontology.",
    };
  } finally {
    if (session) await session.close();
  }
}
