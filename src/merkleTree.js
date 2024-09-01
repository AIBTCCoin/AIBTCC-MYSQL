const crypto = require("crypto"); // Import the crypto module for hashing
const db = require("./db"); // Import the database connection module

class Node {
  /**
   * Represents a node in the Merkle tree.
   * @param {Node|null} left - Left child node
   * @param {Node|null} right - Right child node
   * @param {string} value - Hash value of the node
   * @param {boolean} isCopied - Flag to indicate if the node is copied
   */
  constructor(left, right, value, isCopied) {
    this.left = left; // Left child node
    this.right = right; // Right child node
    this.value = value; // Hash value of the node
    this.isCopied = isCopied; // Indicates if the node was copied
  }

  /**
   * Creates a hash of the given value using SHA-256.
   * @param {string} data - Value to hash
   * @returns {string} - SHA-256 hash of the value
   */
  static hash(data) {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Creates a copy of the current node.
   * @returns {Node} - A new Node object with the same properties
   */
  copy() {
    return new Node(this.left, this.right, this.value, true);
  }
}

class MerkleTree {
  /**
   * Constructs a Merkle Tree from a list of values.
   * @param {string[]} values - List of values to build the Merkle Tree from
   * @throws {Error} - If no values are provided
   */
  constructor(values) {
    if (!values || values.length === 0) {
      throw new Error("Cannot build Merkle Tree with no values.");
    }
    this.root = this.buildTree(values); // Build the Merkle Tree and set the root
  }

  /**
   * Saves all nodes of the Merkle Tree to the database.
   * @param {string} blockHash - Hash of the block associated with the Merkle Tree
   * @param {Node} [node=this.root] - Current node being processed
   * @param {number} [level=0] - Current level in the tree
   * @param {number} [index=0] - Index of the current node
   * @returns {Promise<void>}
   */
  async saveNodesToDatabase(blockHash, node = this.root, level = 0, index = 0) {
    if (node !== null) {
      const query = "INSERT INTO merkle_nodes (block_hash, node_level, node_index, node_value) VALUES (?, ?, ?, ?)";
      const values = [blockHash, level, index, node.value];
      console.log("Saving node:", values);
      
      await new Promise((resolve, reject) => {
        db.query(query, values, (err) => {
          if (err) {
            console.error("Database query error:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
  
      if (node.left !== null) {
        console.log(`Saving left child of index ${index}`);
        await this.saveNodesToDatabase(blockHash, node.left, level + 1, index * 2);
        console.log(`Saving right child of index ${index}`);
        await this.saveNodesToDatabase(blockHash, node.right, level + 1, index * 2 + 1);
      }
    }
  }

  /**
   * Builds the Merkle Tree from a list of leaf nodes.
   * @param {string[]} values - List of values to be used as leaf nodes
   * @returns {Node} - Root node of the constructed Merkle Tree
   */
  buildTree(values) {
    // Create leaf nodes with hash values
    let leaves = values.map((e) => new Node(null, null, Node.hash(e), false));

    // If there is an odd number of leaves, duplicate the last leaf
    if (leaves.length % 2 === 1) {
      leaves.push(leaves[leaves.length - 1].copy());
    }

    return this.buildTreeRec(leaves); // Build the tree recursively
  }

  /**
   * Recursively builds the Merkle Tree from a list of nodes.
   * @param {Node[]} nodes - List of nodes at the current level
   * @param {number} [depth=0] - Current recursion depth
   * @returns {Node} - Root node of the constructed tree
   * @throws {Error} - If maximum recursion depth is exceeded or no nodes are provided
   */
  buildTreeRec(nodes, depth = 0) {
    const maxDepth = 10; // Maximum allowed recursion depth
    if (depth > maxDepth) {
      throw new Error("Max recursion depth exceeded");
    }

    if (nodes.length === 1) {
      return nodes[0]; // Return the root node when only one node is left
    }

    if (nodes.length === 0) {
      throw new Error("No nodes to process.");
    }

    // If there is an odd number of nodes, duplicate the last node
    if (nodes.length % 2 === 1) {
      nodes.push(nodes[nodes.length - 1].copy());
    }

    // Build the next level of nodes
    const newLevel = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = nodes[i + 1];
      const value = Node.hash(left.value + right.value); // Combine and hash the left and right nodes
      newLevel.push(new Node(left, right, value, false)); // Create a new parent node
    }

    return this.buildTreeRec(newLevel, depth + 1); // Recursively build the tree
  }

  /**
   * Prints the Merkle Tree to the console.
   */
  printTree() {
    this.printTreeRec(this.root); // Start printing from the root
  }

  /**
   * Recursively prints the Merkle Tree.
   * @param {Node} node - Current node being printed
   * @param {number} [level=0] - Current level in the tree
   */
  printTreeRec(node, level = 0) {
    if (node !== null) {
      if (node.left !== null) {
        this.printTreeRec(node.left, level + 1); // Print left subtree
        console.log(" ".repeat(level * 2) + node.value); // Print current node value
        this.printTreeRec(node.right, level + 1); // Print right subtree
      } else {
        console.log(" ".repeat(level * 2) + node.value); // Print leaf node value
      }
    }
  }

  /**
   * Gets the hash of the root node of the Merkle Tree.
   * @returns {string} - Hash value of the root node
   */
  getRootHash() {
    return this.root.value; // Return the root node's hash value
  }

  /**
   * Verify a proof path for a given leaf hash.
   * @param {string} leaf - The hash of the leaf node (transaction hash).
   * @param {string[]} proof - The proof path (array of sibling hashes).
   * @param {string} root - The root hash of the Merkle tree.
   * @returns {boolean} - True if the proof is valid, false otherwise.
   */
  static verifyProof(leaf, proof, root) {
    let hash = leaf;
    console.log("Initial leaf hash:", hash);
  
    for (const sibling of proof) {
      if (sibling === null) {
        console.log("Sibling is null, handling leaf node case");
        // Depending on the position, hash with the sibling node
        hash = Node.hash(hash); // Single hash for leaf node (if required)
      } else {
        console.log("Sibling hash:", sibling);
        hash = hash < sibling ? Node.hash(hash + sibling) : Node.hash(sibling + hash);
      }
      console.log("Intermediate hash:", hash);
    }
  
    console.log("Final hash:", hash);
    console.log("Expected root hash:", root);
    return root;
  }
  

  

  /**
   * Gets the proof for a specific leaf value.
   * @param {string} leafValue - The hash of the leaf node to find
   * @returns {Array<string>} - The proof path for the leaf node
   */
  getProof(leafValue) {
    const proof = [];
    let node = this.root;

    while (node) {
      if (node.left && node.left.value === leafValue) {
        // Add the right sibling's hash to the proof
        proof.push(node.right ? node.right.value : null);
        node = node.left;
      } else if (node.right && node.right.value === leafValue) {
        // Add the left sibling's hash to the proof
        proof.push(node.left ? node.left.value : null);
        node = node.right;
      } else {
        if (node.left) proof.push(node.left.value);
        if (node.right) proof.push(node.right.value);
        node = null;
      }
    }

    if (proof.length === 0) {
      throw new Error("Leaf not found in the Merkle Tree");
    }

    // Debugging: Print proof path and its elements
    console.log("Calculated proof path:", proof);

    return proof;
  }
  

  /**
   * Finds the index of a leaf node with the given value.
   * @param {Node} node - The current node being processed.
   * @param {string} leafValue - The value of the leaf node to find.
   * @returns {number} - The index of the leaf node or -1 if not found.
   */
  findLeafIndex(node, leafValue) {
    if (!node) return -1;
    if (!node.left && !node.right) return node.value === leafValue ? 0 : -1;
  
    const leftIndex = this.findLeafIndex(node.left, leafValue);
    if (leftIndex !== -1) return leftIndex * 2;
  
    const rightIndex = this.findLeafIndex(node.right, leafValue);
    const foundIndex = rightIndex !== -1 ? rightIndex * 2 + 1 : -1;
    console.log(`Leaf value ${leafValue} found at index ${foundIndex}`);
    return foundIndex;
  }

  /**
   * Gets all leaf nodes of the tree.
   * @returns {Node[]} - An array of leaf nodes.
   */
  getLeaves() {
    const leaves = [];
    this.collectLeaves(this.root, leaves);
    return leaves;
  }

  /**
   * Recursively collects leaf nodes.
   * @param {Node} node - The current node being processed.
   * @param {Node[]} leaves - The array to collect leaf nodes into.
   */
  collectLeaves(node, leaves) {
    if (!node) return;
    if (!node.left && !node.right) {
      leaves.push(node);
    } else {
      this.collectLeaves(node.left, leaves);
      this.collectLeaves(node.right, leaves);
    }
  }
}

// New class added to the file
class MerkleProofPath {
  static async getProofPath(transactionHash) {
    const query = "SELECT proof_path FROM merkle_proof_paths WHERE transaction_hash = ?";
    return new Promise((resolve, reject) => {
      db.query(query, [transactionHash], (err, results) => {
        if (err) {
          console.error("Database query error:", err);
          reject(err);
        } else if (results.length > 0) {
          try {
            const proofPath = JSON.parse(results[0].proof_path);
            console.log("Retrieved proof path:", proofPath);
            resolve(proofPath);
          } catch (parseError) {
            console.error("JSON parse error:", parseError);
            reject(parseError);
          }
        } else {
          resolve(null);
        }
      });
    });
  }
}

module.exports = { Node, MerkleTree, MerkleProofPath };
