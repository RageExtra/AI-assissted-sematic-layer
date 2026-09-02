import { invokeLLM } from './server/_core/llm';
async function test() {
  const q1 = 'What does EBITDA mean';
  const q2 = 'How many rows are in the dataset';
  const p1 = 'Answer ONLY YES or NO. Does this question require analyzing an uploaded business dataset, spreadsheet, or company document? Question: ' + q1;
  const p2 = 'Answer ONLY YES or NO. Does this question require analyzing an uploaded business dataset, spreadsheet, or company document? Question: ' + q2;
  const r1 = await invokeLLM({ messages: [{ role: 'user', content: p1 }] });
  const r2 = await invokeLLM({ messages: [{ role: 'user', content: p2 }] });
  console.log('Q1:', r1.choices[0]?.message.content);
  console.log('Q2:', r2.choices[0]?.message.content);
}
test();
