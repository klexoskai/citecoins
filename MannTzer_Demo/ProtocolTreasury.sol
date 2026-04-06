// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// standard ERC-20 token interface 
// lets the contract call functions like: transfer, transferFrom
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// gives the contract and owner and onlyOwner modifier
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ProtocolTreasury
/// @notice Central vault for all protocol funds.
/// @dev Users approve this treasury. Approved protocol contracts can pull funds
///      from users into the treasury and pay funds out from the treasury.
contract ProtocolTreasury is Ownable {
    // Stores the ERC-20 token used by the protocol
    IERC20 public immutable token;

    // records which addresses are allowed to operate the treasury 
    mapping(address => bool) public controllers;

    // custom errors 
    error NotController();
    error ZeroAddress();
    error AmountZero();

    // events for logging 
    event ControllerUpdated(address indexed controller, bool allowed);
    event PulledFromUser(address indexed controller, address indexed from, uint256 amount);
    event Payout(address indexed controller, address indexed to, uint256 amount);

    // Runs when contract is deployed
    // takes in tokenAddress and stores it 
    constructor(address tokenAddress) Ownable(msg.sender) {
        if (tokenAddress == address(0)) revert ZeroAddress();
        token = IERC20(tokenAddress);
    }

    // Only controllers mark as True in the mapping can call the function modified by this 
    modifier onlyController() {
        if (!controllers[msg.sender]) revert NotController();
        _;
    }

    // lets the owner add or remove control permission
    function setController(address controller, bool allowed) external onlyOwner {
        // check if the provided address is valid 
        if (controller == address(0)) revert ZeroAddress();
        // allow the address to have control
        controllers[controller] = allowed;
        // emit the event that controller has been updated
        emit ControllerUpdated(controller, allowed);
    }

    /// Pull tokens from a user into the treasury.
    /// User must approve the treasury beforehand.
    function pullFromUser(address from, uint256 amount) external onlyController {
        // check if the amount is 0
        if (amount == 0) revert AmountZero();
        // tells ERC-20 token to move amount from this address to another 
        bool ok = token.transferFrom(from, address(this), amount);
        // check if transfer is successful 
        require(ok, "transferFrom failed");
        // emit the event that the transfer has been made 
        emit PulledFromUser(msg.sender, from, amount);
    }

    /// Pay tokens from the treasury to a recipient.
    function payout(address to, uint256 amount) external onlyController {
        // payout cannot be 0 
        if (amount == 0) revert AmountZero();
        // Transfer from treasury to recipient 
        bool ok = token.transfer(to, amount);
        // check whether transfer succeeded 
        require(ok, "transfer failed");
        // emit event that payment transfer was successful 
        emit Payout(msg.sender, to, amount);
    }
}