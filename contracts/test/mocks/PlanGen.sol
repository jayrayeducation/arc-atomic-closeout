// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Deterministic random valid-plan generator: random net positions that sum to zero.
abstract contract PlanGen {
    /// @dev Net positions in [-1e9, 1e9] (some zero), last member absorbs the remainder so the sum is 0.
    ///      Member 0 is always non-zero so the plan is never empty. debts = owes (net < 0), credits = owed (net > 0).
    function _genPlan(uint256 seed, uint256 n) internal pure returns (uint128[] memory d, uint128[] memory c) {
        d = new uint128[](n);
        c = new uint128[](n);
        int256[] memory nets = new int256[](n);
        int256 sum;
        for (uint256 i; i + 1 < n; ++i) {
            uint256 r = uint256(keccak256(abi.encode(seed, i)));
            int256 v = int256(r % 2_000_000_001) - 1_000_000_000;
            if (i == 0 && v == 0) v = 1;
            if (i != 0 && (r >> 200) % 4 == 0) v = 0;
            nets[i] = v;
            sum += v;
        }
        nets[n - 1] = -sum;
        for (uint256 i; i < n; ++i) {
            if (nets[i] < 0) d[i] = uint128(uint256(-nets[i]));
            else c[i] = uint128(uint256(nets[i]));
        }
    }

    function _shuffle(uint256 n, uint256 s) internal pure returns (uint256[] memory o) {
        o = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            o[i] = i;
        }
        for (uint256 i = n - 1; i > 0; --i) {
            s = uint256(keccak256(abi.encode(s, i)));
            uint256 j = s % (i + 1);
            (o[i], o[j]) = (o[j], o[i]);
        }
    }
}
