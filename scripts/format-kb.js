'use strict';

const fs   = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '../data/faq-kb.json');
const data    = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));

const lines = data.map(item => {
  const kw  = JSON.stringify(item.keywords);
  const law = item.law === null ? 'null' : JSON.stringify(item.law);
  return [
    '  {',
    `    "id": ${JSON.stringify(item.id)}, "category": ${JSON.stringify(item.category)},`,
    `    "keywords": ${kw},`,
    `    "question": ${JSON.stringify(item.question)},`,
    `    "answer": ${JSON.stringify(item.answer)},`,
    `    "law": ${law}, "escalate": ${item.escalate}, "sensitive": ${item.sensitive}`,
    '  }',
  ].join('\n');
});

const output = '[\n' + lines.join(',\n') + '\n]\n';
fs.writeFileSync(KB_PATH, output, 'utf8');
console.log(`포맷 완료 — ${data.length}건, ${output.length} bytes`);
