// Contract addresses — update after deployment
// For Hardhat local: run `npx hardhat node` then `npx hardhat run scripts/deploy.js --network localhost`
// The CitecoinsProtocol constructor deploys all contracts and logs their addresses.

export const ADDRESSES = {
  // Set these after deploying CitecoinsProtocol to your local Hardhat node
  protocol: import.meta.env.VITE_PROTOCOL_ADDRESS || "",
  token: import.meta.env.VITE_TOKEN_ADDRESS || "",
  buckets: import.meta.env.VITE_BUCKETS_ADDRESS || "",
  epochs: import.meta.env.VITE_EPOCHS_ADDRESS || "",
  articles: import.meta.env.VITE_ARTICLES_ADDRESS || "",
  staking: import.meta.env.VITE_STAKING_ADDRESS || "",
  rewards: import.meta.env.VITE_REWARDS_ADDRESS || "",
};

// Hardhat local chain config
export const CHAIN_CONFIG = {
  chainId: 31337,
  name: "Hardhat Local",
  rpcUrl: "http://127.0.0.1:8545",
};
