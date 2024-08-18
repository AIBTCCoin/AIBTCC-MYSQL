CREATE DATABASE blockchain;
USE blockchain;

CREATE TABLE blocks (
  hash VARCHAR(64) PRIMARY KEY,
  previous_hash VARCHAR(64),
  timestamp BIGINT,
  nonce INT,
  difficulty INT,
  merkle_root VARCHAR(64),
  `index` INT
);

CREATE TABLE transactions (
  hash VARCHAR(64) PRIMARY KEY,
  from_address VARCHAR(132),
  to_address VARCHAR(132),
  amount DECIMAL(20, 8),
  timestamp BIGINT,
  signature TEXT,
  block_hash VARCHAR(64),
  FOREIGN KEY (block_hash) REFERENCES blocks(hash)
);

CREATE TABLE pending_transactions (
  hash VARCHAR(64) PRIMARY KEY,
  from_address VARCHAR(132),
  to_address VARCHAR(132),
  amount DECIMAL(20, 8),
  timestamp BIGINT,
  signature TEXT
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
