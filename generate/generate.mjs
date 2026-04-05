import { ethers } from "ethers";

const epochId = 1;
const articleId1 = 1;
const articleId2 = 2;
const articleId3 = 3;
const articleId4 = 4; // losing article — Account 9's stake gets slashed

const abi = ethers.AbiCoder.defaultAbiCoder();

// Account 6 — votes article 1 (winner)
const salt6 = ethers.encodeBytes32String("salt_reader6");
const hash6 = ethers.keccak256(
  abi.encode(["uint256", "uint256", "bytes32"], [epochId, articleId1, salt6]),
);

// Account 7 — votes article 2 (winner)
const salt7 = ethers.encodeBytes32String("salt_reader7");
const hash7 = ethers.keccak256(
  abi.encode(["uint256", "uint256", "bytes32"], [epochId, articleId2, salt7]),
);

// Account 8 — votes article 3 (winner)
const salt8 = ethers.encodeBytes32String("salt_reader8");
const hash8 = ethers.keccak256(
  abi.encode(["uint256", "uint256", "bytes32"], [epochId, articleId3, salt8]),
);

// Account 9 — votes article 4 (loser — stake slashed)
const salt9 = ethers.encodeBytes32String("salt_reader9");
const hash9 = ethers.keccak256(
  abi.encode(["uint256", "uint256", "bytes32"], [epochId, articleId4, salt9]),
);

console.log("=== commitVote args ===");
console.log(`Acc6: commitVote(${epochId}, "${hash6}", 50000000000000000000)`);
console.log(`Acc7: commitVote(${epochId}, "${hash7}", 50000000000000000000)`);
console.log(`Acc8: commitVote(${epochId}, "${hash8}", 50000000000000000000)`);
console.log(`Acc9: commitVote(${epochId}, "${hash9}", 50000000000000000000)`);

console.log("\n=== revealVote args ===");
console.log(`Acc6: revealVote(${epochId}, ${articleId1}, "${salt6}")`);
console.log(`Acc7: revealVote(${epochId}, ${articleId2}, "${salt7}")`);
console.log(`Acc8: revealVote(${epochId}, ${articleId3}, "${salt8}")`);
console.log(`Acc9: revealVote(${epochId}, ${articleId4}, "${salt9}")`);