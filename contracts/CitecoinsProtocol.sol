// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CitecoinToken.sol";
import "./BucketManager.sol";
import "./EpochManager.sol";
import "./ArticleRegistry.sol";
import "./Staking.sol";
import "./Rewards.sol";

contract CitecoinsProtocol {
    CitecoinToken   public token;
    BucketManager   public buckets;
    EpochManager    public epochs;
    ArticleRegistry public articles;
    Staking         public staking;
    Rewards         public rewards;

    constructor(uint256 initialSupply) {
        token = new CitecoinToken(msg.sender, initialSupply);

        buckets = new BucketManager(address(token));
        epochs  = new EpochManager(address(buckets));

        articles = new ArticleRegistry(address(epochs), address(token));
        staking  = new Staking(address(token), address(epochs), address(articles));
        rewards  = new Rewards(
            address(token),
            address(buckets),
            address(epochs),
            address(articles),
            address(staking)
        );

        buckets.setRewards(address(rewards));
        epochs.setRewards(address(rewards));
        articles.setRewards(address(rewards));
        staking.setRewards(address(rewards));
        token.grantMinter(address(rewards));
    }
}