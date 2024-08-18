const assert = require('assert');
const crypto = require('crypto');
const EC = require('elliptic').ec;
const { Transaction } = require('../src/blockchain'); // Adjust the path to the blockchain module

const ec = new EC('secp256k1');

// Helper function to create a key pair and address
function generateKeyPair() {
  const keyPair = ec.genKeyPair();
  const publicKey = keyPair.getPublic('hex');
  const address = getAibtccAddress(publicKey);
  return { keyPair, publicKey, address };
}

// Dummy address generation function (replace with your implementation)
function getAibtccAddress(publicKey) {
  const publicKeyBuffer = Buffer.from(publicKey, 'hex');
  const sha256Hash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
  const ripemd160Hash = crypto.createHash('ripemd160').update(sha256Hash).digest();
  const versionedPayload = Buffer.concat([Buffer.from([0x00]), ripemd160Hash]);
  const checksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(versionedPayload).digest()).digest().slice(0, 4);
  const address = Buffer.concat([versionedPayload, checksum]);
  return bs58.encode(address);
}

describe('Transaction Tests', function() {
  it('should sign and verify a transaction correctly', function() {
    const { keyPair, publicKey, address } = generateKeyPair();
    
    const transaction = new Transaction({
      fromAddress: address,
      toAddress: 'recipientAddress',
      amount: 10,
      timestamp: Date.now()
    });
    
    transaction.sign(keyPair);
    
    // Check the transaction details
    assert.ok(transaction.signature);
    
    // Validate the transaction
    const isValid = transaction.isValid();
    
    assert.strictEqual(isValid, true);
  });

  it('should detect invalid signatures', function() {
    const { keyPair, publicKey, address } = generateKeyPair();
    
    const transaction = new Transaction({
      fromAddress: address,
      toAddress: 'recipientAddress',
      amount: 10,
      timestamp: Date.now()
    });
    
    // Sign with a different keyPair to simulate invalid signature
    const differentKeyPair = ec.genKeyPair();
    transaction.sign(differentKeyPair);
    
    // Validate the transaction
    const isValid = transaction.isValid();
    
    assert.strictEqual(isValid, false);
  });

  it('should correctly calculate the hash of the transaction', function() {
    const transaction = new Transaction({
      fromAddress: 'address1',
      toAddress: 'address2',
      amount: 20,
      timestamp: 1234567890
    });
    
    const expectedHash = crypto
      .createHash('sha256')
      .update('address1address2' + 20 + 1234567890)
      .digest('hex');
    
    assert.strictEqual(transaction.calculateHash(), expectedHash);
  });

  it('should verify that address derived from public key is correct', function() {
    const { keyPair, publicKey, address } = generateKeyPair();
    
    const derivedAddress = getAibtccAddress(publicKey);
    
    assert.strictEqual(address, derivedAddress);
  });
});




