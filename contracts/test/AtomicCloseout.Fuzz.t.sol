// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {PlanGen} from "./mocks/PlanGen.sol";

/// Property tests over random valid plans.
contract ACFuzzTest is ACBase, PlanGen {
    /// (1) Random balanced plan, 2..8 members, every phase executed in a shuffled member order.
    function testFuzz_RandomPlanFullLifecycle(uint256 seed, uint8 nRaw, uint256 shuffleSeed) public {
        uint256 n = bound(nRaw, 2, 8);
        (uint128[] memory d, uint128[] memory c) = _genPlan(seed, n);
        address[] memory m = _members(n);
        uint256 gid = _newGroup(m);
        (uint256 rid,) = _propose(gid, m[seed % n], d, c, T0 + DAY);
        uint256 total = ac.getRound(rid).totalAmount;
        assertGt(total, 0);

        uint256[] memory order = _shuffle(n, shuffleSeed);
        for (uint256 k; k < n; ++k) {
            assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Approval));
            skip(shuffleSeed % 7);
            _approveAs(rid, m[order[k]]);
        }
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));

        order = _shuffle(n, uint256(keccak256(abi.encode(shuffleSeed, 1))));
        for (uint256 k; k < n; ++k) {
            if (d[order[k]] > 0) {
                skip(shuffleSeed % 5);
                _fundAs(rid, m[order[k]]);
            }
        }
        assertEq(ac.totalLocked(), total);
        assertEq(_bal(address(ac)), total);

        order = _shuffle(n, uint256(keccak256(abi.encode(shuffleSeed, 2))));
        vm.prank(m[order[0]]); // any member (or anyone) may finalize
        ac.finalize(rid);

        order = _shuffle(n, uint256(keccak256(abi.encode(shuffleSeed, 3))));
        for (uint256 k; k < n; ++k) {
            if (c[order[k]] > 0) _wd(rid, m[order[k]]);
        }

        for (uint256 i; i < n; ++i) {
            if (d[i] > 0) assertEq(_bal(m[i]), 0, "debtor paid exactly its debt");
            else assertEq(_bal(m[i]), c[i], "creditor received exactly its credit");
        }
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.fundedTotal, total);
        assertEq(v.withdrawnTotal, total);
        assertEq(uint8(v.status), uint8(AtomicCloseout.Status.Settled));
    }

    /// Debtors pay exactly debts even when they hold surplus balance beforehand.
    function testFuzz_DebtorsPayExactlyDebtWithSurplus(uint256 seed, uint8 nRaw, uint96 surplus) public {
        uint256 n = bound(nRaw, 2, 8);
        (uint128[] memory d, uint128[] memory c) = _genPlan(seed, n);
        address[] memory m = _members(n);
        uint256 gid = _newGroup(m);
        (uint256 rid,) = _propose(gid, m[0], d, c, T0 + DAY);
        _approveAll(rid);
        for (uint256 i; i < n; ++i) {
            if (d[i] > 0) {
                _mint(m[i], surplus);
                _fundAs(rid, m[i]);
                assertEq(_bal(m[i]), surplus);
            }
        }
        ac.finalize(rid);
        for (uint256 i; i < n; ++i) {
            if (c[i] > 0) _wd(rid, m[i]);
        }
        for (uint256 i; i < n; ++i) {
            assertEq(_bal(m[i]), d[i] > 0 ? surplus : c[i]);
        }
        assertEq(_bal(address(ac)), 0);
    }

    /// Partial funding then expiry: each funder gets exactly its deposit back, nobody else gains.
    function testFuzz_PartialFundingRefundsExactly(uint256 seed, uint8 nRaw, uint8 mask) public {
        uint256 n = bound(nRaw, 2, 8);
        (uint128[] memory d, uint128[] memory c) = _genPlan(seed, n);
        address[] memory m = _members(n);
        uint256 gid = _newGroup(m);
        (uint256 rid,) = _propose(gid, m[0], d, c, T0 + DAY);
        _approveAll(rid);
        uint256 funders;
        uint256 debtors;
        for (uint256 i; i < n; ++i) {
            if (d[i] == 0) continue;
            ++debtors;
            if ((mask >> i) & 1 == 1) {
                _fundAs(rid, m[i]);
                ++funders;
            }
        }
        vm.warp(T0 + DAY);
        if (funders == debtors) {
            // fully funded: refunds impossible, finalize still possible
            for (uint256 i; i < n; ++i) {
                vm.prank(m[i]);
                vm.expectRevert(AtomicCloseout.NotRefundable.selector);
                ac.refund(rid);
            }
            ac.finalize(rid);
            assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Settled));
            return;
        }
        for (uint256 i; i < n; ++i) {
            if (d[i] > 0 && (mask >> i) & 1 == 1) {
                _refundAs(rid, m[i]);
                assertEq(_bal(m[i]), d[i]);
            } else {
                vm.prank(m[i]);
                vm.expectRevert(AtomicCloseout.NothingToRefund.selector);
                ac.refund(rid);
                assertEq(_bal(m[i]), 0);
            }
        }
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        AtomicCloseout.Status expected =
            funders > 0 ? AtomicCloseout.Status.Refunded : AtomicCloseout.Status.Expired;
        assertEq(uint8(_status(rid)), uint8(expected));
    }

    /// Plan balance rule over arbitrary single-pair amounts.
    function testFuzz_PlanBalanceRule(uint128 a, uint128 b) public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, a);
        uint128[] memory c = _u3(b, 0, 0);
        vm.prank(alex);
        if (a != b) {
            vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.PlanUnbalanced.selector, uint256(a), uint256(b)));
            ac.proposePlan(gid, d, c, T0 + DAY, EXP);
        } else if (a == 0) {
            vm.expectRevert(AtomicCloseout.EmptyPlan.selector);
            ac.proposePlan(gid, d, c, T0 + DAY, EXP);
        } else {
            (uint256 rid,) = ac.proposePlan(gid, d, c, T0 + DAY, EXP);
            assertEq(ac.getRound(rid).totalAmount, a);
        }
    }

    /// Deadline window bounds hold for every timestamp offset.
    function testFuzz_DeadlineWindow(uint64 offset) public {
        uint256 gid = _weekendGroup();
        offset = uint64(bound(offset, 0, 200 days));
        vm.prank(alex);
        if (offset < 5 minutes || offset > 90 days) {
            vm.expectRevert(AtomicCloseout.BadDeadline.selector);
            ac.proposePlan(gid, _u3(0, 0, 1), _u3(1, 0, 0), T0 + offset, EXP);
        } else {
            ac.proposePlan(gid, _u3(0, 0, 1), _u3(1, 0, 0), T0 + offset, EXP);
        }
    }

    /// Stored hash always equals an independent recomputation and the public view.
    function testFuzz_PlanHashIndependent(uint256 seed, uint8 nRaw, bytes32 exp) public {
        uint256 n = bound(nRaw, 2, 8);
        (uint128[] memory d, uint128[] memory c) = _genPlan(seed, n);
        address[] memory m = _members(n);
        uint256 gid = _newGroup(m);
        vm.prank(m[0]);
        (uint256 rid, bytes32 h) = ac.proposePlan(gid, d, c, T0 + DAY, exp);
        assertEq(h, _expectedHash(gid, rid, m, d, c, exp));
        assertEq(ac.computePlanHash(gid, rid, d, c, T0 + DAY, exp), h);
    }

    function _expectedHash(
        uint256 gid,
        uint256 rid,
        address[] memory m,
        uint128[] memory d,
        uint128[] memory c,
        bytes32 exp
    ) internal view returns (bytes32) {
        return keccak256(abi.encode(ac.PLAN_TYPEHASH(), block.chainid, address(ac), gid, rid, m, d, c, T0 + DAY, exp));
    }

    /// Whatever the order, a non-member can never move funds.
    function testFuzz_StrangerCannotTouchRound(address who, uint8 which) public {
        vm.assume(who != alex && who != maya && who != jordan);
        (uint256 g, uint256 rid) = _weekendFunding();
        g;
        _fundAs(rid, jordan);
        ac.finalize(rid);
        vm.startPrank(who);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        if (which % 3 == 0) ac.withdraw(rid);
        else if (which % 3 == 1) ac.withdrawTo(rid, who);
        else ac.fund(rid);
        vm.stopPrank();
        assertEq(_bal(address(ac)), 30e6);
    }
}
