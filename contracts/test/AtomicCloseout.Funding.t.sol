// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";

/// fund and finalize.
contract ACFundingTest is ACBase {
    uint256 internal gid;
    uint256 internal rid;

    function setUp() public override {
        super.setUp();
        (gid, rid) = _weekendFunding(); // alex/maya creditors, jordan owes 30e6; Funding open
    }

    /// @dev 3 members: alex & maya owe 10 each, jordan owed 20; fully approved.
    function _twoDebtors() internal returns (uint256 r) {
        uint256 g = _weekendGroup();
        (r,) = _propose(g, alex, _u3(10e6, 10e6, 0), _u3(0, 0, 20e6), T0 + DAY);
        _approveAll(r);
    }

    // ------------------------------------------------------------ fund
    function test_Fund_BeforeUnanimityReverts() public {
        uint256 g = _weekendGroup();
        (uint256 r,) = _weekendPlan(g);
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.fund(r);
    }

    function test_Fund_AfterDeadlineReverts() public {
        _prep(jordan, 30e6);
        vm.warp(T0 + DAY);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.DeadlinePassed.selector);
        ac.fund(rid);
    }

    function test_Fund_NonMemberReverts() public {
        _prep(stranger, 30e6);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.fund(rid);
    }

    function test_Fund_CreditorReverts_NotDebtor() public {
        _prep(alex, 30e6);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.NotDebtor.selector);
        ac.fund(rid);
    }

    function test_Fund_UnknownRoundReverts() public {
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.fund(42);
    }

    function test_Fund_PullsExactAmountAndEmits() public {
        _prep(jordan, 30e6);
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.Funded(rid, jordan, 30e6, 30e6);
        vm.prank(jordan);
        ac.fund(rid);
        assertEq(_bal(jordan), 0);
        assertEq(_bal(address(ac)), 30e6);
        assertEq(ac.totalLocked(), 30e6);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.fundedTotal, 30e6);
        assertTrue(v.funded[2]);
    }

    function test_Fund_ExtraBalanceNotTouched() public {
        _prep(jordan, 100e6);
        vm.prank(jordan);
        ac.fund(rid);
        assertEq(_bal(jordan), 70e6);
    }

    function test_Fund_DoubleFundingReverts() public {
        _prep(jordan, 60e6);
        vm.prank(jordan);
        ac.fund(rid);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.AlreadyFunded.selector);
        ac.fund(rid);
        assertEq(_bal(address(ac)), 30e6);
    }

    function test_Fund_MissingAllowanceReverts() public {
        _mint(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(ac), 0, 30e6)
        );
        ac.fund(rid);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertFalse(v.funded[2]);
        assertEq(v.fundedTotal, 0);
        assertEq(ac.totalLocked(), 0);
    }

    function test_Fund_InsufficientAllowanceReverts() public {
        _mint(jordan, 30e6);
        vm.prank(jordan);
        tok.approve(address(ac), 30e6 - 1);
        vm.prank(jordan);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(ac), 30e6 - 1, 30e6)
        );
        ac.fund(rid);
    }

    function test_Fund_InsufficientBalanceReverts() public {
        _prep(jordan, 30e6 - 1);
        vm.prank(jordan);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, jordan, 30e6 - 1, 30e6)
        );
        ac.fund(rid);
        assertFalse(ac.getRound(rid).funded[2]);
        assertEq(ac.totalLocked(), 0);
    }

    function test_Fund_BlocklistedDebtorCannotFund() public {
        _prep(jordan, 30e6);
        usdc.setBlocked(jordan, true);
        vm.prank(jordan);
        vm.expectRevert();
        ac.fund(rid);
        assertEq(ac.totalLocked(), 0);
    }

    function test_Fund_LastSecondBeforeDeadlineOk() public {
        vm.warp(T0 + DAY - 1);
        _fundAs(rid, jordan);
        assertEq(ac.getRound(rid).fundedTotal, 30e6);
    }

    // ------------------------------------------------------------ finalize
    function test_Finalize_NotFullyFunded_NothingFunded() public {
        vm.expectRevert(AtomicCloseout.NotFullyFunded.selector);
        ac.finalize(rid);
    }

    function test_Finalize_NotFullyFunded_Partial() public {
        uint256 r = _twoDebtors();
        _fundAs(r, alex);
        vm.expectRevert(AtomicCloseout.NotFullyFunded.selector);
        ac.finalize(r);
        _fundAs(r, maya);
        ac.finalize(r);
        assertEq(uint8(_status(r)), uint8(AtomicCloseout.Status.Settled));
    }

    function test_Finalize_BeforeApprovalsReverts() public {
        uint256 g = _weekendGroup();
        (uint256 r,) = _weekendPlan(g);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.finalize(r);
    }

    function test_Finalize_SucceedsWhenFullyFundedAndEmits() public {
        _fundAs(rid, jordan);
        vm.expectEmit(true, true, true, true, address(ac));
        emit AtomicCloseout.Finalized(rid, gid, 30e6, stranger);
        vm.prank(stranger); // permissionless
        ac.finalize(rid);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Settled));
        assertEq(ac.totalLocked(), 30e6);
        assertEq(_bal(address(ac)), 30e6);
    }

    function test_Finalize_PermissionlessAnyCaller() public {
        _fundAs(rid, jordan);
        vm.prank(address(0xBEEF));
        ac.finalize(rid);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Settled));
    }

    function test_Finalize_WorksAfterDeadlineWhenFullyFunded() public {
        _fundAs(rid, jordan);
        vm.warp(T0 + 30 days);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding)); // fully funded never "expires"
        ac.finalize(rid);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Settled));
    }

    function test_Finalize_AfterDeadlineUnderfundedStillNotFullyFunded() public {
        uint256 r = _twoDebtors();
        _fundAs(r, alex);
        vm.warp(T0 + DAY);
        vm.expectRevert(AtomicCloseout.NotFullyFunded.selector);
        ac.finalize(r);
    }

    function test_Finalize_TwiceReverts() public {
        _fundAs(rid, jordan);
        ac.finalize(rid);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.finalize(rid);
    }

    function test_Finalize_UnknownRoundReverts() public {
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.finalize(77);
    }

    function test_Finalize_RefundImpossibleOnceFullyFunded() public {
        _fundAs(rid, jordan);
        vm.warp(T0 + DAY);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector); // fully funded, unfinalized, past deadline
        ac.refund(rid);
        ac.finalize(rid);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.NotRefundable.selector); // settled
        ac.refund(rid);
        assertEq(_bal(address(ac)), 30e6);
    }

    function test_Finalize_FundAfterSettledReverts() public {
        _fundAs(rid, jordan);
        ac.finalize(rid);
        _mint(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.WrongStatus.selector);
        ac.fund(rid);
    }
}
