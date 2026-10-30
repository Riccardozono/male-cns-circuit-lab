'use strict';
const {test} = require('node:test'), assert = require('node:assert/strict'), {Worker} = require('node:worker_threads');
test('physical pool can be imported by a different worker without running its entry point', async () => {
  const file = require.resolve('./physical-rollout-pool.cjs'), messages = [];
  const worker = new Worker(`const {parentPort}=require('node:worker_threads');const p=require(${JSON.stringify(file)});parentPort.postMessage({ready:typeof p.setup==='function'});`,
    {eval: true, workerData: {sourceHashes: {}}});
  worker.on('message', m => messages.push(m));
  const exit = await new Promise((resolve, reject) => {worker.once('error', reject); worker.once('exit', resolve);});
  assert.equal(exit, 0); assert.deepEqual(messages, [{ready: true}]);
});
