import { generateEmbedding } from './server/_core/vector.ts';

async function run() {
  console.log("Starting generateEmbedding");
  try {
    const result = await generateEmbedding("hello");
    console.log("Finished:", result.slice(0, 5));
  } catch(e) {
    console.log(e);
  }
}

run();
