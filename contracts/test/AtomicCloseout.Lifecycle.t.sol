// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {MockToken18} from "./mocks/MockToken18.sol";

/// Constructor, createGroup, proposePlan.
contract ACLifecycleTest is ACBase {
    // ------------------------------------------------------------ constructor
    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(AtomicCloseout.InvalidToken.selector);
        new AtomicCloseout(IERC20(address(0)));
    }

    function test_Constructor_RejectsEOA() public {
        IERC20 eoa = IERC20(makeAddr("eoa"));
        vm.expectRevert(AtomicCloseout.InvalidToken.selector);
        new AtomicCloseout(eoa);
    }

    function test_Constructor_RejectsContractWithoutDecimals() public {
        vm.expectRevert(AtomicCloseout.InvalidToken.selector);
        new AtomicCloseout(IERC20(address(this)));
    }

    function test_Constructor_Rejects18Decimals() public {
        MockToken18 t18 = new MockToken18();
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.WrongDecimals.selector, uint8(18)));
        new AtomicCloseout(IERC20(address(t18)));
    }

    function test_Constructor_Accepts6Decimals() public view {
        assertEq(address(ac.USDC()), address(usdc));
        assertEq(ac.groupCount(), 0);
        assertEq(ac.roundCount(), 0);
        assertEq(ac.totalLocked(), 0);
    }

    // ------------------------------------------------------------ createGroup
    function test_CreateGroup_Bounds_OneMemberReverts() public {
        address[] memory m = _members(1);
        vm.prank(m[0]);
        vm.expectRevert(AtomicCloseout.BadGroupSize.selector);
        ac.createGroup("Solo", m);
    }

    function test_CreateGroup_Bounds_NineMembersRevert() public {
        address[] memory m = new address[](9);
        for (uint256 i; i < 8; ++i) m[i] = ms[i];
        m[8] = makeAddr("m8");
        vm.prank(m[0]);
        vm.expectRevert(AtomicCloseout.BadGroupSize.selector);
        ac.createGroup("Big", m);
    }

    function test_CreateGroup_Bounds_TwoAndEightAccepted() public {
        assertEq(_newGroup(_members(2)), 1);
        assertEq(_newGroup(_members(8)), 2);
        assertEq(ac.getGroup(2).members.length, 8);
    }

    function test_CreateGroup_RevertsOnDuplicateMember() public {
        address[] memory m = _a3(alex, maya, alex);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.DuplicateMember.selector);
        ac.createGroup("Dup", m);
    }

    function test_CreateGroup_RevertsOnZeroMember() public {
        address[] memory m = _a3(alex, address(0), maya);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.ZeroAddressMember.selector);
        ac.createGroup("Zero", m);
    }

    function test_CreateGroup_RevertsWhenCreatorNotMember() public {
        address[] memory m = _a3(alex, maya, jordan);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.CreatorNotMember.selector);
        ac.createGroup("Out", m);
    }

    function test_CreateGroup_RevertsOnEmptyName() public {
        address[] memory m = _weekendMembers();
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.BadName.selector);
        ac.createGroup("", m);
    }

    function test_CreateGroup_RevertsOnTooLongName() public {
        address[] memory m = _weekendMembers();
        string memory ok64 = new string(64);
        string memory bad65 = new string(65);
        vm.prank(alex);
        ac.createGroup(ok64, m); // 64 bytes is the inclusive max
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.BadName.selector);
        ac.createGroup(bad65, m);
    }

    function test_CreateGroup_StableMemberOrderAndIndex() public {
        address[] memory m = _a3(maya, jordan, alex);
        vm.prank(alex);
        uint256 gid = ac.createGroup("Order", m);
        AtomicCloseout.GroupView memory g = ac.getGroup(gid);
        assertEq(g.members[0], maya);
        assertEq(g.members[1], jordan);
        assertEq(g.members[2], alex);
        assertEq(g.creator, alex);
        assertEq(g.name, "Order");
        assertEq(g.roundCount, 0);
        assertEq(g.activeRoundId, 0);
        for (uint256 i; i < 3; ++i) {
            (bool isM, uint8 idx) = ac.memberIndex(gid, m[i]);
            assertTrue(isM);
            assertEq(idx, i);
        }
        (bool s,) = ac.memberIndex(gid, stranger);
        assertFalse(s);
    }

    function test_CreateGroup_EmitsGroupCreatedAndMemberAdded() public {
        address[] memory m = _weekendMembers();
        vm.expectEmit(true, true, false, true, address(ac));
        emit AtomicCloseout.GroupCreated(1, alex, "Weekend", m);
        for (uint8 i; i < 3; ++i) {
            vm.expectEmit(true, true, false, true, address(ac));
            emit AtomicCloseout.MemberAdded(1, m[i], i);
        }
        vm.prank(alex);
        ac.createGroup("Weekend", m);
    }

    function test_CreateGroup_UnknownGroupViewsRevert() public {
        vm.expectRevert(AtomicCloseout.UnknownGroup.selector);
        ac.getGroup(1);
        vm.expectRevert(AtomicCloseout.UnknownRound.selector);
        ac.getRound(1);
    }

    // ------------------------------------------------------------ proposePlan
    function test_Propose_BalancedPlanOk() public {
        uint256 gid = _weekendGroup();
        vm.expectEmit(true, true, true, false, address(ac));
        emit AtomicCloseout.PlanProposed(gid, 1, alex, bytes32(0), 30e6, 0, EXP);
        (uint256 rid,) = _weekendPlan(gid);
        assertEq(rid, 1);
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(uint8(v.status), uint8(AtomicCloseout.Status.Approval));
        assertEq(v.totalAmount, 30e6);
        assertEq(v.proposer, alex);
        assertEq(v.roundNumber, 1);
        assertEq(v.deadline, T0 + DAY);
        assertEq(v.createdAt, T0);
        assertEq(v.expensesHash, EXP);
        assertEq(ac.getGroup(gid).activeRoundId, rid);
        assertEq(ac.groupRounds(gid).length, 1);
    }

    function test_Propose_RevertsWhenUnbalanced() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 0, 0);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.PlanUnbalanced.selector, 30e6, 25e6));
        ac.proposePlan(gid, d, c, T0 + DAY, EXP);
    }

    function test_Propose_RevertsOnNetPositionConflict() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 10, 10);
        uint128[] memory c = _u3(0, 10, 10); // member 1 owes AND is owed
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.NetPositionConflict.selector, 1));
        ac.proposePlan(gid, d, c, T0 + DAY, EXP);
    }

    function test_Propose_RevertsOnEmptyPlan() public {
        uint256 gid = _weekendGroup();
        uint128[] memory z = _u3(0, 0, 0);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.EmptyPlan.selector);
        ac.proposePlan(gid, z, z, T0 + DAY, EXP);
    }

    function test_Propose_RevertsOnArrayLengthMismatch() public {
        uint256 gid = _weekendGroup();
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.ArrayLengthMismatch.selector);
        ac.proposePlan(gid, _u2(0, 10), _u3(10, 0, 0), T0 + DAY, EXP);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.ArrayLengthMismatch.selector);
        ac.proposePlan(gid, _u3(0, 0, 10), _u2(10, 0), T0 + DAY, EXP);
    }

    function test_Propose_DeadlineTooSoonReverts() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.BadDeadline.selector);
        ac.proposePlan(gid, d, c, T0 + 5 minutes - 1, EXP);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.BadDeadline.selector);
        ac.proposePlan(gid, d, c, T0 - 1, EXP);
        _propose(gid, alex, d, c, T0 + 5 minutes); // exact minimum accepted
    }

    function test_Propose_DeadlineTooFarReverts() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.BadDeadline.selector);
        ac.proposePlan(gid, d, c, T0 + 90 days + 1, EXP);
        _propose(gid, alex, d, c, T0 + 90 days); // exact maximum accepted
    }

    function test_Propose_NonMemberProposerReverts() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        vm.prank(stranger);
        vm.expectRevert(AtomicCloseout.NotMember.selector);
        ac.proposePlan(gid, d, c, T0 + DAY, EXP);
    }

    function test_Propose_UnknownGroupReverts() public {
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        vm.prank(alex);
        vm.expectRevert(AtomicCloseout.UnknownGroup.selector);
        ac.proposePlan(7, d, c, T0 + DAY, EXP);
    }

    function test_Propose_BlockedWhileApproval() public {
        uint256 gid = _weekendGroup();
        (uint256 rid,) = _weekendPlan(gid);
        uint128[] memory d = _u3(0, 0, 1);
        uint128[] memory c = _u3(1, 0, 0);
        vm.prank(maya);
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.RoundStillActive.selector, rid));
        ac.proposePlan(gid, d, c, T0 + DAY, EXP);
    }

    function test_Propose_BlockedWhileFunding() public {
        (uint256 gid, uint256 rid) = _weekendFunding();
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding));
        uint128[] memory d = _u3(0, 0, 1);
        uint128[] memory c = _u3(1, 0, 0);
        vm.prank(maya);
        vm.expectRevert(abi.encodeWithSelector(AtomicCloseout.RoundStillActive.selector, rid));
        ac.proposePlan(gid, d, c, T0 + DAY, EXP);
    }

    function test_Propose_AllowedAfterSettled() public {
        uint256 gid = _weekendGroup();
        (uint256 rid,) = _weekendPlan(gid);
        _settle(rid);
        (uint256 rid2,) = _weekendPlan(gid);
        assertEq(rid2, 2);
        assertEq(ac.getRound(rid2).roundNumber, 2);
        assertEq(ac.getGroup(gid).activeRoundId, 2);
    }

    function test_Propose_AllowedAfterExpired() public {
        uint256 gid = _weekendGroup();
        (uint256 rid,) = _weekendPlan(gid);
        vm.warp(T0 + DAY);
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Expired));
        (uint256 rid2,) = _propose(gid, alex, _u3(0, 0, 30e6), _u3(25e6, 5e6, 0), T0 + 2 * DAY);
        assertEq(rid2, 2);
    }

    function test_Propose_AllowedAfterRefunded() public {
        (uint256 g2, uint256 r2) = _twoDebtorRound();
        _fundAs(r2, alex);
        vm.warp(T0 + DAY);
        _refundAs(r2, alex);
        assertEq(uint8(_status(r2)), uint8(AtomicCloseout.Status.Refunded));
        (uint256 r3,) = _propose(g2, alex, _u3(0, 0, 10), _u3(10, 0, 0), T0 + 2 * DAY);
        assertEq(r3, r2 + 1);
    }

    function test_Propose_AllowedAfterCancelled() public {
        uint256 gid = _weekendGroup();
        (uint256 rid,) = _weekendPlan(gid);
        vm.prank(alex);
        ac.cancelPlan(rid);
        (uint256 rid2,) = _weekendPlan(gid);
        assertEq(rid2, 2);
    }

    function test_Propose_PlanHashMatchesIndependentRecompute() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        (uint256 rid, bytes32 h) = _propose(gid, alex, d, c, T0 + DAY);
        bytes32 expected = keccak256(
            abi.encode(
                ac.PLAN_TYPEHASH(), block.chainid, address(ac), gid, rid, _weekendMembers(), d, c, T0 + DAY, EXP
            )
        );
        assertEq(h, expected);
        assertEq(ac.getRound(rid).planHash, expected);
        assertEq(ac.computePlanHash(gid, rid, d, c, T0 + DAY, EXP), expected);
        assertEq(ac.PLAN_TYPEHASH(), keccak256("AtomicCloseout.Plan.v1"));
    }

    function test_Propose_PlanHashBindsRoundAndDeadline() public {
        uint256 gid = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        bytes32 h1 = ac.computePlanHash(gid, 1, d, c, T0 + DAY, EXP);
        assertTrue(h1 != ac.computePlanHash(gid, 2, d, c, T0 + DAY, EXP));
        assertTrue(h1 != ac.computePlanHash(gid, 1, d, c, T0 + DAY + 1, EXP));
        assertTrue(h1 != ac.computePlanHash(gid, 1, d, c, T0 + DAY, bytes32(0)));
    }

    /// @dev 3 members: alex & maya owe 10 each, jordan is owed 20.
    function _twoDebtorRound() internal returns (uint256 gid, uint256 rid) {
        gid = _weekendGroup();
        uint128[] memory d = _u3(10e6, 10e6, 0);
        uint128[] memory c = _u3(0, 0, 20e6);
        (rid,) = _propose(gid, alex, d, c, T0 + DAY);
        _approveAll(rid);
    }
}
