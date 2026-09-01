import { streamBusinessQuestion } from './server/datasetEngine.ts';

async function test() {
  console.log("Starting...");
  const stream = streamBusinessQuestion([{role: "user", content: "hello"}], undefined);
  console.log("Got stream...");
  for await (const chunk of stream) {
    console.log("Chunk:", chunk);
  }
  console.log("Done!");
}
test();
