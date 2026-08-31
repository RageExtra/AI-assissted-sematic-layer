import { pipeline } from "@xenova/transformers";

// Use a singleton for the pipeline
let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    });
  }
  return extractor;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const ext = await getExtractor();
    const output = await ext(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return [];
  }
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct; // Already normalized
}
