import { getDb } from "./db.js";
import { generateEmbedding, cosineSimilarity } from "./_core/vector.js";

export type KGEdge = {
  source: string;
  relation: string;
  target: string;
  attributes?: Record<string, any>;
  embedding?: number[];
};

export async function insertKnowledgeGraphEdges(edges: KGEdge[]) {
  const db = await getDb();
  if (!db || edges.length === 0) return;
  
  // Generate embeddings for the edges for semantic search
  const edgesWithEmbeddings = await Promise.all(edges.map(async (edge) => {
    const text = `${edge.source} ${edge.relation} ${edge.target}`;
    const embedding = await generateEmbedding(text);
    return { ...edge, embedding, createdAt: new Date().toISOString() };
  }));

  await db.collection("knowledgeGraph").insertMany(edgesWithEmbeddings);
}

export async function searchKnowledgeGraph(query: string, topK: number = 5) {
  const db = await getDb();
  if (!db) return [];
  
  const queryEmbedding = await generateEmbedding(query);
  if (queryEmbedding.length === 0) return [];
  
  const edges = await db.collection("knowledgeGraph").find({}).toArray();
  
  const scored = edges.map(edge => ({
    ...edge,
    score: edge.embedding ? cosineSimilarity(queryEmbedding, edge.embedding) : 0
  }));
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
