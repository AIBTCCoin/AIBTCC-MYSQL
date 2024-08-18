const EC = require('elliptic').ec;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ec = new EC('secp256k1');
const WALLET_DIR = path.join(__dirname, 'wallets');

if (!fs.existsSync(WALLET_DIR)) {
  fs.mkdirSync(WALLET_DIR);
}

function createNewWallet() {
  const key = ec.genKeyPair();
  const publicKey = key.getPublic('hex');
  const privateKey = key.getPrivate('hex');
  
  // Hash the public key
  const publicKeyBuffer = Buffer.from(publicKey, 'hex');
  const hash = crypto.createHash('sha256').update(publicKeyBuffer).digest('hex');
  
  // Truncate the hash to create a shorter address
  const shortAddress = hash.slice(0, 30); // Adjust length as needed

  // Save the wallet to a file with the address included
  const walletData = {
    publicKey,
    privateKey,
    address: shortAddress
  };
  const walletPath = path.join(WALLET_DIR, `${shortAddress}.json`);
  fs.writeFileSync(walletPath, JSON.stringify(walletData, null, 2)); // Pretty-print JSON

  console.log(`New wallet created with address: ${shortAddress}`);
  return walletData;
}

function loadWallet(address) {
  const walletPath = path.join(WALLET_DIR, `${address}.json`);
  if (!fs.existsSync(walletPath)) {
    throw new Error('Wallet not found.');
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  return walletData;
}

module.exports = { createNewWallet, loadWallet, ec };




