import { validateEntry, formatMoney, parseMoney, AccountingError } from './dist/index.js';
import assert from 'node:assert';

console.log('🧪 Starting ESM Integration Verification for accounting-core...');

// 1. Test Money helpers
const formatted = formatMoney(125050n, 'USD');
assert.strictEqual(typeof formatted, 'string', 'formatMoney should return a string');
console.log('  ✓ formatMoney works correctly:', formatted);

const parsed = parseMoney('1250.50', 'USD');
assert.strictEqual(parsed.amount, 125050n, 'parseMoney should parse 1250.50 as 125050n cents');
console.log('  ✓ parseMoney works correctly');

// 2. Test Balanced Entry
const validEntry = {
  id: 'ent_01',
  tenantId: 'tenant_01',
  currency: 'USD',
  lines: [
    { accountId: 'acc_debit', amount: 5000n, direction: 'DEBIT' },
    { accountId: 'acc_credit', amount: 5000n, direction: 'CREDIT' }
  ]
};

const validationResult = validateEntry(validEntry);
assert.strictEqual(validationResult.isValid, true, 'Valid balanced entry must pass');
console.log('  ✓ validateEntry passed for balanced transaction');

// 3. Test Unbalanced Entry
const invalidEntry = {
  id: 'ent_02',
  tenantId: 'tenant_01',
  currency: 'USD',
  lines: [
    { accountId: 'acc_debit', amount: 5000n, direction: 'DEBIT' },
    { accountId: 'acc_credit', amount: 3000n, direction: 'CREDIT' }
  ]
};

const invalidResult = validateEntry(invalidEntry);
assert.strictEqual(invalidResult.isValid, false, 'Unbalanced entry must fail validation');
console.log('  ✓ validateEntry failed as expected for unbalanced transaction');

// 4. AccountingError is exported and usable
assert.strictEqual(new AccountingError('test').message, 'test', 'AccountingError must carry a message');
console.log('  ✓ AccountingError is exported and functional');

console.log('🎉 All ESM Integration Tests Passed Perfectly!');
