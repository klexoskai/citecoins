// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ReputationManager {
    event ReputationUpdated(address indexed voter, uint256 newBonus, bool won);

    // effectiveRep = 1 + reputationBonus; scoring uses sqrt(effectiveRep * rawStake)
    mapping(address => uint256) public reputationBonus;

    address public immutable deployer;
    address public rewards;

    constructor() {
        deployer = msg.sender;
    }

    modifier onlyRewards() {
        require(msg.sender == rewards, "not rewards");
        _;
    }

    function setRewards(address rewardsAddress) external {
        require(msg.sender == deployer, "not deployer");
        require(rewards == address(0), "already set");
        rewards = rewardsAddress;
    }

    function effectiveRep(address voter) external view returns (uint256) {
        return 1 + reputationBonus[voter];
    }

    // Winners gain +1 bonus; losers lose -1 (floored at 0, so effective rep never below 1).
    function updateRep(address voter, bool won) external onlyRewards {
        if (won) {
            reputationBonus[voter] += 1;
        } else {
            if (reputationBonus[voter] > 0) reputationBonus[voter] -= 1;
        }
        emit ReputationUpdated(voter, reputationBonus[voter], won);
    }

    function reputationOfAll(
        address reader1,
        address reader2,
        address reader3,
        address reader4
    )
        external
        view
        returns (
            uint256 reader1_REP,
            uint256 reader2_REP,
            uint256 reader3_REP,
            uint256 reader4_REP
        )
    {
        reader1_REP = this.effectiveRep(reader1);
        reader2_REP = this.effectiveRep(reader2);
        reader3_REP = this.effectiveRep(reader3);
        reader4_REP = this.effectiveRep(reader4);
    }
}
