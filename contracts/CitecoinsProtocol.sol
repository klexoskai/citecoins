// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CitecoinToken.sol";
import "./BucketManager.sol";
import "./EpochManager.sol";
import "./ArticleRegistry.sol";
import "./Staking.sol";
import "./Rewards.sol";

/// @notice Convenience deploy + wiring surface for demos.
/// @dev Deploy this single contract in Remix, then read the deployed component addresses.
///      You can then interact with the sub-contracts directly.
contract CitecoinsProtocol {
    CitecoinToken public token;
    BucketManager public buckets;
    EpochManager public epochs;
    ArticleRegistry public articles;
    Staking public staking;
    Rewards public rewards;

    constructor(uint256 initialSupply) {
        token = new CitecoinToken(initialSupply);

        buckets = new BucketManager(address(token));
        epochs = new EpochManager(address(buckets));
        articles = new ArticleRegistry(address(epochs));
        staking = new Staking(address(token), address(epochs), address(articles));
        rewards = new Rewards(address(token), address(buckets), address(epochs), address(articles), address(staking));

        // Allow Rewards to withdraw bucket funds for writer pools at finalize-time.
        buckets.setRewards(address(rewards));
    }
}