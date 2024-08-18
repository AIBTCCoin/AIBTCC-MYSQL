const { Connection, PublicKey, clusterApiUrl, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const anchor = require('@project-serum/anchor');

// Replace with your deployed program ID
const programId = new PublicKey('3i6kD6Wpgd3A7ZqAmjrcZ9mMxv9az6k7EATtUV5NsDoB'); // Example valid base58 string

const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const createKeypair = () => Keypair.generate();

const getBalance = async (publicKey) => {
  return connection.getBalance(new PublicKey(publicKey));
};

const requestAirdrop = async (publicKey, amount) => {
  if (amount <= 0) {
    throw new Error('Airdrop amount must be greater than 0');
  }

  try {
    console.log(`Requesting airdrop of ${amount} lamports...`);
    const pubKey = new PublicKey(publicKey); // Ensure it's a valid PublicKey object
    const signature = await connection.requestAirdrop(pubKey, amount);

    // Use TransactionConfirmationStrategy instead of deprecated confirmTransaction
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      ...latestBlockhash,
    });

    console.log('Airdrop successful');
  } catch (error) {
    console.error('Full error object:', error);
    if (error.message && error.message.includes('Too Many Requests')) {
      console.error('Rate limit exceeded. Please wait and try again later.');
    } else {
      console.error('Error requesting airdrop:', error);
    }
    throw error;
  }
};

const transferSOL = async (transaction, signers) => {
  const signature = await connection.sendTransaction(transaction, signers);

  // Use TransactionConfirmationStrategy instead of deprecated confirmTransaction
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature,
    ...latestBlockhash,
  });

  return signature;
};

const interactWithContract = async () => {
  const provider = new anchor.AnchorProvider(connection, anchor.Wallet.local(), anchor.AnchorProvider.defaultOptions());
  const idl = await anchor.Program.fetchIdl(programId, provider);
  const program = new anchor.Program(idl, programId, provider);

  try {
    await program.rpc.greet();
    console.log('Smart contract interaction successful');
  } catch (error) {
    console.error('Smart contract interaction failed:', error);
  }
};

class SolanaTransaction {
  constructor(fromPublicKey, toPublicKey, amount) {
    this.fromPublicKey = fromPublicKey;
    this.toPublicKey = toPublicKey;
    this.amount = amount;
  }

  async executeSolanaTransaction(fromKeypair, toPublicKey, requestAirdropFlag) {
    try {
      const balance = await getBalance(fromKeypair.publicKey.toBase58());
      const lamportsToSend = this.amount * LAMPORTS_PER_SOL;

      if (balance < lamportsToSend) {
        console.log(`Current balance (${balance} lamports) is insufficient for the transaction amount (${lamportsToSend} lamports).`);
        if (requestAirdropFlag) {
          console.log('Requesting airdrop due to insufficient balance...');
          await requestAirdrop(fromKeypair.publicKey, LAMPORTS_PER_SOL * 0.0001);
          const newBalance = await getBalance(fromKeypair.publicKey.toBase58());
          if (newBalance < lamportsToSend) {
            throw new Error('Insufficient balance after airdrop');
          }
        } else {
          throw new Error('Insufficient balance and airdrop not requested');
        }
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: new PublicKey(toPublicKey),
          lamports: lamportsToSend,
        }),
      );

      transaction.sign(fromKeypair);

      const signature = await transferSOL(transaction, [fromKeypair]);
      console.log('Transaction confirmed with signature:', signature);
    } catch (error) {
      console.error('Solana transaction failed:', error);
    }
  }
}

module.exports = {
  createKeypair,
  getBalance,
  requestAirdrop,
  transferSOL,
  interactWithContract,
  SolanaTransaction,
  LAMPORTS_PER_SOL
};















