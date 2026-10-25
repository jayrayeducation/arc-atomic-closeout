// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Plain 18-decimal ERC-20 (OZ default) used to prove the escrow rejects non-6-decimal tokens.
contract MockToken18 is ERC20 {
    constructor() ERC20("Mock 18", "M18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
