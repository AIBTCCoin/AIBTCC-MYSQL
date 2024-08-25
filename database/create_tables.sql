CREATE DATABASE blockchain;
USE blockchain;

CREATE TABLE blocks (
  hash VARCHAR(64) PRIMARY KEY,
  previous_hash VARCHAR(64),
  timestamp BIGINT,
  nonce INT,
  difficulty INT,
  merkle_root VARCHAR(64),
  `index` INT,
  origin_transaction_hash VARCHAR(64) NULL
);

CREATE TABLE transactions (
  hash VARCHAR(64) PRIMARY KEY,
  from_address VARCHAR(132),
  to_address VARCHAR(132),
  amount DECIMAL(20, 8),
  origin_transaction_hash VARCHAR(64) NULL,
  timestamp BIGINT,
  signature TEXT,
  block_hash VARCHAR(64) NULL,
  FOREIGN KEY (block_hash) REFERENCES blocks(hash)
);

CREATE TABLE pending_transactions (
  hash VARCHAR(64) PRIMARY KEY,
  from_address VARCHAR(132),
  to_address VARCHAR(132),
  amount DECIMAL(20, 8),
  timestamp BIGINT,
  signature TEXT,
  origin_transaction_hash VARCHAR(64)
);

CREATE TABLE merkle_nodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  block_hash VARCHAR(64),
  node_level INT,
  node_index INT,
  node_value VARCHAR(64),
  FOREIGN KEY (block_hash) REFERENCES blocks(hash)
);

CREATE TABLE merkle_proof_paths (
  id INT AUTO_INCREMENT PRIMARY KEY,
  block_hash VARCHAR(64),
  transaction_hash VARCHAR(64),
  proof_path TEXT,
  FOREIGN KEY (block_hash) REFERENCES blocks(hash)
);

CREATE TABLE address_balances (
  address VARCHAR(132) PRIMARY KEY,
  balance DECIMAL(20, 8)
);
