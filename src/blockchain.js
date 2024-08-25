"use strict";

const crypto = require("crypto"); // Required for creating cryptographic hashes
const EC = require("elliptic").ec; // Required for elliptic curve cryptography
const db = require("./db"); // Database module for interacting with the database
const { Node, MerkleTree } = require("./merkleTree"); // Importing MerkleTree and Node classes
const { acquireLock, releaseLock } = require("./lock"); // Assume lock.js handles locking mechanisms

const ec = new EC("secp256k1"); // Initialize the elliptic curve for cryptography
const { createNewWallet, loadWallet } = require('./wallet'); 

class Transaction {
  constructor(
    fromAddress,
    toAddress,
    amount,
    timestamp = Date.now(),
    signature = null,
    blockHash = "",
    originTransactionHash = null
  ) {
    this.fromAddress = fromAddress; // Address sending the funds
    this.toAddress = toAddress; // Address receiving the funds
    this.amount = amount; // Amount of funds being transferred
    this.timestamp = timestamp; // Timestamp of when the transaction was created
    this.signature = signature; // Digital signature for transaction validation
    this.blockHash = blockHash; // Hash of the block this transaction is included in (if any)
    this.originTransactionHash = originTransactionHash;
    this.hash = this.calculateHash(); // Calculate the transaction hash
  }

  // Calculate the hash of the transaction
  calculateHash() {
    return crypto
      .createHash("sha256")
      .update(this.fromAddress + this.toAddress + this.amount + this.originTransactionHash + this.timestamp)
      .digest("hex");
  }

  async signWithAddress(address) {
    try {
      const wallet = loadWallet(address);
      const privateKey = wallet.privateKey;
      const keyPair = ec.keyFromPrivate(privateKey);
      
      // Sign the transaction
      const hashTx = this.calculateHash();
      console.log(`Signing transaction with hash: ${hashTx}`);
      const signature = keyPair.sign(hashTx, 'hex');
      console.log(`Generated signature: ${signature.toDER('hex')}`);
      this.signature = signature.toDER('hex');
    } catch (error) {
      throw new Error('Failed to sign with address: ' + error.message);
    }
  }
  
/*
  // Sign the transaction using the provided key pair
  sign(keyPair) {
    const hashTx = this.calculateHash(); // Get the hash of the transaction

    // Allow signing if no sender address is specified (e.g., for reward transactions)
    if (this.fromAddress && keyPair.getPublic("hex") !== this.fromAddress) {
      throw new Error("You cannot sign transactions for other wallets!");
    }

    const sig = keyPair.sign(hashTx, "hex"); // Sign the transaction hash
    this.signature = sig.toDER("hex"); // Set the signature
  }
*/
  // Validate the transaction
  isValid() {
    const hashToVerify = this.calculateHash(); // Calculate the hash to verify
    console.log(`Hash to verify: ${hashToVerify}`);
    console.log(`Transaction signature: ${this.signature}`);
    if (this.fromAddress === null) return true; // Allow transactions with no sender (e.g., mining reward)
    if (!this.signature || this.signature.length === 0) {
      throw new Error("Transaction signature is missing or invalid!");
    }
    try {
      const key = ec.keyFromPublic(this.fromAddress, "hex"); // Load the public key from the address
      const isValid = key.verify(hashToVerify, this.signature);
      console.log(`Signature validity: ${isValid}`);
      return isValid;
    } catch (error) {
      throw new Error("Transaction signature is invalid!");
    }
  }

  // Save the transaction to the database
  save() {
    this.verifyTransaction();

    console.log('Saving transaction with originTransactionHash:', this.originTransactionHash);
    return new Promise((resolve, reject) => {
      const query =
        "INSERT INTO transactions (hash, from_address, to_address, amount, origin_transaction_hash, timestamp, signature, block_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      const values = [
        this.hash,
        this.fromAddress,
        this.toAddress,
        this.amount,
        this.originTransactionHash,
        this.timestamp,
        this.signature,
        this.blockHash,
      ];
      db.query(query, values, (err, results) => {
        if (err) {
          return reject(err); // If there is an error, reject the promise
        }
        resolve(results); // Resolve with the database result
      });
    });
  }

  // Load a transaction from the database
  static async load(hash) {
    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM transactions WHERE hash = ?";
      db.query(query, [hash], (err, results) => {
        if (err) return reject(err); // If there is an error, reject the promise
        if (results.length > 0) {
          const txData = results[0]; // Get the transaction data from the result
          const tx = new Transaction(
            txData.from_address,
            txData.to_address,
            txData.amount,
            txData.timestamp,
            txData.signature,
            txData.block_hash,
            txData.origin_transaction_hash 
          );
          tx.hash = txData.hash; // Set the hash

          tx.verifyTransaction();

          resolve(tx); // Resolve with the transaction object
        } else {
          resolve(null); // If no results found, resolve with null
        }
      });
    });
  }
/*
  // Add Solana-specific transaction handling
  async executeSolanaTransaction(fromKeypair, toAddress) {
    try {
      const balance = await getBalance(fromKeypair.publicKey.toString());
      if (balance < this.amount) {
        throw new Error("Insufficient balance");
      }

      const signature = await transferSOL(fromKeypair, toAddress, this.amount);
      console.log("Transaction confirmed with signature:", signature);

      // Save the transaction to your blockchain
      await this.save();
    } catch (error) {
      console.error("Solana transaction failed:", error);
    }
  }
*/
  

  async savePending() {
    const query =
      "INSERT INTO pending_transactions (hash, from_address, to_address, amount, timestamp, signature, origin_transaction_hash) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const values = [
      this.calculateHash(),
      this.fromAddress,
      this.toAddress,
      this.amount,
      this.timestamp,
      this.signature,
      this.originTransactionHash,
    ];

    console.log(`Saving transaction with hash: ${values[0]}`);
    console.log(
      `Data to be saved: ${JSON.stringify({
        hash: values[0],
        fromAddress: values[1],
        toAddress: values[2],
        amount: values[3],
        timestamp: values[4],
        signature: values[5],
        originTransactionHash: values[6],
      })}`
    );

    return new Promise((resolve, reject) => {
      db.query(query, values, (err) => {
        if (err) {
          console.error("Error saving transaction:", err);
          reject(err);
        } else {
          console.log("Transaction saved successfully");
          resolve();
        }
      });
    });
  }
  

  // Load all pending transactions
  static async loadPendingTransactions() {
    console.log("Loading pending transactions from the database...");
    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM pending_transactions";

      db.query(query, (err, results) => {
        if (err) {
          console.error("Error loading pending transactions:", err);
          return reject(err);
        }

        console.log(`Retrieved ${results.length} pending transactions`);

        const transactions = results.map((txData) => {
          const tx = new Transaction(
            txData.from_address,
            txData.to_address,
            txData.amount,
            txData.timestamp,
            txData.signature
          );
          tx.hash = txData.hash;
          return tx;
        });

        console.log(
          "Loaded transactions:",
          transactions.map((tx) => ({
            hash: tx.hash,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            amount: tx.amount,
            timestamp: tx.timestamp,
            signature: tx.signature,
          }))
        );

        resolve(transactions);
      });
    });
  }

  // Verify that the pending transactions are saved in the database
  static async verifyPendingTransactions() {
    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM pending_transactions";
      db.query(query, (err, results) => {
        if (err) return reject(err);
        const transactions = results.map((txData) => {
          const tx = new Transaction(
            txData.from_address,
            txData.to_address,
            txData.amount,
            txData.timestamp,
            txData.signature
          );
          tx.hash = txData.hash; // Ensure hash is set here
          return tx;
        });
        console.log("Pending Transactions:", transactions);
        resolve(transactions);
      });
    });
  }
  // Get the latest transaction for a given address
  static async getLatestTransactionForAddress(address) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * 
        FROM transactions 
        WHERE from_address = ? 
        ORDER BY timestamp DESC 
        LIMIT 1
      `;
  
      db.query(query, [address], (err, results) => {
        if (err) {
          console.error("Error fetching latest transaction:", err);
          return reject(err);
        }
  
        if (results.length === 0) {
          console.log("No transactions found for address:", address);
          return resolve(null);
        }
  
        const txData = results[0];
        const tx = new Transaction(
          txData.from_address,
          txData.to_address,
          txData.amount,
          txData.timestamp,
          txData.signature,
          txData.block_hash,
          txData.origin_transaction_hash
        );
        tx.hash = txData.hash;
  
        console.log("Loaded latest transaction:", tx);
        resolve(tx);
      });
    });
  }  

  verifyTransaction() {
    const expectedHash = this.calculateHash();
    if (this.hash !== expectedHash) {
      throw new Error("Transaction hash does not match expected hash!");
    }
  }
}


class Block {
  constructor(index, previousHash, timestamp, transactions, difficulty) {
    this.index = index; // Block index in the blockchain
    this.previousHash = previousHash; // Hash of the previous block
    this.timestamp = timestamp; // Timestamp of when the block was created
    this.transactions = transactions; // Array of transactions in this block
    this.difficulty = difficulty; // Mining difficulty for this block
    this.merkleRoot = this.calculateMerkleRoot(); // Root hash of the Merkle tree
    this.nonce = 0; // Nonce for mining (initially set to 0)
    this.originTransactionHash = this.calculateLastOriginTransactionHash(); 
    this.hash = this.calculateHash(); // Calculate the block hash
  }

  // Calculate the Merkle root for the transactions in the block
  calculateMerkleRoot() {
    if (this.transactions.length === 0) {
      return "0".repeat(64); // Return a default hash if there are no transactions
    }
    const hashes = this.transactions.map((tx) => tx.hash); // Get hashes of all transactions
    const merkleTree = new MerkleTree(hashes); // Create a Merkle tree with the transaction hashes
    return merkleTree.getRootHash(); // Get the root hash of the Merkle tree
  }

  calculateLastOriginTransactionHash() {
    if (this.transactions.length === 0) return null;
    
    // Handle the case where the last transaction might be a mining reward with a null originTransactionHash
    const lastTransaction = this.transactions[this.transactions.length - 1];
    if (lastTransaction.originTransactionHash) {
      return lastTransaction.originTransactionHash;
    }
    
    // Return the originTransactionHash of the transaction before the last one
    const secondToLastTransaction = this.transactions[this.transactions.length - 2];
    return secondToLastTransaction ? secondToLastTransaction.originTransactionHash : null;
  }

  // Calculate the hash of the block
  calculateHash() {
    const transactionsData = JSON.stringify(
      this.transactions.map((tx) => {
        const { blockHash, ...txWithoutBlockHash } = tx; // Exclude blockHash from transaction data
        return txWithoutBlockHash; // Convert transactions to JSON string
      })
    );

    return crypto
      .createHash("sha256")
      .update(
        this.previousHash +
          this.timestamp +
          this.merkleRoot +
          this.nonce +
          this.originTransactionHash + // Include the last originTransactionHash
          transactionsData
      )
      .digest("hex");
  }

  // Mine the block by finding a hash that meets the difficulty requirements
  mineBlock(difficulty) {
    while (
      this.hash.substring(0, difficulty) !== Array(difficulty + 1).join("0")
    ) {
      this.nonce++; // Increment the nonce
      this.hash = this.calculateHash(); // Recalculate the block hash
    }
  }

  // Check if all transactions in the block are valid
  async hasValidTransactions() {
    for (const tx of this.transactions) {

      tx.verifyTransaction();

      if (!tx.isValid()) {
        console.error(`Invalid transaction: ${tx.hash}`); // Log invalid transactions
        return false;
      }

      // Check if the sender has enough balance
      const balance = await this.getBalanceOfAddress(tx.fromAddress);
      if (balance < tx.amount) {
        console.error(`Insufficient balance for transaction: ${tx.hash}`);
        return false;
      }
    }
    return true; // All transactions are valid
  }

  // Save the block to the database
  async save() {
    const query =
      "INSERT INTO blocks (hash, previous_hash, timestamp, nonce, difficulty, merkle_root, `index`, origin_transaction_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    const values = [
      this.hash,
      this.previousHash,
      this.timestamp,
      this.nonce,
      this.difficulty,
      this.merkleRoot,
      this.index,
      this.originTransactionHash
    ];
    return new Promise((resolve, reject) => {
      db.query(query, values, async (err, results) => {
        if (err) {
          return reject(err);
        }
        try {
          for (const tx of this.transactions) {
            tx.blockHash = this.hash;
            await tx.save();
          }

          await this.updateBalances(); // Update balances after saving transactions

          const merkleTree = new MerkleTree(
            this.transactions.map((tx) => tx.hash)
          );
          await merkleTree.saveNodesToDatabase(this.hash);

          // Store Merkle proofs
          for (const tx of this.transactions) {
            const proof = merkleTree.getProof(tx.hash);
            await this.saveMerkleProof(tx.hash, proof);
          }

          resolve(results);
        } catch (saveErr) {
          reject(saveErr);
        }
      });
    });
  }

  async saveMerkleProof(transactionHash, proof) {
    const query =
      "INSERT INTO merkle_proof_paths (block_hash, transaction_hash, proof_path) VALUES (?, ?, ?)";
    const values = [this.hash, transactionHash, JSON.stringify(proof)];
    return new Promise((resolve, reject) => {
      db.query(query, values, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Load a block from the database
  static async load(hash) {
    const query = "SELECT * FROM blocks WHERE hash = ?";
    return new Promise((resolve, reject) => {
      db.query(query, [hash], async (err, results) => {
        if (err) return reject(err); // If there is an error, reject the promise
        if (results.length > 0) {
          const result = results[0]; // Get the block data from the result
          const block = new Block(
            result.index,
            result.previous_hash,
            result.timestamp,
            [],
            result.difficulty
          );
          block.hash = result.hash; // Set the block hash
          block.nonce = result.nonce; // Set the nonce
          block.merkleRoot = result.merkle_root; // Set the Merkle root

          // Load transactions for the block
          const txQuery = "SELECT hash FROM transactions WHERE block_hash = ?";
          db.query(txQuery, [block.hash], async (err, txResults) => {
            if (err) return reject(err); // If there is an error, reject the promise
            for (const tx of txResults) {
              const transaction = await Transaction.load(tx.hash); // Load each transaction
              if (transaction) {
                if (!transaction.isValid()) {
                  console.error(
                    `Invalid transaction in block ${block.index}: ${tx.hash}`
                  );
                  return reject(
                    new Error(`Invalid transaction in block ${block.index}`)
                  );
                }
                block.transactions.push(transaction); // Add valid transactions to the block
              }
            }
            // Validate the block's hash and Merkle root
            if (block.hash !== block.calculateHash()) {
              console.error(`Invalid block hash for block ${block.index}`);
              return reject(
                new Error(`Invalid block hash for block ${block.index}`)
              );
            }
            if (block.merkleRoot !== block.calculateMerkleRoot()) {
              console.error(`Invalid Merkle root for block ${block.index}`);
              return reject(
                new Error(`Invalid Merkle root for block ${block.index}`)
              );
            }
            resolve(block); // Resolve with the block object
          });
        } else {
          resolve(null); // If no results found, resolve with null
        }
      });
    });
  }

  async updateBalances() {
    for (const tx of this.transactions) {
      if (tx.fromAddress) {
        await this.updateAddressBalance(tx.fromAddress, -tx.amount);
      }
      if (tx.toAddress) {
        await this.updateAddressBalance(tx.toAddress, tx.amount);
      }
    }
  }

  async updateAddressBalance(address, amount) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO address_balances (address, balance)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE balance = balance + ?
      `;
      db.query(query, [address, amount, amount], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async validateBlockTransactions() {
    for (const tx of this.transactions) {
      // Validate each transaction's hash and signature
      if (!tx.isValid()) {
        console.error(`Invalid transaction: ${tx.hash}`);
        return false;
      }

      // Check if the transaction's state is reflected in the database
      const dbTx = await Transaction.load(tx.hash);
      if (!dbTx || dbTx.calculateHash() !== tx.calculateHash()) {
        console.error(`Transaction ${tx.hash} has been tampered with.`);
        return false;
      }
    }
    return true;
  }
  
}

class Blockchain {
  constructor() {
    this.chain = []; // Start with the genesis block
    this.difficulty = 0; // Initial difficulty (for mining)
    this.pendingTransactions = []; // Transactions waiting to be mined
    this.miningReward = 100; // Reward for mining a new block
    this.transactionThreshold = 2; // Number of transactions required to mine a block
    this.minerAddress = "59a8277a36bffda17f9a997e5f7c23"; // Set your miner address here
    this.genesisAddress = "6c7f05cca415fd2073de8ea8853834"; 
    console.log(
      "Blockchain initialized with transaction threshold:",
      this.transactionThreshold
    );

    // Initialize the blockchain with the genesis block
    this.initializeGenesisBlock();
  }

  // Create the first block of the blockchain (genesis block)
  initializeGenesisBlock() {
    console.log("Creating genesis block...");
    this.createGenesisBlockWithReward("6c7f05cca415fd2073de8ea8853834", 1000000); // Adjust address and reward as needed
  }

  // Create the genesis block with a reward transaction
  async createGenesisBlockWithReward(genesisAddress, initialReward) {
    const rewardTx = new Transaction(null, genesisAddress, initialReward); // Reward transaction
    rewardTx.hash = rewardTx.calculateHash();
    rewardTx.signature = null; // Reward transactions don't need a signature

    const genesisBlock = new Block(
      0,
      "0",
      Date.now(),
      [rewardTx], // Include reward transaction in the genesis block
      this.difficulty
    );
    genesisBlock.mineBlock(this.difficulty);

    this.chain.push(genesisBlock);

    await genesisBlock.save(); // Save the block to the database

    // Update the balance of the genesis address
    // await this.updateWalletBalance(genesisAddress, initialReward);

    console.log(
      `Genesis block created with initial balance of ${initialReward} to address ${genesisAddress}`
    );
  }

  // Get the latest block in the blockchain
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }


  // Mine pending transactions and add a new block to the blockchain
  async minePendingTransactions(miningRewardAddress) {
    // Attempt to acquire a lock before starting mining
    const lockAcquired = await acquireLock("miningLock");
    if (!lockAcquired) {
      console.log(
        "Could not acquire lock for mining. Another mining process might be running."
      );
      return;
    }

    try {
      // Continue mining as long as there are enough pending transactions
      while (this.pendingTransactions.length >= this.transactionThreshold) {
        console.log("Starting to mine a new block...");
        const blockTransactions = [];

        // Collect transactions up to the threshold for the current block
        while (
          blockTransactions.length < this.transactionThreshold &&
          this.pendingTransactions.length > 0
        ) {
          blockTransactions.push(this.pendingTransactions.shift());
        }

        // Conditionally add reward transaction if the mining reward address is not null
        if (miningRewardAddress) {
          const rewardTx = new Transaction(
            null,
            miningRewardAddress,
            this.miningReward
          );
          blockTransactions.push(rewardTx);
        }

        // Create a new block with the collected transactions
        const block = new Block(
          this.chain.length,
          this.getLatestBlock().hash,
          Date.now(),
          blockTransactions,
          this.difficulty
        );

        

          // Validate the origin transaction hash before adding the block
        const previousBlock = this.getLatestBlock();
        const expectedOriginTransactionHash = previousBlock.calculateLastOriginTransactionHash();

        console.log(`Previous block's originTransactionHash: ${expectedOriginTransactionHash}`);

        // Check if the previous block’s originTransactionHash is correct
        if (previousBlock.originTransactionHash !== expectedOriginTransactionHash) {
          throw new Error('Previous block has an invalid origin transaction hash');
        } else {
          console.log('Previous blocks origin transaction hash verified successfully.');
        }

        block.mineBlock(this.difficulty);

        // Log details of the mined block
        console.log(`Mined block with hash: ${block.hash}`);
        console.log(
          `Transactions in block ${block.index}: ${JSON.stringify(
            block.transactions,
            null,
            2
          )}`
        );

        // Add the new block to the blockchain
        this.chain.push(block);

        // Save the block to the database
        await block.save();
        console.log(`Block ${block.index} saved to the database.`);

        // Clear pending transactions from the database (if needed) and in-memory array
        await this.clearPendingTransactions();
        console.log("Cleared pending transactions from the database.");
      }

      // Handle the case where pending transactions are left over after mining
      console.log(
        "Pending transactions after mining: ",
        JSON.stringify(this.pendingTransactions, null, 2)
      );
    } catch (error) {
      console.error("Error during mining process:", error);
    } finally {
      // Release the lock regardless of whether mining was successful or not
      await releaseLock("miningLock");
    }
  }

  getMinerAddress() {
    return this.minerAddress;
  }

  // Get the balance of a specific address
  async getBalanceOfAddress(address) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT
          COALESCE(SUM(CASE WHEN from_address = ? THEN -amount ELSE 0 END), 0) +
          COALESCE(SUM(CASE WHEN to_address = ? THEN amount ELSE 0 END), 0) AS balance
        FROM transactions
      `;
      db.query(query, [address, address], (err, results) => {
        if (err) {
          console.error("Error querying database:", err);
          return reject(err);
        }

        const balance = results[0].balance;
        console.log(`Balance of address ${address}: ${balance}`);
        resolve(balance); // Return the balance
      });
    });
  }

  // Check if the blockchain is valid
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      // Check if the current block's hash is valid
      if (currentBlock.hash !== currentBlock.calculateHash()) {
        console.error(`Invalid hash at block ${currentBlock.index}`);
        return false;
      }

      // Check if the previous hash matches the previous block's hash
      if (currentBlock.previousHash !== previousBlock.hash) {
        console.error(`Invalid previous hash at block ${currentBlock.index}`);
        return false;
      }

      // Check if the Merkle root is valid
      const calculatedMerkleRoot = currentBlock.calculateMerkleRoot();
      if (currentBlock.merkleRoot !== calculatedMerkleRoot) {
        console.error(`Invalid Merkle root in block ${currentBlock.index}`);
        console.error(`Stored Merkle root: ${currentBlock.merkleRoot}`);
        console.error(`Calculated Merkle root: ${calculatedMerkleRoot}`);
        return false;
      }
    }
    return true; // Blockchain is valid
  }

  // Load the blockchain from the database
  static async load() {
    const blockchain = new Blockchain();
    const query = "SELECT * FROM blocks ORDER BY index ASC";
    return new Promise((resolve, reject) => {
      db.query(query, async (err, results) => {
        if (err) return reject(err); // If there is an error, reject the promise
        for (const result of results) {
          const block = await Block.load(result.hash); // Load each block
          if (block) {
            blockchain.chain.push(block); // Add the block to the blockchain
          }
        }

        // Validate the blockchain after loading
        if (!blockchain.isChainValid()) {
          console.error("Blockchain is invalid");
          reject(new Error("Blockchain is invalid"));
        } else {
          console.log("Blockchain is valid");
          resolve(blockchain); // Resolve with the loaded blockchain
        }
      });
    });
  }

  async countPendingTransactions() {
    return new Promise((resolve, reject) => {
      const query = "SELECT COUNT(*) AS count FROM pending_transactions"; // SQL query to count pending transactions
      db.query(query, (err, results) => {
        if (err) return reject(err); // Reject promise if there's an error
        resolve(results[0].count); // Resolve promise with the count of pending transactions
      });
    });
  }

  // Clear pending transactions from the database
  async clearPendingTransactions() {
    return new Promise((resolve, reject) => {
      const query = "DELETE FROM pending_transactions"; // SQL query to delete pending transactions
      db.query(query, (err, results) => {
        if (err) return reject(err); // Reject promise if there's an error
        resolve(results); // Resolve promise with the result of the deletion
      });
    });
  }

  async validateDatabaseState() {
    // Fetch all transactions from the blockchain
    const transactions = await this.getAllTransactions();

    // Calculate expected balances
    const calculatedBalances = {};
    for (const tx of transactions) {
      if (!calculatedBalances[tx.fromAddress]) calculatedBalances[tx.fromAddress] = 0;
      if (!calculatedBalances[tx.toAddress]) calculatedBalances[tx.toAddress] = 0;
      calculatedBalances[tx.fromAddress] -= tx.amount;
      calculatedBalances[tx.toAddress] += tx.amount;
    }

    // Compare with database balances
    for (const [address, balance] of Object.entries(calculatedBalances)) {
      const dbBalance = await this.getBalanceOfAddress(address);
      if (dbBalance !== balance) {
        console.error(`Balance mismatch for address ${address}: expected ${balance}, found ${dbBalance}`);
        return false;
      }
    }
    return true;
  }

  async getAllTransactions() {
    return new Promise((resolve, reject) => {
      const query = "SELECT * FROM transactions";
      db.query(query, (err, results) => {
        if (err) return reject(err);
        resolve(results.map(result => new Transaction(
          result.from_address,
          result.to_address,
          result.amount,
          result.timestamp,
          result.signature,
          result.block_hash,
          result.origin_transaction_hash
        )));
      });
    });
  }

}

// Check pending transactions
if (require.main === module) {
  (async function checkPendingTransactions() {
    const blockchain = new Blockchain();
    try {
      const count = await blockchain.countPendingTransactions();
      console.log(`There are ${count} pending transactions.`);
    } catch (error) {
      console.error("Error counting pending transactions:", error);
    }
  })();
}

module.exports = {
  Blockchain,
  Transaction,
  Block,
};
