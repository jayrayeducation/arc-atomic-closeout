// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

interface IMint {
    function mint(address to, uint256 amount) external;
}

/// @dev Shared fixtures/helpers. Contains no test functions.
abstract contract ACBase is Test {
    AtomicCloseout internal ac;
    MockUSDC internal usdc;
    IERC20 internal tok; // token the current `ac` was deployed with

    address internal alex = makeAddr("alex");
    address internal maya = makeAddr("maya");
    address internal jordan = makeAddr("jordan");
    address internal stranger = makeAddr("stranger");
    address[8] internal ms; // generic members m0..m7

    uint64 internal constant T0 = 1_700_000_000;
    uint64 internal constant DAY = 1 days;
    bytes32 internal constant EXP = keccak256("expenses");

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        _useToken(address(usdc));
        for (uint256 i; i < 8; ++i) {
            ms[i] = makeAddr(string.concat("m", vm.toString(i)));
        }
    }

    // ---------------------------------------------------------------- token / arrays
    function _useToken(address t) internal {
        tok = IERC20(t);
        ac = new AtomicCloseout(tok);
    }

    function _mint(address to, uint256 amount) internal {
        IMint(address(tok)).mint(to, amount);
    }

    function _bal(address a) internal view returns (uint256) {
        return tok.balanceOf(a);
    }

    function _members(uint256 n) internal view returns (address[] memory m) {
        m = new address[](n);
        for (uint256 i; i < n; ++i) {
            m[i] = ms[i];
        }
    }

    function _u2(uint128 a, uint128 b) internal pure returns (uint128[] memory r) {
        r = new uint128[](2);
        r[0] = a;
        r[1] = b;
    }

    function _u3(uint128 a, uint128 b, uint128 c) internal pure returns (uint128[] memory r) {
        r = new uint128[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    function _a3(address a, address b, address c) internal pure returns (address[] memory r) {
        r = new address[](3);
        r[0] = a;
        r[1] = b;
        r[2] = c;
    }

    // ---------------------------------------------------------------- group / plan
    function _newGroup(address[] memory m) internal returns (uint256 gid) {
        vm.prank(m[0]);
        gid = ac.createGroup("Trip", m);
    }

    function _weekendMembers() internal view returns (address[] memory) {
        return _a3(alex, maya, jordan);
    }

    /// @dev Weekend Trip: Alex +25, Maya +5 (credits), Jordan -30 (debt). Members [alex, maya, jordan].
    function _weekendGroup() internal returns (uint256) {
        return _newGroup(_weekendMembers());
    }

    function _propose(uint256 gid, address by, uint128[] memory d, uint128[] memory c, uint64 dl)
        internal
        returns (uint256 rid, bytes32 h)
    {
        vm.prank(by);
        (rid, h) = ac.proposePlan(gid, d, c, dl, EXP);
    }

    function _weekendPlan(uint256 gid) internal returns (uint256 rid, bytes32 h) {
        return _propose(gid, alex, _u3(0, 0, 30e6), _u3(25e6, 5e6, 0), T0 + DAY);
    }

    function _approveAs(uint256 rid, address who) internal {
        bytes32 h = ac.getRound(rid).planHash;
        vm.prank(who);
        ac.approvePlan(rid, h);
    }

    function _approveAll(uint256 rid) internal {
        address[] memory m = ac.getRound(rid).members;
        for (uint256 i; i < m.length; ++i) {
            _approveAs(rid, m[i]);
        }
    }

    /// @dev Mint exactly `amt` to `who` and approve the escrow for it.
    function _prep(address who, uint256 amt) internal {
        _mint(who, amt);
        vm.prank(who);
        tok.approve(address(ac), type(uint256).max);
    }

    function _fundAs(uint256 rid, address who) internal {
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        for (uint256 i; i < v.members.length; ++i) {
            if (v.members[i] == who) _prep(who, v.debts[i]);
        }
        vm.prank(who);
        ac.fund(rid);
    }

    function _fundAll(uint256 rid) internal {
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        for (uint256 i; i < v.members.length; ++i) {
            if (v.debts[i] > 0) _fundAs(rid, v.members[i]);
        }
    }

    function _settle(uint256 rid) internal {
        _approveAll(rid);
        _fundAll(rid);
        ac.finalize(rid);
    }

    function _status(uint256 rid) internal view returns (AtomicCloseout.Status) {
        return ac.roundStatus(rid);
    }

    function _wd(uint256 rid, address who) internal {
        vm.prank(who);
        ac.withdraw(rid);
    }

    function _refundAs(uint256 rid, address who) internal {
        vm.prank(who);
        ac.refund(rid);
    }

    /// @dev Weekend round fully approved, jordan funded or not.
    function _weekendFunding() internal returns (uint256 gid, uint256 rid) {
        gid = _weekendGroup();
        (rid,) = _weekendPlan(gid);
        _approveAll(rid);
    }
}
