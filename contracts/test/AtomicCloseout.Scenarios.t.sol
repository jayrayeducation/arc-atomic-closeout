// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// Fixed fixtures, precision, concurrent groups / sequential rounds.
contract ACScenariosTest is ACBase {
    // ------------------------------------------------------------ fixed fixtures
    function test_WeekendTrip_FullLifecycle() public {
        // Alex +25.00, Maya +5.00, Jordan -30.00 USDC
        uint256 g = _weekendGroup();
        (uint256 rid, bytes32 h) = _weekendPlan(g);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.debts[0], 0);
        assertEq(v.debts[1], 0);
        assertEq(v.debts[2], 30_000_000);
        assertEq(v.credits[0], 25_000_000);
        assertEq(v.credits[1], 5_000_000);
        assertEq(v.credits[2], 0);

        _approveAs(rid, alex);
        _approveAs(rid, maya);
        _approveAs(rid, jordan);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));
        assertEq(ac.getRound(rid).planHash, h);

        _fundAs(rid, jordan);
        assertEq(_bal(jordan), 0);
        assertEq(_bal(address(ac)), 30_000_000);

        vm.prank(maya);
        ac.finalize(rid);
        _wd(rid, alex);
        _wd(rid, maya);

        assertEq(_bal(alex), 25_000_000);
        assertEq(_bal(maya), 5_000_000);
        assertEq(_bal(jordan), 0);
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        v = ac.getRound(rid);
        assertEq(v.fundedTotal, 30_000_000);
        assertEq(v.withdrawnTotal, 30_000_000);
        assertEq(v.refundedTotal, 0);
        assertEq(uint8(v.status), uint8(AtomicCloseout.Status.Settled));
    }

    function test_OddRemainder_ThreeWaySplitHandledExactly() public {
        // jordan paid 10.000001 USDC for three; equal share 3_333_333, remainder 2 base units
        // goes to alex and maya (3_333_334 each). jordan's net credit = 10_000_001 - 3_333_333.
        uint256 g = _weekendGroup();
        uint128[] memory d = _u3(3_333_334, 3_333_334, 0);
        uint128[] memory c = _u3(0, 0, 6_666_668);
        (uint256 rid,) = _propose(g, alex, d, c, T0 + DAY);
        _settle(rid);
        _wd(rid, jordan);
        assertEq(_bal(jordan), 6_666_668);
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        assertEq(ac.getRound(rid).totalAmount, 6_666_668);
    }

    function test_OddRemainder_OffByOneBaseUnitIsRejected() public {
        uint256 g = _weekendGroup();
        uint128[] memory d = _u3(3_333_334, 3_333_334, 0);
        uint128[] memory c = _u3(0, 0, 6_666_667);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.PlanUnbalanced.selector, 6_666_668, 6_666_667));
        ac.proposePlan(g, d, c, T0 + DAY, EXP);
    }

    function test_OddRemainder_OneCreditorOneBaseUnitSplitAcrossDebtors() public {
        // two debtors owe 1 base unit each, creditor gets exactly 2
        uint256 g = _weekendGroup();
        (uint256 rid,) = _propose(g, alex, _u3(1, 1, 0), _u3(0, 0, 2), T0 + DAY);
        _settle(rid);
        _wd(rid, jordan);
        assertEq(_bal(jordan), 2);
        assertEq(_bal(address(ac)), 0);
    }

    // ------------------------------------------------------------ precision
    function _roundTrip(uint128 amt) internal {
        uint256 g = _newGroup(_members(2));
        (uint256 rid,) = _propose(g, ms[0], _u2(amt, 0), _u2(0, amt), T0 + DAY);
        _settle(rid);
        _wd(rid, ms[1]);
        assertEq(_bal(ms[1]), amt);
        assertEq(_bal(ms[0]), 0);
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
    }

    function test_Precision_OneBaseUnit() public {
        _roundTrip(1);
    }

    function test_Precision_OneUSDC() public {
        _roundTrip(1e6);
    }

    function test_Precision_Odd123456789() public {
        _roundTrip(123_456_789);
    }

    function test_Precision_LargeAmount() public {
        _roundTrip(1_000_000_000_000e6); // 1e12 USDC
    }

    function test_Precision_Uint128MaxSinglePairAccepted() public {
        uint256 g = _newGroup(_members(2));
        (uint256 rid,) = _propose(g, ms[0], _u2(type(uint128).max, 0), _u2(0, type(uint128).max), T0 + DAY);
        assertEq(ac.getRound(rid).totalAmount, type(uint128).max);
    }

    function test_Precision_Uint128OverflowGuard() public {
        uint256 g = _newGroup(_members(4));
        uint128[] memory d = new uint128[](4);
        uint128[] memory c = new uint128[](4);
        d[0] = type(uint128).max;
        d[1] = 1;
        c[2] = type(uint128).max;
        c[3] = 1; // balanced, sum = 2^128 > uint128.max
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.AmountOverflow.selector);
        ac.proposePlan(g, d, c, T0 + DAY, EXP);
    }

    // ------------------------------------------------------------ concurrency
    function test_Concurrent_TwoGroupsIndependentAccounting() public {
        uint256 gA = _weekendGroup(); // alex, maya, jordan
        uint256 gB = _newGroup(_members(3)); // m0, m1, m2
        (uint256 rA,) = _weekendPlan(gA);
        (uint256 rB,) = _propose(gB, ms[0], _u3(0, 0, 9e6), _u3(4e6, 5e6, 0), T0 + 2 * DAY);
        assertEq(rA, 1);
        assertEq(rB, 2);
        _approveAll(rA);
        _approveAll(rB);
        _fundAs(rA, jordan);
        _fundAs(rB, ms[2]);
        assertEq(ac.totalLocked(), 39e6);
        ac.finalize(rA);
        // group A pays out; group B stays locked untouched
        _wd(rA, alex);
        _wd(rA, maya);
        assertEq(ac.totalLocked(), 9e6);
        assertEq(_bal(address(ac)), 9e6);
        assertEq(uint8(_status(rB)), uint8(AtomicCloseout.Status.Funding));
        ac.finalize(rB);
        _wd(rB, ms[0]);
        _wd(rB, ms[1]);
        assertEq(_bal(ms[0]), 4e6);
        assertEq(_bal(ms[1]), 5e6);
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 0);
    }

    function test_Concurrent_SequentialRoundsInOneGroup() public {
        uint256 g = _weekendGroup();
        (uint256 r1,) = _weekendPlan(g);
        _settle(r1);
        (uint256 r2,) = _propose(g, maya, _u3(0, 12e6, 0), _u3(0, 0, 12e6), T0 + DAY);
        // round 1 still has unwithdrawn credits while round 2 runs
        assertEq(ac.totalLocked(), 30e6);
        _settle(r2);
        assertEq(ac.totalLocked(), 42e6);
        _wd(r2, jordan);
        _wd(r1, alex);
        _wd(r1, maya);
        assertEq(_bal(jordan), 12e6);
        assertEq(_bal(alex), 25e6);
        assertEq(_bal(maya), 5e6);
        assertEq(ac.totalLocked(), 0);
        assertEq(ac.getGroup(g).roundCount, 2);
        assertEq(ac.groupRounds(g).length, 2);
        assertEq(ac.getRound(r2).roundNumber, 2);
        assertEq(ac.getRound(r1).withdrawnTotal, 30e6);
    }

    function test_Concurrent_OldRoundWithdrawStillWorksAfterNewerRoundsExpire() public {
        uint256 g = _weekendGroup();
        (uint256 r1,) = _weekendPlan(g);
        _settle(r1);
        (uint256 r2,) = _weekendPlan(g);
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(r2)), uint8(AtomicCloseout.Status.Expired));
        _wd(r1, alex);
        assertEq(_bal(alex), 25e6);
    }

    function test_Concurrent_RefundInOneGroupCannotTouchAnotherGroupsFunds() public {
        uint256 gA = _newGroup(_members(3));
        uint256 gB = _weekendGroup(); // alex, maya, jordan
        (uint256 rA,) = _propose(gA, ms[0], _u3(10e6, 10e6, 0), _u3(0, 0, 20e6), T0 + DAY);
        (uint256 rB,) = _weekendPlan(gB);
        _approveAll(rA);
        _approveAll(rB);
        _fundAs(rA, ms[0]); // group A under-funded
        _fundAs(rB, jordan); // group B fully funded
        ac.finalize(rB);
        vm.warp(T0 + DAY);
        _refundAs(rA, ms[0]);
        assertEq(_bal(ms[0]), 10e6);
        assertEq(_bal(address(ac)), 30e6, "group B funds intact");
        assertEq(ac.totalLocked(), 30e6);
        // group-B member cannot refund against group A, nor group-A member against B
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.refund(rA);
        vm.prank(ms[1]);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector);
        ac.refund(rB);
        _wd(rB, alex);
        _wd(rB, maya);
        assertEq(_bal(alex) + _bal(maya), 30e6);
    }

    function test_Concurrent_MemberOfTwoGroupsCannotCrossFund() public {
        uint256 gA = _newGroup(_members(2)); // m0, m1
        uint256 gB = _weekendGroup();
        (uint256 rA,) = _propose(gA, ms[0], _u2(5e6, 0), _u2(0, 5e6), T0 + DAY);
        (uint256 rB,) = _weekendPlan(gB);
        _approveAll(rA);
        _approveAll(rB);
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.fund(rA); // jordan is in B only
        _fundAs(rA, ms[0]);
        assertEq(ac.getRound(rB).fundedTotal, 0);
    }
}
