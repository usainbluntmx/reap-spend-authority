// SPDX-License-Identifier: MIT
pragma solidity ^0.8.36;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Counter
 * @dev Contrato base de ejemplo para el template EVM
 */
contract Counter is Ownable {
    uint256 private s_counter;

    event CounterIncremented(address indexed by, uint256 newValue);
    event CounterReset(address indexed by);

    constructor() Ownable(msg.sender) {
        s_counter = 0;
    }

    function increment() external {
        s_counter++;
        emit CounterIncremented(msg.sender, s_counter);
    }

    function reset() external onlyOwner {
        s_counter = 0;
        emit CounterReset(msg.sender);
    }

    function getCounter() external view returns (uint256) {
        return s_counter;
    }
}
