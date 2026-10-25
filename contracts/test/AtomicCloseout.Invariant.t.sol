// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {AtomicCloseout} from "../AtomicCloseout.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {PlanGen} from "./mocks/PlanGen.sol";

/// @notice Stateful handler: random propose/approve/fund/finalize/withdraw/refund/cancel/warp over 3 overlapping groups.
contract ACHandler is Test, PlanGen {
    AtomicCloseout public ac;
    MockUSDC public usdc;
    address[6] public actors;
    address public constant SINK = address(0x51AA);
    uint256[] public groups;
    uint256[] public rounds;
    uint256 public minted;

    mapping(uint256 => mapping(address => uint256)) public wdCount;
    mapping(uint256 => mapping(address => uint256)) public rfCount;
    uint256[8] public okCalls; // propose, approve, fund, finalize, withdraw, refund, cancel, warp

    constructor(AtomicCloseout ac_, MockUSDC usdc_) {
        ac = ac_;
        usdc = usdc_;
        for (uint256 i; i < 6; ++i) {
            actors[i] = address(uint160(0xA000 + i));
            usdc.mint(actors[i], 1e30);
            minted += 1e30;
            vm.prank(actors[i]);
            usdc.approve(address(ac), type(uint256).max);
        }
        address[] memory g0 = new address[](3);
        (g0[0], g0[1], g0[2]) = (actors[0], actors[1], actors[2]);
        address[] memory g1 = new address[](4);
        (g1[0], g1[1], g1[2], g1[3]) = (actors[2], actors[3], actors[4], actors[5]);
        address[] memory g2 = new address[](2);
        (g2[0], g2[1]) = (actors[0], actors[3]);
        _mk(g0);
        _mk(g1);
        _mk(g2);
    }

    function _mk(address[] memory m) private {
        vm.prank(m[0]);
        groups.push(ac.createGroup("G", m));
    }

    function roundsLength() external view returns (uint256) {
        return rounds.length;
    }

    function _pick(uint256 rs, uint256 ms) private view returns (uint256 rid, address who, bool ok) {
        if (rounds.length == 0) return (0, address(0), false);
        rid = rounds[rs % rounds.length];
        address[] memory m = ac.getRound(rid).members;
        who = m[ms % m.length];
        ok = true;
    }

    function propose(uint256 gs, uint256 ps, uint256 seed, uint256 dur) external {
        uint256 gid = groups[gs % groups.length];
        address[] memory m = ac.getGroup(gid).members;
        address who = m[ps % m.length];
        (uint128[] memory d, uint128[] memory c) = _genPlan(seed, m.length);
        uint64 dl = uint64(block.timestamp + bound(dur, 5 minutes, 3 days));
        vm.prank(who);
        try ac.proposePlan(gid, d, c, dl, bytes32(seed)) returns (uint256 rid, bytes32) {
            rounds.push(rid);
            ++okCalls[0];
        } catch {}
    }

    function approve(uint256 rs, uint256 ms) external {
        (uint256 rid, address who, bool ok) = _pick(rs, ms);
        if (!ok) return;
        bytes32 h = ac.getRound(rid).planHash;
        vm.prank(who);
        try ac.approvePlan(rid, h) {
            ++okCalls[1];
        } catch {}
    }

    function approveAll(uint256 rs) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        for (uint256 i; i < v.members.length; ++i) {
            vm.prank(v.members[i]);
            try ac.approvePlan(rid, v.planHash) {
                ++okCalls[1];
            } catch {}
        }
    }

    function fund(uint256 rs, uint256 ms) external {
        (uint256 rid, address who, bool ok) = _pick(rs, ms);
        if (!ok) return;
        vm.prank(who);
        try ac.fund(rid) {
            ++okCalls[2];
        } catch {}
    }

    function fundAll(uint256 rs, uint256 skipMask) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        address[] memory m = ac.getRound(rid).members;
        for (uint256 i; i < m.length; ++i) {
            if ((skipMask >> i) & 1 == 1) continue; // leave some debtors unfunded to reach refund paths
            vm.prank(m[i]);
            try ac.fund(rid) {
                ++okCalls[2];
            } catch {}
        }
    }

    function finalize(uint256 rs, uint256 ms) external {
        (uint256 rid, address who, bool ok) = _pick(rs, ms);
        if (!ok) return;
        vm.prank(who);
        try ac.finalize(rid) {
            ++okCalls[3];
        } catch {}
    }

    function withdraw(uint256 rs, uint256 ms, uint256 toSeed) external {
        (uint256 rid, address who, bool ok) = _pick(rs, ms);
        if (!ok) return;
        address to = toSeed % 3 == 0 ? SINK : (toSeed % 3 == 1 ? who : actors[toSeed % 6]);
        vm.prank(who);
        if (toSeed % 2 == 0) {
            try ac.withdraw(rid) {
                ++okCalls[4];
                ++wdCount[rid][who];
            } catch {}
        } else {
            try ac.withdrawTo(rid, to) {
                ++okCalls[4];
                ++wdCount[rid][who];
            } catch {}
        }
    }

    function refund(uint256 rs, uint256 ms) external {
        (uint256 rid, address who, bool ok) = _pick(rs, ms);
        if (!ok) return;
        vm.prank(who);
        try ac.refund(rid) {
            ++okCalls[5];
            ++rfCount[rid][who];
        } catch {}
    }

    function withdrawAll(uint256 rs, uint256 toSeed) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        address[] memory m = ac.getRound(rid).members;
        for (uint256 i; i < m.length; ++i) {
            vm.prank(m[i]);
            try ac.withdrawTo(rid, toSeed % 2 == 0 ? SINK : m[i]) {
                ++okCalls[4];
                ++wdCount[rid][m[i]];
            } catch {}
        }
    }

    function refundAll(uint256 rs) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        address[] memory m = ac.getRound(rid).members;
        for (uint256 i; i < m.length; ++i) {
            vm.prank(m[i]);
            try ac.refund(rid) {
                ++okCalls[5];
                ++rfCount[rid][m[i]];
            } catch {}
        }
    }

    /// @dev approve everyone, fund every debtor and finalize in one step to reach Settled often.
    function settle(uint256 rs) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        AtomicCloseout.RoundView memory v = ac.getRound(rid);
        for (uint256 i; i < v.members.length; ++i) {
            vm.prank(v.members[i]);
            try ac.approvePlan(rid, v.planHash) {} catch {}
        }
        for (uint256 i; i < v.members.length; ++i) {
            vm.prank(v.members[i]);
            try ac.fund(rid) {
                ++okCalls[2];
            } catch {}
        }
        try ac.finalize(rid) {
            ++okCalls[3];
        } catch {}
    }

    function cancel(uint256 rs) external {
        (uint256 rid,, bool ok) = _pick(rs, 0);
        if (!ok) return;
        address p = ac.getRound(rid).proposer;
        vm.prank(p);
        try ac.cancelPlan(rid) {
            ++okCalls[6];
        } catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
        ++okCalls[7];
    }

    function totalActorBalance() external view returns (uint256 s) {
        for (uint256 i; i < 6; ++i) {
            s += usdc.balanceOf(actors[i]);
        }
        s += usdc.balanceOf(SINK);
    }
}

contract ACInvariantTest is Test, PlanGen {
    AtomicCloseout internal ac;
    MockUSDC internal usdc;
    ACHandler internal h;

    function setUp() public {
        vm.warp(1_700_000_000);
        usdc = new MockUSDC();
        ac = new AtomicCloseout(usdc);
        h = new ACHandler(ac, usdc);
        targetContract(address(h));
        bytes4[] memory s = new bytes4[](13);
        s[0] = h.propose.selector;
        s[1] = h.approve.selector;
        s[2] = h.approveAll.selector;
        s[3] = h.fund.selector;
        s[4] = h.fundAll.selector;
        s[5] = h.finalize.selector;
        s[6] = h.withdraw.selector;
        s[7] = h.refund.selector;
        s[8] = h.cancel.selector;
        s[9] = h.warp.selector;
        s[10] = h.withdrawAll.selector;
        s[11] = h.refundAll.selector;
        s[12] = h.settle.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: s}));
    }

    // ---- A
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 150
    function invariant_A_BalanceCoversLocked() public view {
        assertGe(usdc.balanceOf(address(ac)), ac.totalLocked());
    }

    // ---- B: totalLocked = unrefunded deposits of open/expired rounds + unwithdrawn credits of Settled rounds
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 150
    function invariant_B_TotalLockedMatchesRoundState() public view {
        uint256 sum;
        uint256 n = h.roundsLength();
        for (uint256 k; k < n; ++k) {
            AtomicCloseout.RoundView memory v = ac.getRound(h.rounds(k));
            for (uint256 i; i < v.members.length; ++i) {
                if (v.status == AtomicCloseout.Status.Settled) {
                    if (!v.withdrawn[i]) sum += v.credits[i];
                } else if (v.funded[i] && !v.refunded[i]) {
                    sum += v.debts[i];
                }
            }
        }
        assertEq(ac.totalLocked(), sum);
    }

    // ---- C
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 150
    function invariant_C_PerRoundBounds() public view {
        uint256 n = h.roundsLength();
        for (uint256 k; k < n; ++k) {
            uint256 rid = h.rounds(k);
            AtomicCloseout.RoundView memory v = ac.getRound(rid);
            assertLe(v.withdrawnTotal, v.totalAmount);
            assertLe(v.refundedTotal, v.fundedTotal);
            assertLe(v.fundedTotal, v.totalAmount);
            uint256 wd;
            uint256 rf;
            for (uint256 i; i < v.members.length; ++i) {
                address who = v.members[i];
                assertLe(h.wdCount(rid, who), 1, "member withdrew more than once");
                assertLe(h.rfCount(rid, who), 1, "member refunded more than once");
                assertEq(v.withdrawn[i] ? 1 : 0, h.wdCount(rid, who));
                assertEq(v.refunded[i] ? 1 : 0, h.rfCount(rid, who));
                if (v.withdrawn[i]) {
                    wd += v.credits[i];
                    assertGt(v.credits[i], 0);
                    assertTrue(v.status == AtomicCloseout.Status.Settled);
                }
                if (v.refunded[i]) {
                    rf += v.debts[i];
                    assertTrue(v.funded[i]);
                }
            }
            assertEq(wd, v.withdrawnTotal);
            assertEq(rf, v.refundedTotal);
            // a round cannot be both refunded-from and settled
            if (v.status == AtomicCloseout.Status.Settled) assertEq(v.refundedTotal, 0);
        }
    }

    // ---- D
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 150
    function invariant_D_SettledRoundsFullyFunded() public view {
        uint256 n = h.roundsLength();
        for (uint256 k; k < n; ++k) {
            AtomicCloseout.RoundView memory v = ac.getRound(h.rounds(k));
            if (v.status != AtomicCloseout.Status.Settled) continue;
            uint256 cs;
            uint256 ds;
            for (uint256 i; i < v.members.length; ++i) {
                cs += v.credits[i];
                ds += v.debts[i];
            }
            assertEq(v.fundedTotal, cs);
            assertEq(v.fundedTotal, ds);
            assertEq(v.fundedTotal, v.totalAmount);
        }
    }

    // ---- E: token conservation across actors + sink + escrow
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 150
    function invariant_E_TokenConservation() public view {
        assertEq(h.totalActorBalance() + usdc.balanceOf(address(ac)), h.minted());
    }

    /// Optional stats: INV_STATS=1 forge test --match-test invariant_ -vv
    function afterInvariant() public view {
        if (!vm.envOr("INV_STATS", false)) return;
        console.log("calls ok [propose,approve,fund,finalize,withdraw,refund,cancel,warp]");
        for (uint256 i; i < 8; ++i) {
            console.log(h.okCalls(i));
        }
        console.log("rounds", h.roundsLength());
    }

    /// Deterministic sanity: the handler can really drive a round to settlement.
    function test_Handler_ReachesSettlementAndRefund() public {
        h.propose(0, 0, 12345, 1 days);
        assertEq(h.roundsLength(), 1);
        h.approveAll(0);
        h.fundAll(0, 0);
        h.finalize(0, 0);
        assertEq(h.okCalls(3), 1, "finalized");
        h.withdraw(0, 0, 1);
        h.withdraw(0, 1, 1);
        h.withdraw(0, 2, 1);
        assertGt(h.okCalls(4), 0, "withdrawn");
        // find a 4-member plan (group 1) with >= 2 debtors; leave the first debtor unfunded
        uint256 seed;
        uint256 firstDebtor;
        for (uint256 sd = 1; sd < 200 && seed == 0; ++sd) {
            (uint128[] memory d,) = _genPlan(sd, 4);
            uint256 cnt;
            for (uint256 i; i < 4; ++i) {
                if (d[i] > 0) {
                    if (cnt == 0) firstDebtor = i;
                    ++cnt;
                }
            }
            if (cnt >= 2) seed = sd;
        }
        require(seed != 0, "no seed");
        h.propose(1, 0, seed, 1 days);
        h.approveAll(1);
        h.fundAll(1, 1 << firstDebtor);
        h.warp(2 days);
        h.refund(1, 1);
        h.refund(1, 2);
        h.refund(1, 3);
        assertGt(h.okCalls(5), 0, "refunded");
    }
}
