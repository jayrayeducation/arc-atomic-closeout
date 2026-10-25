// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// approvePlan and cancelPlan.
contract ACApprovalTest is ACBase {
    uint256 internal gid;
    uint256 internal rid;
    bytes32 internal h;

    function setUp() public override {
        super.setUp();
        gid = _weekendGroup();
        (rid, h) = _weekendPlan(gid);
    }

    function test_Approve_UnanimityOpensFundingWithEvent() public {
        _approveAs(rid, alex);
        _approveAs(rid, maya);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Approval));
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.PlanApproved(rid, jordan, h, 3);
        vm.expectEmit(true, false, false, false, address(ac));
        emit AtomicCloseout.FundingOpened(rid);
        _approveAs(rid, jordan);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));
        assertEq(ac.getRound(rid).approvalCount, 3);
    }

    function test_Approve_EveryMemberMustApprove() public {
        _approveAs(rid, alex);
        _approveAs(rid, jordan);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(uint8(v.status), uint8(AtomicCloseout.Status.Approval));
        assertEq(v.approvalCount, 2);
        assertTrue(v.approved[0]);
        assertFalse(v.approved[1]);
        assertTrue(v.approved[2]);
        // funding is not open yet
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.fund(rid);
    }

    function test_Approve_StrangerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.approvePlan(rid, h);
    }

    function test_Approve_DuplicateReverts() public {
        _approveAs(rid, maya);
        vm.prank(maya);
        vm.expectRevert(AtomicCloseout.AlreadyApproved.selector);
        ac.approvePlan(rid, h);
    }

    function test_Approve_WrongHashReverts() public {
        vm.prank(maya);
        vm.expectRevert(AtomicCloseout.PlanHashMismatch.selector);
        ac.approvePlan(rid, keccak256("nope"));
    }

    function test_Approve_AfterDeadlineReverts() public {
        vm.warp(T0 + DAY);
        vm.prank(maya);
        vm.expectRevert(AtomicCloseout.DeadlinePassed.selector);
        ac.approvePlan(rid, h);
    }

    function test_Approve_OneSecondBeforeDeadlineOk() public {
        vm.warp(T0 + DAY - 1);
        _approveAs(rid, maya);
        assertEq(ac.getRound(rid).approvalCount, 1);
    }

    function test_Approve_UnknownRoundReverts() public {
        vm.prank(maya);
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.approvePlan(99, h);
    }

    function test_Approve_AfterFundingOpenedReverts() public {
        _approveAll(rid);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.approvePlan(rid, h);
    }

    function test_Approve_NoOneCanApproveForAnother() public {
        // approvePlan takes no member argument: the approval is always attributed to msg.sender
        _approveAs(rid, alex);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertTrue(v.approved[0]);
        assertFalse(v.approved[1]);
        assertFalse(v.approved[2]);
        // a stranger holding the hash cannot approve; neither can a member approve twice to cover another
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.approvePlan(rid, h);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.AlreadyApproved.selector);
        ac.approvePlan(rid, h);
        assertEq(ac.getRound(rid).approvalCount, 1);
    }

    function test_Approve_ProposerMustApproveSeparately() public {
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.proposer, alex);
        assertEq(v.approvalCount, 0);
        assertFalse(v.approved[0]);
        _approveAs(rid, maya);
        _approveAs(rid, jordan);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Approval));
        _approveAs(rid, alex);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));
    }

    function test_Approve_NonUnanimousExpiresAndNeverFunds() public {
        _approveAs(rid, alex);
        _approveAs(rid, maya);
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Expired));
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.fund(rid);
    }

    // ------------------------------------------------------------ cancelPlan
    function test_Cancel_ByProposerInApproval() public {
        vm.expectEmit(true, true, false, false, address(ac));
        emit AtomicCloseout.PlanCancelled(rid, alex);
        vm.prank(alex);
        ac.cancelPlan(rid);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Cancelled));
    }

    function test_Cancel_OnlyProposer() public {
        vm.prank(maya);
        vm.expectRevert(AtomicCloseout.NotProposer.selector);
        ac.cancelPlan(rid);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotProposer.selector);
        ac.cancelPlan(rid);
    }

    function test_Cancel_NotInFunding() public {
        _approveAll(rid);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.cancelPlan(rid);
    }

    function test_Cancel_NotAfterDeadline() public {
        vm.warp(T0 + DAY);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.DeadlinePassed.selector);
        ac.cancelPlan(rid);
    }

    function test_Cancel_TwiceReverts() public {
        vm.prank(alex);
        ac.cancelPlan(rid);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.cancelPlan(rid);
    }

    function test_Cancel_NewPlanAllowedAndOldHashUnapprovable() public {
        _approveAs(rid, maya);
        vm.prank(alex);
        ac.cancelPlan(rid);
        (uint256 rid2, bytes32 h2) = _weekendPlan(gid);
        assertTrue(h2 != h);
        // old round / old hash cannot be approved
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.approvePlan(rid, h);
        // old hash cannot be replayed against the new round
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.PlanHashMismatch.selector);
        ac.approvePlan(rid2, h);
        // new round works with its own hash and old approvals do not carry over
        assertEq(ac.getRound(rid2).approvalCount, 0);
        _approveAll(rid2);
        assertEq(uint8(_status(rid2)), uint8(AtomicCloseout.Status.Funding));
    }

    function test_Cancel_CancelledRoundCannotBeFunded() public {
        vm.prank(alex);
        ac.cancelPlan(rid);
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.fund(rid);
    }
}
