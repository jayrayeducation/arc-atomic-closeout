// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// withdraw / withdrawTo / refund.
contract ACPayoutTest is ACBase {
    uint256 internal gid;
    uint256 internal rid;

    function setUp() public override {
        super.setUp();
        gid = _weekendGroup();
        (rid,) = _weekendPlan(gid);
    }

    function _settled() internal {
        _settle(rid);
    }

    /// @dev group m0..m3: m0,m1,m2 owe 10e6 each; m3 is owed 30e6. Fully approved.
    function _four() internal returns (uint256 g, uint256 r) {
        g = _newGroup(_members(4));
        uint128[] memory d = new uint128[](4);
        uint128[] memory c = new uint128[](4);
        d[0] = 10e6;
        d[1] = 10e6;
        d[2] = 10e6;
        c[3] = 30e6;
        (r,) = _propose(g, ms[0], d, c, T0 + DAY);
        _approveAll(r);
    }

    // ------------------------------------------------------------ withdraw
    function test_Withdraw_CreditorGetsExactCredit() public {
        _settled();
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.Withdrawn(rid, alex, alex, 25e6);
        _wd(rid, alex);
        assertEq(_bal(alex), 25e6);
        _wd(rid, maya);
        assertEq(_bal(maya), 5e6);
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.withdrawnTotal, 30e6);
        assertTrue(v.withdrawn[0] && v.withdrawn[1]);
        assertFalse(v.withdrawn[2]);
    }

    function test_Withdraw_DoubleWithdrawReverts() public {
        _settled();
        _wd(rid, alex);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.AlreadyWithdrawn.selector);
        ac.withdraw(rid);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.AlreadyWithdrawn.selector);
        ac.withdrawTo(rid, stranger);
        assertEq(_bal(alex), 25e6);
    }

    function test_Withdraw_DebtorReverts_NotCreditor() public {
        _settled();
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotCreditor.selector);
        ac.withdraw(rid);
    }

    function test_Withdraw_StrangerReverts_NotMember() public {
        _settled();
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.withdraw(rid);
    }

    function test_Withdraw_BeforeSettleReverts_NotSettled() public {
        _approveAll(rid);
        _fundAs(rid, jordan); // fully funded but not finalized
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.NotSettled.selector);
        ac.withdraw(rid);
        ac.finalize(rid);
        _wd(rid, alex);
    }

    function test_Withdraw_UnknownRoundReverts() public {
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.withdraw(5);
    }

    function test_Withdraw_StillWorksLongAfterDeadline() public {
        _settled();
        vm.warp(T0 + 3650 days);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Settled));
        _wd(rid, maya);
        assertEq(_bal(maya), 5e6);
    }

    function test_WithdrawTo_ZeroRecipientReverts() public {
        _settled();
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.ZeroRecipient.selector);
        ac.withdrawTo(rid, address(0));
        assertFalse(ac.getRound(rid).withdrawn[0]);
    }

    function test_WithdrawTo_SendsToChosenAddress() public {
        _settled();
        address dest = makeAddr("dest");
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.Withdrawn(rid, alex, dest, 25e6);
        vm.prank(alex);
        ac.withdrawTo(rid, dest);
        assertEq(_bal(dest), 25e6);
        assertEq(_bal(alex), 0);
        assertEq(ac.totalLocked(), 5e6);
    }

    function test_WithdrawTo_OnlyCreditorCanCall() public {
        _settled();
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotCreditor.selector);
        ac.withdrawTo(rid, jordan);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.withdrawTo(rid, stranger);
        vm.prank(maya); // another creditor cannot take alex's share: she only gets hers
        ac.withdrawTo(rid, stranger);
        assertEq(_bal(stranger), 5e6);
        assertFalse(ac.getRound(rid).withdrawn[0]);
    }

    function test_Withdraw_BlocklistedCreditor_StateUnchangedThenWithdrawToWorks() public {
        _settled();
        usdc.setBlocked(alex, true);
        uint256 lockedBefore = ac.totalLocked();
        vm.prank(alex);
        vm.expectRevert();
        ac.withdraw(rid);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertFalse(v.withdrawn[0]);
        assertEq(v.withdrawnTotal, 0);
        assertEq(ac.totalLocked(), lockedBefore);
        assertEq(_bal(address(ac)), 30e6);
        // other creditors unaffected
        _wd(rid, maya);
        assertEq(_bal(maya), 5e6);
        // blocklisted creditor routes to another address
        address dest = makeAddr("dest");
        vm.prank(alex);
        ac.withdrawTo(rid, dest);
        assertEq(_bal(dest), 25e6);
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 0);
    }

    function test_Withdraw_WithdrawToBlocklistedRecipientReverts() public {
        _settled();
        address bad = makeAddr("bad");
        usdc.setBlocked(bad, true);
        vm.prank(alex);
        vm.expectRevert();
        ac.withdrawTo(rid, bad);
        assertFalse(ac.getRound(rid).withdrawn[0]);
        assertEq(ac.totalLocked(), 30e6);
    }

    // ------------------------------------------------------------ refund
    function test_Refund_NotBeforeDeadline() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector);
        ac.refund(r);
        vm.warp(T0 + DAY - 1);
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector);
        ac.refund(r);
    }

    function test_Refund_DepositorGetsOwnDepositAndEmits() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        assertEq(_bal(ms[0]), 0);
        vm.warp(T0 + DAY);
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.Refunded(r, ms[0], ms[0], 10e6);
        _refundAs(r, ms[0]);
        assertEq(_bal(ms[0]), 10e6);
        assertEq(_bal(ms[1]), 0);
        assertEq(ac.totalLocked(), 10e6);
        assertEq(ac.getRound(r).refundedTotal, 10e6);
        assertTrue(ac.getRound(r).refunded[0]);
    }

    function test_Refund_DoubleRefundReverts() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        vm.warp(T0 + DAY);
        _refundAs(r, ms[0]);
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.AlreadyRefunded.selector);
        ac.refund(r);
        assertEq(_bal(ms[0]), 10e6);
    }

    function test_Refund_NonDepositorReverts_NothingToRefund() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        vm.warp(T0 + DAY);
        vm.prank(ms[2]); // debtor who never funded
        vm.expectRevert(AtomicCloseout.NothingToRefund.selector);
        ac.refund(r);
        vm.prank(ms[3]); // creditor
        vm.expectRevert(AtomicCloseout.NothingToRefund.selector);
        ac.refund(r);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.refund(r);
    }

    function test_Refund_StatusApprovalBecomesExpired() public {
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Approval));
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Expired));
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.NothingToRefund.selector);
        ac.refund(rid);
    }

    function test_Refund_StatusFundingBecomesExpired() public {
        _approveAll(rid);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Expired));
    }

    function test_Refund_StatusRefundedOnceAllDepositsReturned() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(r)), uint8(AtomicCloseout.Status.Expired));
        _refundAs(r, ms[0]);
        assertEq(uint8(_status(r)), uint8(AtomicCloseout.Status.Expired));
        _refundAs(r, ms[1]);
        assertEq(uint8(_status(r)), uint8(AtomicCloseout.Status.Refunded));
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 0);
    }

    function test_Refund_StatusStaysFundingWhenFullyFundedPastDeadline() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        _fundAs(r, ms[2]);
        vm.warp(T0 + 5 days);
        assertEq(uint8(_status(r)), uint8(AtomicCloseout.Status.Funding));
    }

    function test_Refund_MissedDeadlineLetsNobodyTakeOthersDeposits() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        vm.warp(T0 + DAY);
        address[3] memory others = [ms[2], ms[3], stranger];
        for (uint256 i; i < 3; ++i) {
            vm.prank(others[i]);
            vm.expectRevert();
            ac.refund(r);
            assertEq(_bal(others[i]), 0);
        }
        assertEq(_bal(address(ac)), 20e6);
        assertEq(ac.totalLocked(), 20e6);
        _refundAs(r, ms[1]); // each only gets own
        assertEq(_bal(ms[1]), 10e6);
        assertEq(_bal(address(ac)), 10e6);
    }

    function test_Refund_NewRoundProposedWhileOldDepositsRefundable() public {
        (uint256 g, uint256 r) = _four();
        _fundAs(r, ms[0]);
        _fundAs(r, ms[1]);
        vm.warp(T0 + DAY);
        uint128[] memory d = new uint128[](4);
        uint128[] memory c = new uint128[](4);
        d[3] = 5e6;
        c[0] = 5e6;
        (uint256 r2,) = _propose(g, ms[0], d, c, T0 + 3 * DAY); // allowed: old round is Expired
        assertEq(r2, r + 1);
        // old refunds still work, independent of the new round
        _refundAs(r, ms[0]);
        _refundAs(r, ms[1]);
        assertEq(_bal(ms[0]), 10e6);
        assertEq(_bal(ms[1]), 10e6);
        assertEq(ac.totalLocked(), 0);
        // new round proceeds normally
        _approveAll(r2);
        _fundAs(r2, ms[3]);
        ac.finalize(r2);
        _wd(r2, ms[0]);
        assertEq(_bal(ms[0]), 15e6);
    }

    function test_Refund_NotAfterSettledOrCancelled() public {
        _settled();
        (uint256 rid2,) = _weekendPlan(gid);
        vm.prank(alex);
        ac.cancelPlan(rid2);
        vm.warp(T0 + 2 * DAY);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector);
        ac.refund(rid);
        vm.warp(T0 + 5 days);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector);
        ac.refund(rid2);
    }

    function test_Refund_UnknownRoundReverts() public {
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.refund(123);
    }

    function test_Refund_BlocklistedDepositorCannotRefund_StateUnchanged() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        vm.warp(T0 + DAY);
        usdc.setBlocked(ms[0], true);
        vm.prank(ms[0]);
        vm.expectRevert();
        ac.refund(r);
        assertFalse(ac.getRound(r).refunded[0]);
        assertEq(ac.totalLocked(), 10e6);
    }

    function test_RefundTo_BlocklistedDepositorRecoversToOtherAddress() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        vm.warp(T0 + DAY);
        usdc.setBlocked(ms[0], true);
        address rescue = makeAddr("rescue");
        vm.prank(ms[0]);
        ac.refundTo(r, rescue);
        assertEq(_bal(rescue), 10e6);
        assertTrue(ac.getRound(r).refunded[0]);
        assertEq(ac.totalLocked(), 0);
    }

    function test_RefundTo_RevertsZeroRecipient_OnlyOwnDeposit_NoDouble() public {
        (, uint256 r) = _four();
        _fundAs(r, ms[0]);
        vm.warp(T0 + DAY);
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.ZeroRecipient.selector);
        ac.refundTo(r, address(0));
        // a stranger or a member who did not deposit cannot pull another member's deposit
        vm.prank(ms[1]);
        vm.expectRevert(AtomicCloseout.NothingToRefund.selector);
        ac.refundTo(r, ms[1]);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.refundTo(r, stranger);
        vm.prank(ms[0]);
        ac.refundTo(r, ms[0]);
        vm.prank(ms[0]);
        vm.expectRevert(AtomicCloseout.AlreadyRefunded.selector);
        ac.refund(r);
    }
}
