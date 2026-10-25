// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ACBase} from "./AtomicCloseout.Base.t.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {HookToken} from "./mocks/HookToken.sol";
import {ReentrantAttacker} from "./mocks/ReentrantAttacker.sol";
import {FeeOnTransferToken} from "./mocks/FeeOnTransferToken.sol";

/// Reentrancy, fee-on-transfer, native value, replay-binding, donation resilience.
contract ACSecurityTest is ACBase {
    HookToken internal hook;
    ReentrantAttacker internal atk;

    uint256 internal gid; // [atk, maya, jordan]
    uint256 internal decoyRid; // unrelated locked funds the attacker must never reach

    function _setupHook() internal {
        hook = new HookToken();
        _useToken(address(hook));
        atk = new ReentrantAttacker(ac);
        hook.setHookTarget(address(atk));
        vm.prank(address(atk));
        gid = ac.createGroup("Attack", _a3(address(atk), maya, jordan));
        // decoy: another group with 50e6 funded and still locked
        uint256 g2 = _newGroup(_members(2));
        (decoyRid,) = _propose(g2, ms[0], _u2(50e6, 0), _u2(0, 50e6), T0 + DAY);
        _approveAll(decoyRid);
        _fundAs(decoyRid, ms[0]);
    }

    function _approveAtk(uint256 rid) internal {
        atk.doApprove(rid, ac.getRound(rid).planHash);
        _approveAs(rid, maya);
        _approveAs(rid, jordan);
    }

    /// @dev attacker owes 10e6, maya is owed 10e6; funding open.
    function _atkDebtorRound() internal returns (uint256 rid) {
        (rid,) = _propose(gid, maya, _u3(10e6, 0, 0), _u3(0, 10e6, 0), T0 + DAY);
        _approveAtk(rid);
        _mint(address(atk), 10e6);
        atk.approveToken(tok);
    }

    /// @dev maya owes 10e6, attacker is owed 10e6; settled.
    function _atkCreditorRound() internal returns (uint256 rid) {
        (rid,) = _propose(gid, maya, _u3(0, 10e6, 0), _u3(10e6, 0, 0), T0 + DAY);
        _approveAtk(rid);
        _fundAs(rid, maya);
        ac.finalize(rid);
    }

    function _assertBlocked() internal view {
        assertFalse(atk.armed(), "hook fired and consumed the arming");
        assertFalse(atk.lastOk(), "reentrant call must fail");
        assertEq(bytes4(atk.lastRet()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    // ------------------------------------------------------------ reentrancy during fund
    function test_Reentrancy_FundCannotReenterFund() public {
        _setupHook();
        uint256 rid = _atkDebtorRound();
        _fundReenterWith(rid, abi.encodeCall(ac.fund, (rid)));
    }

    function test_Reentrancy_FundCannotReenterFinalize() public {
        _setupHook();
        uint256 rid = _atkDebtorRound();
        _fundReenterWith(rid, abi.encodeCall(ac.finalize, (rid)));
        assertEq(uint8(_status(rid)), uint8(AtomicCloseout.Status.Funding)); // finalize did not slip through
    }

    function test_Reentrancy_FundCannotReenterWithdraw() public {
        _setupHook();
        uint256 rid = _atkDebtorRound();
        _fundReenterWith(rid, abi.encodeCall(ac.withdraw, (rid)));
    }

    function test_Reentrancy_FundCannotReenterRefund() public {
        _setupHook();
        uint256 rid = _atkDebtorRound();
        _fundReenterWith(rid, abi.encodeCall(ac.refund, (rid)));
    }

    function _fundReenterWith(uint256 rid, bytes memory data) internal {
        atk.arm(data);
        atk.doFund(rid);
        _assertBlocked();
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        assertEq(v.fundedTotal, 10e6);
        assertTrue(v.funded[0]);
        assertEq(_bal(address(atk)), 0);
        assertEq(_bal(address(ac)), 60e6); // 50e6 decoy + 10e6
        assertEq(ac.totalLocked(), 60e6);
    }

    // ------------------------------------------------------------ reentrancy during withdraw / withdrawTo
    function _withdrawReenter(bytes memory data, bool viaWithdrawTo) internal {
        atk.arm(data);
        if (viaWithdrawTo) atk.doWithdrawTo(_lastRid, address(atk));
        else atk.doWithdraw(_lastRid);
        _assertBlocked();
        assertEq(_bal(address(atk)), 10e6, "paid exactly once");
        assertEq(_bal(address(ac)), 50e6, "decoy funds untouched");
        assertEq(ac.totalLocked(), 50e6);
        AtomicCloseout.RoundView memory v = ac.getRound(_lastRid);
        assertEq(v.withdrawnTotal, 10e6);
        assertTrue(v.withdrawn[0]);
    }

    uint256 internal _lastRid;

    function test_Reentrancy_WithdrawCannotReenterWithdraw() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.withdraw, (_lastRid)), false);
    }

    function test_Reentrancy_WithdrawCannotReenterWithdrawTo() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.withdrawTo, (_lastRid, address(atk))), false);
    }

    function test_Reentrancy_WithdrawToCannotReenterWithdraw() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.withdraw, (_lastRid)), true);
    }

    function test_Reentrancy_WithdrawCannotReenterFund() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.fund, (_lastRid)), false);
    }

    function test_Reentrancy_WithdrawCannotReenterFinalize() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.finalize, (_lastRid)), false);
    }

    function test_Reentrancy_WithdrawCannotReenterRefund() public {
        _setupHook();
        _lastRid = _atkCreditorRound();
        _withdrawReenter(abi.encodeCall(ac.refund, (_lastRid)), false);
    }

    // ------------------------------------------------------------ reentrancy during refund
    function _expiredAtkDeposit() internal returns (uint256 rid) {
        // attacker and jordan owe 10e6 each, maya is owed 20e6; only attacker funds, then expiry
        (rid,) = _propose(gid, maya, _u3(10e6, 10e6, 0), _u3(0, 0, 20e6), T0 + DAY);
        _approveAtk(rid);
        _mint(address(atk), 10e6);
        atk.approveToken(tok);
        atk.doFund(rid);
        vm.warp(T0 + DAY);
    }

    function _refundReenter(bytes memory data, uint256 rid) internal {
        atk.arm(data);
        atk.doRefund(rid);
        _assertBlocked();
        assertEq(_bal(address(atk)), 10e6, "refunded exactly once");
        assertEq(_bal(address(ac)), 50e6, "decoy funds untouched");
        assertEq(ac.totalLocked(), 50e6);
        assertEq(ac.getRound(rid).refundedTotal, 10e6);
    }

    function test_Reentrancy_RefundCannotReenterRefund() public {
        _setupHook();
        uint256 rid = _expiredAtkDeposit();
        _refundReenter(abi.encodeCall(ac.refund, (rid)), rid);
    }

    function test_Reentrancy_RefundCannotReenterFinalize() public {
        _setupHook();
        uint256 rid = _expiredAtkDeposit();
        _refundReenter(abi.encodeCall(ac.finalize, (rid)), rid);
    }

    function test_Reentrancy_RefundCannotReenterWithdraw() public {
        _setupHook();
        uint256 rid = _expiredAtkDeposit();
        _refundReenter(abi.encodeCall(ac.withdraw, (rid)), rid);
    }

    // ------------------------------------------------------------ fee-on-transfer
    function test_FeeOnTransfer_FundRevertsTransferAmountMismatch() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        _useToken(address(fee));
        uint256 g = _weekendGroup();
        (uint256 rid,) = _weekendPlan(g);
        _approveAll(rid);
        _prep(jordan, 30e6);
        vm.prank(jordan);
        vm.expectRevert(AtomicCloseout.TransferAmountMismatch.selector);
        ac.fund(rid);
        assertEq(_bal(jordan), 30e6, "nothing pulled");
        assertEq(_bal(address(ac)), 0);
        assertEq(ac.totalLocked(), 0);
        assertFalse(ac.getRound(rid).funded[2]);
    }

    function test_FeeOnTransfer_ZeroFeeWorks() public {
        FeeOnTransferToken fee = new FeeOnTransferToken();
        fee.setFeeBps(0);
        _useToken(address(fee));
        uint256 g = _weekendGroup();
        (uint256 rid,) = _weekendPlan(g);
        _settle(rid);
        _wd(rid, alex);
        assertEq(_bal(alex), 25e6);
    }

    // ------------------------------------------------------------ native value
    function test_NativeValue_ContractRejectsPlainTransfer() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(ac).call{value: 1 ether}("");
        assertFalse(ok, "no receive/fallback");
        assertEq(address(ac).balance, 0);
    }

    function test_NativeValue_NoFunctionIsPayable() public {
        vm.deal(address(this), 10 ether);
        uint256 gId = _weekendGroup();
        (uint256 rid,) = _weekendPlan(gId);
        bytes[7] memory calls = [
            abi.encodeCall(ac.createGroup, ("x", _weekendMembers())),
            abi.encodeCall(ac.proposePlan, (gId, _u3(0, 0, 1), _u3(1, 0, 0), T0 + DAY, EXP)),
            abi.encodeCall(ac.approvePlan, (rid, bytes32(0))),
            abi.encodeCall(ac.cancelPlan, (rid)),
            abi.encodeCall(ac.fund, (rid)),
            abi.encodeCall(ac.finalize, (rid)),
            abi.encodeCall(ac.refund, (rid))
        ];
        for (uint256 i; i < calls.length; ++i) {
            (bool ok,) = address(ac).call{value: 1}(calls[i]);
            assertFalse(ok, "payable call must revert");
        }
        (bool ok2,) = address(ac).call{value: 1}(abi.encodeCall(ac.withdraw, (rid)));
        assertFalse(ok2);
        (bool ok3,) = address(ac).call{value: 1}(abi.encodeCall(ac.withdrawTo, (rid, alex)));
        assertFalse(ok3);
        assertEq(address(ac).balance, 0);
    }

    function test_NativeValue_ForcedEthDoesNotAffectAccounting() public {
        vm.deal(address(ac), 5 ether); // simulates selfdestruct-style forced ETH
        uint256 g = _weekendGroup();
        (uint256 rid,) = _weekendPlan(g);
        _settle(rid);
        _wd(rid, alex);
        _wd(rid, maya);
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 0);
    }

    // ------------------------------------------------------------ replay binding
    function test_PlanHash_BoundToContractAddress() public {
        uint256 g = _weekendGroup();
        (uint256 rid, bytes32 h) = _weekendPlan(g);
        AtomicCloseout other = new AtomicCloseout(tok);
        vm.prank(alex);
        other.createGroup("Weekend", _weekendMembers());
        bytes32 h2 = other.computePlanHash(1, rid, _u3(0, 0, 30e6), _u3(25e6, 5e6, 0), T0 + DAY, EXP);
        assertTrue(h != h2);
    }

    function test_PlanHash_BoundToChainId() public {
        uint256 g = _weekendGroup();
        uint128[] memory d = _u3(0, 0, 30e6);
        uint128[] memory c = _u3(25e6, 5e6, 0);
        bytes32 h1 = ac.computePlanHash(g, 1, d, c, T0 + DAY, EXP);
        vm.chainId(31337 + 1);
        bytes32 h2 = ac.computePlanHash(g, 1, d, c, T0 + DAY, EXP);
        assertTrue(h1 != h2);
    }

    function test_DirectDonationDoesNotBreakAccounting() public {
        uint256 g = _weekendGroup();
        (uint256 rid,) = _weekendPlan(g);
        _mint(address(ac), 7e6); // unsolicited donation
        _settle(rid);
        _wd(rid, alex);
        _wd(rid, maya);
        assertEq(_bal(alex), 25e6);
        assertEq(_bal(maya), 5e6);
        assertEq(ac.totalLocked(), 0);
        assertEq(_bal(address(ac)), 7e6); // donation stays stranded, never claimable
    }
}
