// Auto-extracted ABIs from CiteChain Solidity contracts
// These are the human-readable ABI fragments for ethers.js v6

export const CitecoinTokenABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function deployer() view returns (address)",
  "function minters(address) view returns (bool)",
  "function grantMinter(address account)",
  "function mint(address to, uint256 amount)",
  "function burn(address from, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event MinterGranted(address indexed account)",
];

export const BucketManagerABI = [
  "function token() view returns (address)",
  "function deployer() view returns (address)",
  "function rewards() view returns (address)",
  "function FEE_BPS() view returns (uint16)",
  "function nextBucketId() view returns (uint256)",
  "function setRewards(address rewardsAddress)",
  "function createBucket(string topicURI) returns (uint256 bucketId)",
  "function fundBucket(uint256 bucketId, uint256 amount)",
  "function withdrawBucketFunds(uint256 bucketId, address to, uint256 amount)",
  "function deactivateBucket(uint256 bucketId)",
  "function getBucket(uint256 bucketId) view returns (address creator, string topicURI, uint256 fundedRewards, bool active)",
  "event BucketCreated(uint256 indexed bucketId, address indexed creator, string topicURI)",
  "event BucketFunded(uint256 indexed bucketId, address indexed funder, uint256 amount)",
  "event BucketWithdrawn(uint256 indexed bucketId, address indexed to, uint256 amount)",
  "event BucketDeactivated(uint256 indexed bucketId)",
];

export const EpochManagerABI = [
  "function bucketManager() view returns (address)",
  "function deployer() view returns (address)",
  "function rewards() view returns (address)",
  "function nextEpochId() view returns (uint256)",
  "function setRewards(address rewardsAddress)",
  "function createEpoch(uint256 bucketId, uint64 submissionStart, uint64 submissionEnd, uint64 stakingStart, uint64 stakingEnd) returns (uint256 epochId)",
  "function currentPhase(uint256 epochId) view returns (uint8)",
  "function markFinalized(uint256 epochId)",
  "function getEpoch(uint256 epochId) view returns (uint256 bucketId, uint64 submissionStart, uint64 submissionEnd, uint64 stakingStart, uint64 stakingEnd, bool finalized)",
  "event EpochCreated(uint256 indexed epochId, uint256 indexed bucketId, uint64 submissionStart, uint64 submissionEnd, uint64 stakingStart, uint64 stakingEnd)",
];

export const ArticleRegistryABI = [
  "function epochManager() view returns (address)",
  "function token() view returns (address)",
  "function deployer() view returns (address)",
  "function rewards() view returns (address)",
  "function MIN_WRITER_STAKE() view returns (uint256)",
  "function nextArticleId() view returns (uint256)",
  "function epochArticles(uint256, uint256) view returns (uint256)",
  "function setRewards(address rewardsAddress)",
  "function publishArticle(uint256 epochId, string contentCID, bytes32 contentHash, uint256 writerStake) returns (uint256 articleId)",
  "function releaseStake(uint256 articleId, address to)",
  "function slashStake(uint256 articleId) returns (uint256 slashed)",
  "function getEpochArticles(uint256 epochId) view returns (uint256[])",
  "function getArticle(uint256 articleId) view returns (address author, uint256 epochId, uint256 bucketId, string contentCID, bytes32 contentHash, uint256 writerStake, bool eligible)",
  "event ArticlePublished(uint256 indexed articleId, uint256 indexed bucketId, uint256 indexed epochId, address author, string contentCID)",
];

export const StakingABI = [
  "function token() view returns (address)",
  "function epochManager() view returns (address)",
  "function articleRegistry() view returns (address)",
  "function deployer() view returns (address)",
  "function rewards() view returns (address)",
  "function totalTrueEffStake(uint256 epochId, uint256 articleId) view returns (uint256)",
  "function totalFalseEffStake(uint256 epochId, uint256 articleId) view returns (uint256)",
  "function setRewards(address rewardsAddress)",
  "function commitVote(uint256 epochId, uint256 articleId, bytes32 commitHash, uint256 rawStake)",
  "function revealVote(uint256 epochId, uint256 articleId, bool voteTrue, bytes32 salt)",
  "function getStakers(uint256 epochId, uint256 articleId) view returns (address[])",
  "function getCommit(uint256 epochId, uint256 articleId, address voter) view returns (bytes32 commitHash, uint256 rawStake, bool revealed, bool voteTrue, uint256 effectiveStake)",
  "function getTally(uint256 epochId, uint256 articleId) view returns (uint256 trueWeight, uint256 falseWeight)",
  "event VoteCommitted(uint256 indexed epochId, uint256 indexed articleId, address indexed voter, bytes32 commitHash, uint256 rawStake)",
  "event VoteRevealed(uint256 indexed epochId, uint256 indexed articleId, address indexed voter, bool voteTrue, uint256 effectiveStake)",
];

export const RewardsABI = [
  "function token() view returns (address)",
  "function bucketManager() view returns (address)",
  "function epochManager() view returns (address)",
  "function articleRegistry() view returns (address)",
  "function staking() view returns (address)",
  "function writerClaimed(uint256 epochId, uint256 articleId) view returns (bool)",
  "function readerClaimed(uint256 epochId, address reader) view returns (bool)",
  "function finalizeEpoch(uint256 epochId, uint256 writerPoolAmount)",
  "function claimWriter(uint256 epochId, uint256 articleId)",
  "function claimReader(uint256 epochId)",
  "event EpochFinalized(uint256 indexed epochId, uint256 indexed bucketId, uint8 nPaid, uint256 readerPool)",
  "event WriterClaimed(uint256 indexed epochId, uint256 indexed articleId, address indexed author, uint256 amount)",
  "event ReaderClaimed(uint256 indexed epochId, address indexed reader, uint256 amount)",
];

export const CitecoinsProtocolABI = [
  "function token() view returns (address)",
  "function buckets() view returns (address)",
  "function epochs() view returns (address)",
  "function articles() view returns (address)",
  "function staking() view returns (address)",
  "function rewards() view returns (address)",
];
