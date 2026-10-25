// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IHookReceiver {
    function onHook(uint8 phase) external;
}

/// @notice 6-decimal ERC-777-style token. For a single `hookTarget` it calls back:
///   phase 0 = before tokens leave the target (e.g. during fund's transferFrom),
///   phase 1 = after tokens reach the target (e.g. during withdraw/refund payout).
contract HookToken is ERC20 {
    address public hookTarget;

    constructor() ERC20("Hook Token", "HOOK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHookTarget(address t) external {
        hookTarget = t;
    }

    function _update(address from, address to, uint256 value) internal override {
        bool real = from != address(0) && to != address(0);
        if (real && from == hookTarget) IHookReceiver(hookTarget).onHook(0);
        super._update(from, to, value);
        if (real && to == hookTarget) IHookReceiver(hookTarget).onHook(1);
    }
}
