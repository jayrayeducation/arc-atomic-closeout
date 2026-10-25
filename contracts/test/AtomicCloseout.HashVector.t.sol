// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Cross-language vector: the TypeScript planHash in src/lib/settlement.ts must equal this value
/// (see tests/settlement.test.ts "matches the Solidity vector").
contract ACHashVectorTest is Test {
    function test_PlanHashVector() public {
        MockUSDC usdc = new MockUSDC();
        AtomicCloseout ac = new AtomicCloseout(IERC20(address(usdc)));
        address[] memory m = new address[](3);
        m[0] = address(uint160(0xde01));
        m[1] = address(uint160(0xde02));
        m[2] = address(uint160(0xde03));
        vm.prank(m[0]);
        ac.createGroup("Weekend Trip", m);
        uint128[] memory debts = new uint128[](3);
        uint128[] memory credits = new uint128[](3);
        credits[0] = 210_483_332;
        debts[1] = 125_566_666;
        debts[2] = 84_916_666;
        bytes32 expensesHash = keccak256("vector-expenses");
        bytes32 h = ac.computePlanHash(1, 1, debts, credits, 1_800_000_000, expensesHash);
        console.log("contract", address(ac));
        console.logBytes32(h);
        assertEq(block.chainid, 31337);
        assertEq(h, bytes32(0x24fcc93b9e534a44f1e5567b562b053a86c4c4f42b65d5c80cfa4014b76ae50e));
    }
}
