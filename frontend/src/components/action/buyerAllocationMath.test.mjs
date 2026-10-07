import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBuyerAllocation } from './buyerAllocationMath.ts';

test('considers existing positions and allocates to the target deficit', () => {
  const result = calculateBuyerAllocation([
    { ticker: 'AAA', targetWeight: 50, currentUnits: 8, price: 100 },
    { ticker: 'BBB', targetWeight: 50, currentUnits: 0, price: 100 },
  ], 200);

  assert.equal(result.rows[0].suggested, 0);
  assert.equal(result.rows[1].suggested, 2);
  assert.equal(result.spent, 200);
  assert.equal(result.remaining, 0);
});

test('uses affordable whole units after the proportional split', () => {
  const result = calculateBuyerAllocation([
    { ticker: 'AAA', targetWeight: 50, currentUnits: 0, price: 60 },
    { ticker: 'BBB', targetWeight: 50, currentUnits: 0, price: 60 },
  ], 100);

  assert.equal(result.rows[0].suggested + result.rows[1].suggested, 1);
  assert.equal(result.spent, 60);
  assert.equal(result.remaining, 40);
});

test('never spends more than the entered amount and handles an amount below prices', () => {
  const result = calculateBuyerAllocation([
    { ticker: 'AAA', targetWeight: 70, currentUnits: 0, price: 100 },
    { ticker: 'BBB', targetWeight: 30, currentUnits: 0, price: 200 },
  ], 50);

  assert.equal(result.spent, 0);
  assert.equal(result.remaining, 50);
  assert.ok(result.spent <= 50);
});
