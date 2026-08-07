const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectStableSample } = require('./collect-metrics');

function agent(btcAddress) {
  return { btcAddress };
}

test('selectStableSample is stable when API result ordering changes', () => {
  const agents = [
    agent('btc-z'),
    agent('btc-c'),
    agent('btc-a'),
    agent('btc-b')
  ];
  const reorderedAgents = [
    agent('btc-b'),
    agent('btc-z'),
    agent('btc-a'),
    agent('btc-c')
  ];

  assert.deepEqual(
    selectStableSample(agents, 3).map(item => item.btcAddress),
    ['btc-a', 'btc-b', 'btc-c']
  );
  assert.deepEqual(
    selectStableSample(reorderedAgents, 3).map(item => item.btcAddress),
    ['btc-a', 'btc-b', 'btc-c']
  );
});

test('selectStableSample preserves an existing cohort and backfills missing addresses', () => {
  const agents = [
    agent('btc-a'),
    agent('btc-b'),
    agent('btc-c'),
    agent('btc-d')
  ];
  const cohort = ['btc-c', 'btc-missing', 'btc-a'];

  assert.deepEqual(
    selectStableSample(agents, 3, cohort).map(item => item.btcAddress),
    ['btc-c', 'btc-a', 'btc-b']
  );
});
