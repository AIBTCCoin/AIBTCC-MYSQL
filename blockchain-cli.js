const readline = require("readline");
const { Blockchain, Transaction } = require("./src/blockchain");
const { createNewWallet, loadWallet, ec } = require("./src/wallet");
const crypto = require('crypto');

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

  while (true) {
    console.log(`
    1. Create a new wallet
    2. Send a transaction
    3. View blockchain
    4. Add balance to address
    5. Check balance of address
    6. Exit
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
        await addBalance();
        break;
      case "5":
        await checkBalance();
        break;
      case "6":
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

    const tx = new Transaction(fromAddress, toAddress, amount);
    
    // Sign the transaction with the provided private key
    tx.signWithAddress(fromAddress); // Ensure the address is used correctly

    console.log("Transaction details:", tx);

    await tx.savePending();
    console.log("Transaction saved as pending successfully.");

    // Manually update blockchain pending transactions for accurate count
    blockchain.pendingTransactions.push(tx);

    const pendingTransactions = await Transaction.loadPendingTransactions();
    console.log("Pending transactions count:", pendingTransactions.length);

    // Automatically mine if transaction threshold is reached
    if (pendingTransactions.length >= blockchain.transactionThreshold) {
      console.log(
        `Transaction threshold of ${blockchain.transactionThreshold} reached. Mining a new block...`
      );
      await blockchain.minePendingTransactions(blockchain.minerAddress);
      console.log("Mining complete.");
    } else {
      console.log(
        `Threshold not reached. Pending count: ${pendingTransactions.length}`
      );
    }
  } catch (error) {
    console.error("Error in sendTransaction:", error);
  }
}



async function viewBlockchain() {
  const blocks = blockchain.chain;
  console.log(`Total blocks: ${blocks.length}`);
  blocks.forEach((block) => {
    console.log(
      `Block ${block.index}: ${block.transactions.length} transactions`
    );
  });
}

async function addBalance() {
  const address = await askQuestion("Enter the address to credit: ");
  const amount = parseFloat(await askQuestion("Enter the amount to add: "));

  if (isNaN(amount) || amount <= 0) {
    console.log("Invalid amount.");
    return;
  }

  if (!address || address.length < 24 || address.length > 30) {
    console.log("Invalid wallet address.");
    return;
  }

  await blockchain.addInitialBalance(address, amount);
  console.log(`Successfully added ${amount} to address ${address}`);
}

async function checkBalance() {
  const address = await askQuestion("Enter the address to check balance: ");

  if (!address || address.length < 24 || address.length > 30) {
    console.log("Invalid wallet address.");
    return;
  }

  try {
    const balance = await blockchain.getBalanceOfAddress(address);
    console.log(`Balance of address ${address}: ${balance}`);
  } catch (error) {
    console.error("Error fetching balance:", error);
  }
}

main().catch(console.error);
