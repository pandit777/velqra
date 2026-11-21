const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPayuRequestHash, createPayuResponseHash } = require('../utils/payu');

const sha512 = value => crypto.createHash('sha512').update(value).digest('hex');

const transaction = {
  key: 'test-key',
  txnid: 'TX123',
  amount: '10.00',
  productinfo: 'Test Item',
  firstname: 'Ada',
  email: 'ada@example.com'
};

test('creates the PayU request hash with all empty UDF separators', () => {
  const hash = createPayuRequestHash({ ...transaction, salt: 'test-salt' });

  assert.equal(
    hash,
    sha512('test-key|TX123|10.00|Test Item|Ada|ada@example.com|||||||||||test-salt')
  );
});

test('creates the PayU response hash with all empty UDF values', () => {
  const hash = createPayuResponseHash({
    ...transaction,
    status: 'success'
  }, 'test-salt');

  assert.equal(
    hash,
    sha512('test-salt|success|||||||||||ada@example.com|Ada|Test Item|10.00|TX123|test-key')
  );
});

test('includes PayU additional charges before the salt in response hashes', () => {
  const hash = createPayuResponseHash({
    ...transaction,
    additionalCharges: '2.00',
    status: 'success'
  }, 'test-salt');

  assert.equal(
    hash,
    sha512('2.00|test-salt|success|||||||||||ada@example.com|Ada|Test Item|10.00|TX123|test-key')
  );
});
