// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console} from "forge-std/Test.sol";
import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// Gas benchmarks. Output lines are prefixed `GAS|` so they can be grepped into gas-benchmarks.txt.
/// Only generous sanity bounds are asserted.
contract ACGasTest is ACBase {
    struct R {
        uint256 createGroup;
        uint256 propose;
        uint256 approveFirst;
        uint256 approveLast;
        uint256 approveAvg;
        uint256 fundFirst;
        uint256 fundLast;
        uint256 fundAvg;
        uint256 finalize;
        uint256 withdrawFirst;
        uint256 withdrawAvg;
        uint256 refund;
        uint256 debtors;
        uint256 creditors;
        uint256 txCount;
    }

    uint256 internal constant SANITY = 1_500_000;

    /// @dev gas used by the last external call into the escrow (cheatcode calls excluded).
    function _g() internal returns (uint256) {
        return vm.lastCallGas().gasTotalUsed;
    }

    R internal r;
    uint256 internal n;
    uint256 internal gid;
    uint256 internal rid;
    bytes32 internal ph;
    address[] internal m;
    uint128[] internal d;
    uint128[] internal c;

    /// @dev half debtors (first k members) / half creditors (rest); every debtor owes (n-k)e6 and every creditor
    /// is owed k e6, so the plan balances for every n >= 2.
    function _buildPlan(uint256 size) internal {
        n = size;
        uint256 k = size / 2;
        uint256 cr = size - k;
        m = _members(size);
        delete d;
        delete c;
        for (uint256 i; i < size; ++i) {
            d.push(i < k ? uint128(cr * 1e6) : 0);
            c.push(i < k ? 0 : uint128(k * 1e6));
        }
        r.debtors = k;
        r.creditors = cr;
    }

    function _measureSetup() internal {
        vm.prank(m[0]);
        gid = ac.createGroup("Gas benchmark group", m);
        r.createGroup = _g();

        vm.prank(m[0]);
        (rid, ph) = ac.proposePlan(gid, d, c, T0 + DAY, EXP);
        r.propose = _g();
    }

    function _measureApprovals() internal {
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            vm.prank(m[i]);
            ac.approvePlan(rid, ph);
            uint256 g = _g();
            if (i == 0) r.approveFirst = g;
            if (i == n - 1) r.approveLast = g;
            sum += g;
        }
        r.approveAvg = sum / n;
    }

    function _measureFunding() internal {
        uint256 sum;
        uint256 k = r.debtors;
        for (uint256 i; i < k; ++i) {
            _prep(m[i], d[i]);
            vm.prank(m[i]);
            ac.fund(rid);
            uint256 g = _g();
            if (i == 0) r.fundFirst = g;
            if (i == k - 1) r.fundLast = g;
            sum += g;
        }
        r.fundAvg = sum / k;
    }

    function _measureClose() internal {
        vm.prank(m[0]);
        ac.finalize(rid);
        r.finalize = _g();

        uint256 sum;
        for (uint256 i = r.debtors; i < n; ++i) {
            vm.prank(m[i]);
            ac.withdraw(rid);
            uint256 g = _g();
            if (i == r.debtors) r.withdrawFirst = g;
            sum += g;
            assertEq(_bal(m[i]), c[i]);
        }
        r.withdrawAvg = sum / r.creditors;
    }

    /// @dev Separate expiry scenario: n-1 debtors, only the first funds; it refunds after the deadline.
    function _measureRefund() internal {
        address[] memory mm = _members(n);
        uint256 g2 = _newGroup(mm);
        uint128[] memory dd = new uint128[](n);
        uint128[] memory cc = new uint128[](n);
        for (uint256 i; i + 1 < n; ++i) {
            dd[i] = 1e6;
        }
        cc[n - 1] = uint128((n - 1) * 1e6);
        (uint256 r2,) = _propose(g2, mm[0], dd, cc, T0 + 2 * DAY);
        _approveAll(r2);
        _fundAs(r2, mm[0]);
        vm.warp(T0 + 2 * DAY);
        vm.prank(mm[0]);
        ac.refund(r2);
        r.refund = _g();
        assertEq(_bal(mm[0]), 1e6);
    }

    function _run(uint256 size) internal {
        _buildPlan(size);
        _measureSetup();
        _measureApprovals();
        _measureFunding();
        _measureClose();
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 0);
        _measureRefund();
        // createGroup + propose + n approvals + k funds + finalize + m withdrawals
        r.txCount = 1 + 1 + size + r.debtors + 1 + r.creditors;
        _report(size);
        _sanity();
    }

    function _line(string memory k, uint256 v) internal view {
        console.log(string.concat("GAS|n=", vm.toString(n), "|", k), v);
    }

    function _report(uint256 size) internal view {
        console.log(string.concat("GAS|--- ", vm.toString(size), "-member lifecycle ---"));
        _line("createGroup", r.createGroup);
        _line("proposePlan", r.propose);
        _line("approvePlan.first", r.approveFirst);
        _line("approvePlan.last", r.approveLast);
        _line("approvePlan.avg", r.approveAvg);
        _line("fund.first", r.fundFirst);
        _line("fund.last", r.fundLast);
        _line("fund.avg", r.fundAvg);
        _line("finalize", r.finalize);
        _line("withdraw.first", r.withdrawFirst);
        _line("withdraw.avg", r.withdrawAvg);
        _line("refund(expiry scenario)", r.refund);
        _line("debtors", r.debtors);
        _line("creditors", r.creditors);
        _line("txCount(create+propose+approvals+funds+finalize+withdrawals)", r.txCount);
        uint256 total = r.createGroup + r.propose + r.approveAvg * size + r.fundAvg * r.debtors + r.finalize
            + r.withdrawAvg * r.creditors;
        _line("approxTotalLifecycleGas", total);
    }

    function _sanity() internal view {
        assertLt(r.createGroup, SANITY);
        assertLt(r.propose, SANITY);
        assertLt(r.approveFirst, SANITY);
        assertLt(r.approveLast, SANITY);
        assertLt(r.fundFirst, SANITY);
        assertLt(r.fundLast, SANITY);
        assertLt(r.finalize, SANITY);
        assertLt(r.withdrawFirst, SANITY);
        assertLt(r.refund, SANITY);
        assertGt(r.txCount, 0);
    }

    function test_Gas_Lifecycle_3Members() public {
        _run(3);
        assertEq(r.txCount, 1 + 1 + 3 + 1 + 1 + 2);
    }

    function test_Gas_Lifecycle_5Members() public {
        _run(5);
        assertEq(r.txCount, 1 + 1 + 5 + 2 + 1 + 3);
    }

    function test_Gas_Lifecycle_8Members() public {
        _run(8);
        assertEq(r.txCount, 1 + 1 + 8 + 4 + 1 + 4);
        assertLt(r.propose, 1_500_000);
    }
}
