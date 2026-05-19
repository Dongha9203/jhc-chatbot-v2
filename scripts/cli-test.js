'use strict';

const { TFIDFEmbedder } = require('../src/vectordb/embedder');
const { classifier } = require('../src/engine/situation-classifier');
const { trapValidator } = require('../src/engine/trap-validator');
const { responseBuilder } = require('../src/tone/response-builder');
const FAQ = require('../src/kb/faq-data');
const { koreanUtils } = require('../src/utils/korean-utils');
const readline = require('readline');

const emb = new TFIDFEmbedder();
emb.fit(FAQ.map(f => f.question + ' ' + f.answer + ' ' + f.keywords.join(' ')));

function search(query) {
  const qv = emb.transform(query);
  return FAQ
    .map(f => ({
      ...f,
      score: emb.cosineSimilarity(qv, emb.transform(f.question + ' ' + f.answer + ' ' + f.keywords.join(' '))),
    }))
    .sort((a, b) => b.score - a.score)
    .filter(r => r.score > 0.05)
    .slice(0, 3);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '고객 > ' });
console.log('🍯 Honey 테스트 시작 (exit로 종료)\n');
rl.prompt();

rl.on('line', line => {
  const input = line.trim();
  if (!input) { rl.prompt(); return; }
  if (input === 'exit') process.exit(0);

  const norm    = koreanUtils.normalize(input);
  const cls     = classifier.classify(norm);
  const results = search(norm);
  const resp    = responseBuilder.build({ situation: cls.situation, searchResults: results, userName: '테스트', channel: 'kakao' });

  console.log('\n🍯 Honey:', resp);
  if (results[0]) console.log('   📎', results[0].id, '| 점수:', results[0].score.toFixed(3));
  console.log('   [상황:', cls.situation, ']\n');
  rl.prompt();
});
