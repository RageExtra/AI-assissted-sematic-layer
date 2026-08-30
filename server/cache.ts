import { getDb } from "./db";

export type CachedQuery = {
  question: string;
  response: any;
  createdAt: string;
};

export async function getCachedQuery(question: string): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;
  const normalized = question.toLowerCase().trim();
  const cached = await db.collection("queryCache").findOne({ question: normalized });
  return cached ? cached.response : null;
}

export async function cacheQuery(question: string, response: any): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const normalized = question.toLowerCase().trim();
  await db.collection("queryCache").updateOne(
    { question: normalized },
    { $set: { question: normalized, response, createdAt: new Date().toISOString() } },
    { upsert: true }
  );
}
