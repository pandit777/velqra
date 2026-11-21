const crypto = require('crypto');

const sha512 = value => crypto.createHash('sha512').update(value).digest('hex');

const createPayuRequestHash = ({
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  salt
}) => sha512([
  key, txnid, amount, productinfo, firstname, email,
  udf1, udf2, udf3, udf4, udf5,
  '', '', '', '', '',
  salt
].join('|'));

const createPayuResponseHash = ({
  additionalCharges,
  status,
  txnid,
  key,
  amount,
  productinfo,
  firstname,
  email,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = ''
}, salt) => sha512([
  ...(additionalCharges ? [additionalCharges] : []),
  salt,
  status,
  '', '', '', '', '',
  udf5, udf4, udf3, udf2, udf1,
  email, firstname, productinfo, amount, txnid, key
].join('|'));

module.exports = { createPayuRequestHash, createPayuResponseHash };
