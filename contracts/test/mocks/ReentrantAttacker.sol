// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AtomicCloseout} from "../../AtomicCloseout.sol";

/// @notice Group member contract. When armed, the first token hook re-enters the escrow with
/// `reentryCall` and records (rather than propagates) the outcome so the outer call can finish.
contract ReentrantAttacker {
    AtomicCloseout public immutable target;
    bytes public reentryCall;
    bool public armed;
    bool public lastOk;
    bytes public lastRet;
    uint256 public hookCalls;

    constructor(AtomicCloseout t) {
        target = t;
    }

    function arm(bytes calldata data) external {
        reentryCall = data;
        armed = true;
    }

    function approveToken(IERC20 t) external {
        t.approve(address(target), type(uint256).max);
    }

    function doApprove(uint256 rid, bytes32 h) external {
        target.approvePlan(rid, h);
    }

    function doFund(uint256 rid) external {
        target.fund(rid);
    }

    function doWithdraw(uint256 rid) external {
        target.withdraw(rid);
    }

    function doWithdrawTo(uint256 rid, address to) external {
        target.withdrawTo(rid, to);
    }

    function doRefund(uint256 rid) external {
        target.refund(rid);
    }

    function onHook(uint8) external {
        ++hookCalls;
        if (!armed) return;
        armed = false;
        (lastOk, lastRet) = address(target).call(reentryCall);
    }
}
