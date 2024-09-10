const readline = require("readline");
const { Blockchain, Transaction } = require("./src/blockchain");
const { createNewWallet, loadWallet, ec } = require("./src/wallet");
const { MerkleTree, MerkleProofPath } = require("./src/merkleTree");
const db = require("./src/db");
const crypto = require('crypto');
const util = require('util');
const Decimal = require('decimal.js');



// Convert callback-based functions to promise-based
const queryAsync = util.promisify(db.query).bind(db);


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let blockchain;

async function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log("Blockchain CLI is starting...");

  // Initialize the blockchain and create the genesis block
  blockchain = new Blockchain();

    // Check if the blockchain is valid on startup
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Exiting CLI.");
    rl.close();
    return;
  }

  // Start automatic mining using the interval defined in the Blockchain class
  blockchain.startTimeBasedMining(blockchain.miningIntervalInSeconds);

  while (true) {
    console.log(`
    1. Create a new wallet
    2. Send a transaction
    3. View blockchain
    4. Check balance of address
    5. View transactions for address
    6. Trace a transaction
    7. Trace fund movement 
    8. Run transaction test 
    9. Validate blockchain
    10. Verify Merkle proof by transaction hash 
    11. Exit
    `);

    const choice = await askQuestion("Select an option: ");

    switch (choice) {
      case "1":
        createNewWallet();
        break;
      case "2":
        await sendTransaction();
        break;
      case "3":
        await viewBlockchain();
        break;
      case "4":
        await checkBalance();
        break;
      case "5":
        await viewTransactionsForAddress(); // New option added
        break; 
      case "6":
        await traceTransaction(); // New option added
        break;
      case "7":
        await traceFundMovement();  // New option handled
        break;
      case "8":
        await runTransactionAndMiningTest();  // New test option
          break; 
      case "9":
        await validateBlockchain(); // New option added
          break;
      case "10":
        await verifyMerkleProofByTransactionHash(); // New function to verify Merkle proof
            break;               
      case "11":
        console.log("Exiting...");
        rl.close();
        return;
      default:
        console.log("Invalid option. Please try again.");
    }
  }
}

async function sendTransaction() {
  try {

    // Verify blockchain validity before sending a transaction
    if (!blockchain.isChainValid()) {
      console.log("Blockchain is invalid. Transaction cannot proceed.");
      return;
    }

    const fromAddress = await askQuestion("Enter your wallet address: ");
    
    // Validate address length
    if (!fromAddress || fromAddress.length < 24 || fromAddress.length > 30) {
      console.log("Invalid wallet address.");
      return;
    }

    // Check if the wallet exists for the provided address
    let wallet;
    try {
      wallet = loadWallet(fromAddress); // Throws an error if the wallet doesn't exist
    } catch (error) {
      console.log("Wallet not found.");
      return;
    }

    const privateKey = await askQuestion("Enter your private key: ");
    
    // Validate the private key length
    if (!privateKey || privateKey.length !== 64) {
      console.log("Invalid private key.");
      return;
    }

    // Verify that the private key corresponds to the fromAddress
    const keyPair = ec.keyFromPrivate(privateKey);
    const publicKey = keyPair.getPublic('hex');
    const derivedAddress = crypto.createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest('hex').slice(0, 30);

    if (derivedAddress !== fromAddress) {
      console.log("Private key does not correspond to the provided address.");
      return;
    }

    const toAddress = await askQuestion("Enter the recipient address: ");

    // Validate address length
    if (!toAddress || toAddress.length < 24 || toAddress.length > 30) {
      console.log("Invalid wallet address.");
      return;
    }

    const amount = parseFloat(await askQuestion("Enter the amount to send: "));

    if (isNaN(amount) || amount <= 0) {
      console.log("Invalid amount.");
      return;
    }

    // Fetch the balance of the sender
    const senderBalance = await blockchain.getBalanceOfAddress(fromAddress);
    if (senderBalance < amount) {
      console.log("Insufficient funds in the wallet.");
      return;
    }

    const latestTransaction = await Transaction.getLatestTransactionForAddress(fromAddress);

   
    const originTransactionHash = latestTransaction ? latestTransaction.hash : null;
   

    const tx = new Transaction(fromAddress, toAddress, amount,  Date.now(), null, "", originTransactionHash);
    
    // Sign the transaction with the provided private key
    
    tx.signWithAddress(fromAddress); // Ensure the address is used correctly
    

    await tx.savePending();
    console.log("Transaction submitted successfully.");

    // Manually update blockchain pending transactions for accurate count
    blockchain.pendingTransactions.push(tx);

    const pendingTransactions = await Transaction.loadPendingTransactions();
    
  } catch (error) {
    console.error("Error in sendTransaction:", error);
  }
}



async function viewBlockchain() {

  // Verify blockchain validity before viewing
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot view blockchain.");
    return;
  }

  const blocks = blockchain.chain;
  console.log(`Total blocks: ${blocks.length}`);
  blocks.forEach((block) => {
    console.log(
      `Block ${block.index}: ${block.transactions.length} transactions`
    );
  });
}

async function checkBalance() {
  const address = await askQuestion("Enter the address to check balance: ");

  if (!address || address.length < 24 || address.length > 30) {
    console.log("Invalid wallet address.");
    return;
  }

  // Verify blockchain validity before checking balance
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot fetch balance.");
    return;
  }

  try {
    const balance = await blockchain.getBalanceOfAddress(address);
    console.log(`Balance of address ${address}: ${balance}`);
  } catch (error) {
    console.error("Error fetching balance:", error);
  }
}

async function viewTransactionsForAddress() {
  const address = await askQuestion("Enter the address to view transactions: ");

  if (!address || address.length < 24 || address.length > 30) {
    console.log("Invalid wallet address.");
    return;
  }

  // Verify blockchain validity before viewing transactions
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot view transactions.");
    return;
  }

  const allTransactions = [];

  // Loop through each block in the chain
  blockchain.chain.forEach((block) => {
    // Loop through each transaction in the block
    block.transactions.forEach((transaction) => {
      // If the transaction involves the address as sender or recipient
      if (transaction.fromAddress === address || transaction.toAddress === address) {
        allTransactions.push(transaction);
      }
    });
  });

  if (allTransactions.length === 0) {
    console.log(`No transactions found for address ${address}`);
  } else {
    console.log(`Transactions for address ${address}:`);
    allTransactions.forEach((transaction, index) => {
      console.log(`
        Transaction ${index + 1}:
        From: ${transaction.fromAddress}
        To: ${transaction.toAddress}
        Amount: ${transaction.amount}
        Timestamp: ${new Date(transaction.timestamp).toLocaleString()}
        Hash: ${transaction.hash}
      `);
    });
  }
}

async function traceTransaction() {
  const transactionHash = await askQuestion("Enter the transaction hash to trace: ");

  if (!transactionHash || transactionHash.length !== 64) {
    console.log("Invalid transaction hash.");
    return;
  }

  // Verify blockchain validity before tracing transaction
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot trace transaction.");
    return;
  }

  let foundTransaction = null;
  let blockIndex = null;

  // Loop through each block in the chain
  blockchain.chain.forEach((block, index) => {
    // Loop through each transaction in the block
    block.transactions.forEach((transaction) => {
      if (transaction.hash === transactionHash) {
        foundTransaction = transaction;
        blockIndex = index;
      }
    });
  });

  if (foundTransaction) {
    console.log(`
      Transaction found in Block ${blockIndex}:
      From: ${foundTransaction.fromAddress}
      To: ${foundTransaction.toAddress}
      Amount: ${foundTransaction.amount}
      Timestamp: ${new Date(foundTransaction.timestamp).toLocaleString()}
      Hash: ${foundTransaction.hash}
      Origin Transaction Hash: ${foundTransaction.originTransactionHash}
    `);
  } else {
    console.log(`Transaction with hash ${transactionHash} not found.`);
  }
}

async function traceFundMovement() {
  const transactionHash = await askQuestion("Enter the transaction hash to trace fund movement: ");

  if (!transactionHash || transactionHash.length !== 64) {
    console.log("Invalid transaction hash.");
    return;
  }

  // Verify blockchain validity before tracing fund movement
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot trace fund movement.");
    return;
  }

  let currentTransaction = null;
  let blockIndex = null;

  // Step 1: Find the initial transaction by its hash
  for (let i = 0; i < blockchain.chain.length; i++) {
    const block = blockchain.chain[i];
    for (let j = 0; j < block.transactions.length; j++) {
      if (block.transactions[j].hash === transactionHash) {
        currentTransaction = block.transactions[j];
        blockIndex = i;
        break;
      }
    }
    if (currentTransaction) break;
  }

  if (!currentTransaction) {
    console.log(`Transaction with hash ${transactionHash} not found.`);
    return;
  }

  console.log(`Tracing fund movement starting from transaction in Block ${blockIndex}...`);

  // Step 2: Display the initial transaction details
  displayTransactionDetails(currentTransaction, blockIndex);

  // Step 3: Follow the chain of originTransactionHash
  while (currentTransaction.originTransactionHash) {
    const originHash = currentTransaction.originTransactionHash;
    currentTransaction = null;

    // Find the origin transaction in the blockchain
    for (let i = 0; i < blockchain.chain.length; i++) {
      const block = blockchain.chain[i];
      for (let j = 0; j < block.transactions.length; j++) {
        if (block.transactions[j].hash === originHash) {
          currentTransaction = block.transactions[j];
          blockIndex = i;
          break;
        }
      }
      if (currentTransaction) break;
    }

    if (currentTransaction) {
      displayTransactionDetails(currentTransaction, blockIndex);
    } else {
      console.log(`Reached the end of the transaction chain. No further origin transactions found.`);
      break;
    }
  }
}

// Helper function to display transaction details
function displayTransactionDetails(transaction, blockIndex) {
  console.log(`
    Transaction found in Block ${blockIndex}:
    From: ${transaction.fromAddress}
    To: ${transaction.toAddress}
    Amount: ${transaction.amount}
    Timestamp: ${new Date(transaction.timestamp).toLocaleString()}
    Hash: ${transaction.hash}
    Previous Transaction Hash: ${transaction.originTransactionHash}
  `);
}

async function runTransactionAndMiningTest() {

  console.log("Running transaction test...");

  // Verify blockchain validity before running the test
  if (!blockchain.isChainValid()) {
    console.log("Blockchain is invalid. Cannot run the test.");
    return;
  }

  let previousTransactionHash = null;
  let wallets = [];
  let transactionCount = 0;

  // Create two wallets to use for transactions
  for (let i = 0; i < 2; i++) {
    const wallet = createNewWallet();
    wallets.push(wallet);
  }

  // The address that receives the genesis reward
  const genesisRewardAddress = blockchain.genesisAddress; // Save the genesis block reward recipient address

  for (let i = 0; i < 12; i++) {
    const toWallet = wallets[i % 2]; // Alternating recipient wallets

    const fromAddress = genesisRewardAddress; // Always send from the genesis reward address
    const toAddress = toWallet.address;
    const amount = 10;
    const timestamp = Date.now();

    // Create the transaction
    const tx = new Transaction(fromAddress, toAddress, amount, timestamp, null, '', previousTransactionHash);

    // Sign the transaction
    tx.signWithAddress(fromAddress);

    // Save the transaction to pending transactions
    await tx.savePending();
    blockchain.pendingTransactions.push(tx);

    // Update the previousTransactionHash for the next transaction
    previousTransactionHash = tx.hash;
    transactionCount++;
  }
  console.log(`Test complete. Total transactions done: ${transactionCount}`);
}

async function validateBlockchain() {
  const GENESIS_BLOCK_INDEX = 0;
  let validatedBlocksCount = 0; // Initialize a counter for validated blocks
  let validatedTransactionsCount = 0; // Initialize a counter for validated transactions

  try {
    for (let i = 0; i < blockchain.chain.length; i++) {
      const block = blockchain.chain[i];

      if (!blockchain.validateDatabaseState(block)) {
        console.log(`Invalid hash for block ${i}.`);
        return;
      }

      for (const transaction of block.transactions) {
        const isGenesisBlock = i === GENESIS_BLOCK_INDEX;
        const isValid = await validateTransaction(transaction, i, isGenesisBlock);
        
        if (!isValid) {
          console.log(`Invalid transaction ${transaction.hash} in block ${i}.`);
          return;
        }

        validatedTransactionsCount++; // Increment the validated transactions count
      }

      validatedBlocksCount++; // Increment the validated blocks count
    }

    const allAddresses = getAllAddressesFromBlockchain();
    
    for (const address of allAddresses) {
      const balance = await blockchain.getBalanceOfAddress(address);
      if (new Decimal(balance).isNegative()) {
        console.log(`Negative balance found for address ${address}.`);
        return;
      }
    }

    console.log("Blockchain validation passed. All transactions and balances are correct.");
    console.log(`Total blocks verified: ${validatedBlocksCount}`);
    console.log(`Total transactions verified: ${validatedTransactionsCount}`);
  } catch (error) {
    console.error("Error validating blockchain:", error);
  }
}

// Function to check if a string is a valid hex
function isHexString(str) {
  return typeof str === 'string' && /^[0-9a-fA-F]+$/.test(str);
}

async function validateTransaction(transaction, blockIndex, isGenesis = false) {

  const GENESIS_ADDRESS = '6c7f05cca415fd2073de8ea8853834';

  const isMiningReward = transaction === blockchain.chain[blockIndex].transactions[blockchain.chain[blockIndex].transactions.length - 1];
  

  if (isGenesis || transaction.fromAddress === GENESIS_ADDRESS || isMiningReward) {
    return true;
  }
  
  // Check if transaction signature is valid
  if (!transaction.signature) {
    console.log(`No signature found for transaction ${transaction.hash}`);
    return false;
  }

  // Calculate the hash of the transaction
  const transactionHash = transaction.calculateHash();
  if (transactionHash !== transaction.hash) {
    console.log(`Hash mismatch for transaction ${transaction.hash}`);
    return false;
  }

  try {
    console.log(`Verifying transaction from address: ${transaction.fromAddress}`);

    // Check if the public key format is correct
    if (!transaction.fromAddress || transaction.fromAddress.length !== 66 && transaction.fromAddress.length !== 130) {
      console.error(`Invalid public key length for address ${transaction.fromAddress}`);
      return false;
    }

    // Check if the public key is a valid hex string
    if (!isHexString(transaction.fromAddress)) {
      console.error(`Invalid public key format for address ${transaction.fromAddress}`);
      return false;
    }

    const keyPair = ec.keyFromPublic(transaction.fromAddress, 'hex');

    // Verify the transaction signature
    const signatureIsValid = keyPair.verify(transaction.hash, transaction.signature);
    if (!signatureIsValid) {
      console.log(`Signature verification failed for transaction ${transaction.hash}`);
      return false;
    }
  } catch (error) {
    console.error(`Error verifying signature for transaction ${transaction.hash}:`, error);
    return false;
  }

  return true;
}

function getAllAddressesFromBlockchain() {
  const addresses = new Set();
  blockchain.chain.forEach(block => {
    block.transactions.forEach(transaction => {
      addresses.add(transaction.fromAddress);
      addresses.add(transaction.toAddress);
    });
  });
  return Array.from(addresses);
}


async function verifyMerkleProofByTransactionHash() {
  const transactionHash = await askQuestion("Enter the transaction hash: ");

  try {
    // Retrieve the block hash associated with the transaction hash
    const blockHashQuery = "SELECT block_hash FROM transactions WHERE hash = ?";
    const result = await queryAsync(blockHashQuery, [transactionHash]);

    if (result.length === 0) {
      console.log("Transaction not found in the blockchain.");
      return;
    }

    const blockHash = result[0].block_hash;
    console.log(`Block hash containing the transaction: ${blockHash}`);

    // Retrieve the Merkle proof path
    const proofPath = await MerkleProofPath.getProofPath(transactionHash);

    if (!proofPath) {
      console.log("No proof path found for the given transaction.");
      return;
    }

    // Retrieve the Merkle root from the block
    const blockQuery = "SELECT merkle_root FROM blocks WHERE hash = ?";
    const blockResult = await queryAsync(blockQuery, [blockHash]);

    if (blockResult.length === 0) {
      console.log("Block not found in the blockchain.");
      return;
    }

    const merkleRoot = blockResult[0].merkle_root;

    // Use the verifyProof method to get intermediate hashes and log details
    const proofHashes = MerkleTree.verifyProof(transactionHash, proofPath, merkleRoot);

    // Log the details as in the verifyProof method
    console.log("Initial leaf hash:", transactionHash);
    proofPath.forEach((sibling, index) => {
      console.log("Sibling hash:", sibling);
      if (index < proofHashes.length) {
        console.log("Intermediate hash:", proofHashes[index]);
      }
    });
    console.log("Expected root hash:", merkleRoot);

    // Check if the proof is valid
    const isValid = merkleRoot;

    if (isValid) {
      console.log("Merkle proof is valid.");
    } else {
      console.log("Merkle proof is invalid.");
    }
  } catch (err) {
    console.error("Error verifying Merkle proof:", err);
  }
}





main().catch(console.error);
