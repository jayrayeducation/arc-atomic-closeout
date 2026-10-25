// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Atomic Closeout
 * @notice NOT AUDITED. Immutable group expense escrow: no admin, no upgrade.
 * ERC-20-only USDC, exactly 6 decimals; Arc USDC is
 * 0x3600000000000000000000000000000000000000 (constructor-injected for testing).
 * No native-value handling. Unanimous approvals precede exact deposits and pull payments.
 * A blocklisted creditor cannot be paid by the contract but may use withdrawTo, and a blocklisted depositor may use refundTo;
 * a blocklisted debtor cannot fund. A group that never reaches unanimity simply expires.
 * Gas fees are paid by the caller and never taken from deposits.
 * @dev Intended compiler: Solidity 0.8.28, Cancun; OpenZeppelin Contracts 5.6.1.
 */
contract AtomicCloseout is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Expired and Refunded are derived, never stored.
    enum Status { None, Approval, Funding, Settled, Expired, Refunded, Cancelled }

    /// @notice Immutable group configuration and latest round pointer.
    struct GroupView {
        uint256 groupId;
        address creator;
        string name;
        uint32 roundCount;
        uint256 activeRoundId;
        address[] members;
    }

    /// @notice Complete round snapshot; all per-member arrays use stable group order.
    struct RoundView {
        uint256 roundId;
        uint256 groupId;
        uint32 roundNumber;
        address proposer;
        Status status;
        uint8 approvalCount;
        uint64 createdAt;
        uint64 deadline;
        bytes32 planHash;
        bytes32 expensesHash;
        uint128 totalAmount;
        uint128 fundedTotal;
        uint128 refundedTotal;
        uint128 withdrawnTotal;
        address[] members;
        uint128[] debts;
        uint128[] credits;
        bool[] approved;
        bool[] funded;
        bool[] refunded;
        bool[] withdrawn;
    }

    struct Group {
        address creator;
        uint32 roundCount;
        string name;
        uint256 activeRoundId;
        address[] members;
        uint256[] rounds;
    }

    struct Round {
        uint256 groupId;
        address proposer;
        uint32 roundNumber;
        Status status;
        uint8 approvalCount;
        uint8 approved;
        uint8 funded;
        uint8 refunded;
        uint8 withdrawn;
        uint64 createdAt;
        uint64 deadline;
        bytes32 planHash;
        bytes32 expensesHash;
        uint128 totalAmount;
        uint128 fundedTotal;
        uint128 refundedTotal;
        uint128 withdrawnTotal;
        uint128[8] debts;
        uint128[8] credits;
    }

    /// @notice Minimum group size.
    uint256 public constant MIN_MEMBERS = 2;
    /// @notice Maximum group size, bounding all member loops.
    uint256 public constant MAX_MEMBERS = 8;
    /// @notice Minimum approval-and-funding window.
    uint256 public constant MIN_DURATION = 5 minutes;
    /// @notice Maximum approval-and-funding window.
    uint256 public constant MAX_DURATION = 90 days;
    /// @notice Maximum UTF-8 name length in bytes.
    uint256 public constant MAX_NAME_BYTES = 64;
    /// @notice Domain tag for the exact immutable plan encoding.
    bytes32 public constant PLAN_TYPEHASH = keccak256("AtomicCloseout.Plan.v1");
    /// @notice Constructor-selected 6-decimal ERC-20 USDC.
    IERC20 public immutable USDC;
    /// @notice Number of groups created; IDs start at one.
    uint256 public groupCount;
    /// @notice Number of rounds created globally; IDs start at one.
    uint256 public roundCount;
    /// @notice Unrefunded deposits plus unwithdrawn entitlements, in USDC base units.
    uint256 public totalLocked;

    mapping(uint256 => Group) private _groups;
    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => mapping(address => uint8)) private _indexPlusOne;

    error InvalidToken();
    error WrongDecimals(uint8 actual);
    error BadGroupSize();
    error BadName();
    error ZeroAddressMember();
    error DuplicateMember();
    error CreatorNotMember();
    error UnknownGroup();
    error UnknownRound();
    error NotMember();
    error ArrayLengthMismatch();
    error NetPositionConflict(uint256 index);
    error PlanUnbalanced(uint256 debtSum, uint256 creditSum);
    error EmptyPlan();
    error BadDeadline();
    error RoundStillActive(uint256 activeRoundId);
    error WrongStatus();
    error DeadlinePassed();
    error PlanHashMismatch();
    error AlreadyApproved();
    error NotProposer();
    error NotDebtor();
    error AlreadyFunded();
    error TransferAmountMismatch();
    error NotFullyFunded();
    error NotCreditor();
    error NotSettled();
    error AlreadyWithdrawn();
    error ZeroRecipient();
    error NotRefundable();
    error NothingToRefund();
    error AlreadyRefunded();
    error AmountOverflow();

    /// @notice A group and its immutable member order were created.
    event GroupCreated(uint256 indexed groupId, address indexed creator, string name, address[] members);
    /// @notice Member added at a zero-based stable index.
    event MemberAdded(uint256 indexed groupId, address indexed member, uint8 index);
    /// @notice An immutable plan awaits every member's approval.
    event PlanProposed(uint256 indexed groupId, uint256 indexed roundId, address indexed proposer,
        bytes32 planHash, uint128 totalAmount, uint64 deadline, bytes32 expensesHash);
    /// @notice A member approved the exact plan hash.
    event PlanApproved(uint256 indexed roundId, address indexed member, bytes32 planHash, uint8 approvalCount);
    /// @notice All members approved; debtors may fund.
    event FundingOpened(uint256 indexed roundId);
    /// @notice The proposer cancelled an unfunded approval-stage plan.
    event PlanCancelled(uint256 indexed roundId, address indexed by);
    /// @notice An exact debtor deposit was received.
    event Funded(uint256 indexed roundId, address indexed member, uint128 amount, uint128 fundedTotal);
    /// @notice Deposits became creditor pull-payment entitlements.
    event Finalized(uint256 indexed roundId, uint256 indexed groupId, uint128 totalAmount, address indexed caller);
    /// @notice A creditor claimed their own entitlement to their chosen recipient.
    event Withdrawn(uint256 indexed roundId, address indexed member, address to, uint128 amount);
    /// @notice A debtor recovered their own expired deposit to themselves or a chosen recipient.
    event Refunded(uint256 indexed roundId, address indexed member, address to, uint128 amount);

    /// @notice Accept only a deployed ERC-20 reporting exactly six decimals.
    constructor(IERC20 usdc_) {
        if (address(usdc_) == address(0) || address(usdc_).code.length == 0) revert InvalidToken();
        (bool ok, bytes memory data) = address(usdc_).staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length != 32) revert InvalidToken();
        uint256 actual = abi.decode(data, (uint256));
        if (actual > type(uint8).max) revert InvalidToken();
        if (actual != 6) revert WrongDecimals(uint8(actual));
        USDC = usdc_;
    }

    /// @notice Create a group including the caller, with immutable unique members and order.
    function createGroup(string calldata name, address[] calldata members) external returns (uint256 groupId) {
        uint256 n = members.length;
        if (n < MIN_MEMBERS || n > MAX_MEMBERS) revert BadGroupSize();
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME_BYTES) revert BadName();
        bool creatorFound;
        for (uint256 i; i < n; ++i) {
            if (members[i] == address(0)) revert ZeroAddressMember();
            if (members[i] == msg.sender) creatorFound = true;
            for (uint256 j; j < i; ++j) {
                if (members[j] == members[i]) revert DuplicateMember();
            }
        }
        if (!creatorFound) revert CreatorNotMember();
        groupId = ++groupCount;
        Group storage g = _groups[groupId];
        g.creator = msg.sender;
        g.name = name;
        g.members = members;
        emit GroupCreated(groupId, msg.sender, name, members);
        for (uint256 i; i < n; ++i) {
            _indexPlusOne[groupId][members[i]] = uint8(i + 1);
            emit MemberAdded(groupId, members[i], uint8(i));
        }
    }

    /// @notice Propose a balanced, nonzero plan without automatically approving it.
    function proposePlan(uint256 groupId, uint128[] calldata debts, uint128[] calldata credits,
        uint64 deadline, bytes32 expensesHash) external returns (uint256 roundId, bytes32 planHash)
    {
        Group storage g = _group(groupId);
        _member(groupId, msg.sender);
        uint256 n = g.members.length;
        if (debts.length != n || credits.length != n) revert ArrayLengthMismatch();
        uint256 debtSum;
        uint256 creditSum;
        for (uint256 i; i < n; ++i) {
            if (debts[i] > 0 && credits[i] > 0) revert NetPositionConflict(i);
            debtSum += debts[i];
            creditSum += credits[i];
        }
        if (debtSum != creditSum) revert PlanUnbalanced(debtSum, creditSum);
        if (debtSum == 0) revert EmptyPlan();
        if (debtSum > type(uint128).max) revert AmountOverflow();
        if (deadline < block.timestamp + MIN_DURATION || deadline > block.timestamp + MAX_DURATION) {
            revert BadDeadline();
        }
        if (g.activeRoundId != 0) {
            Status s = _effectiveStatus(_rounds[g.activeRoundId]);
            if (s == Status.Approval || s == Status.Funding) revert RoundStillActive(g.activeRoundId);
        }
        if (g.roundCount == type(uint32).max) revert AmountOverflow();
        roundId = ++roundCount;
        planHash = _computePlanHash(groupId, roundId, debts, credits, deadline, expensesHash);
        Round storage r = _rounds[roundId];
        r.groupId = groupId;
        r.proposer = msg.sender;
        r.roundNumber = ++g.roundCount;
        r.status = Status.Approval;
        r.createdAt = uint64(block.timestamp);
        r.deadline = deadline;
        r.totalAmount = uint128(debtSum);
        r.expensesHash = expensesHash;
        r.planHash = planHash;
        for (uint256 i; i < n; ++i) {
            r.debts[i] = debts[i];
            r.credits[i] = credits[i];
        }
        g.activeRoundId = roundId;
        g.rounds.push(roundId);
        emit PlanProposed(groupId, roundId, msg.sender, planHash, r.totalAmount, deadline, expensesHash);
    }

    /// @notice Compute the exact chain-, contract-, group-, and round-bound plan digest.
    function computePlanHash(uint256 groupId, uint256 roundId, uint128[] calldata debts,
        uint128[] calldata credits, uint64 deadline, bytes32 expensesHash) external view returns (bytes32)
    {
        _group(groupId);
        return _computePlanHash(groupId, roundId, debts, credits, deadline, expensesHash);
    }

    /// @notice Approve only as yourself, once, for the exact stored hash before expiry.
    function approvePlan(uint256 roundId, bytes32 planHash) external {
        Round storage r = _round(roundId);
        uint8 bit = uint8(1 << _member(r.groupId, msg.sender));
        _beforeDeadline(r, Status.Approval);
        if (planHash != r.planHash) revert PlanHashMismatch();
        if ((r.approved & bit) != 0) revert AlreadyApproved();
        r.approved |= bit;
        ++r.approvalCount;
        emit PlanApproved(roundId, msg.sender, planHash, r.approvalCount);
        if (r.approvalCount == _groups[r.groupId].members.length) {
            r.status = Status.Funding;
            emit FundingOpened(roundId);
        }
    }

    /// @notice Only the proposer may cancel, during Approval and before the deadline.
    function cancelPlan(uint256 roundId) external {
        Round storage r = _round(roundId);
        if (msg.sender != r.proposer) revert NotProposer();
        _beforeDeadline(r, Status.Approval);
        r.status = Status.Cancelled;
        emit PlanCancelled(roundId, msg.sender);
    }

    /// @notice Deposit your entire debt once; reject tokens delivering a different amount.
    function fund(uint256 roundId) external nonReentrant {
        Round storage r = _round(roundId);
        uint8 idx = _member(r.groupId, msg.sender);
        uint128 amount = r.debts[idx];
        if (amount == 0) revert NotDebtor();
        _beforeDeadline(r, Status.Funding);
        uint8 bit = uint8(1 << idx);
        if ((r.funded & bit) != 0) revert AlreadyFunded();
        r.funded |= bit;
        r.fundedTotal += amount;
        totalLocked += amount;
        uint256 beforeBalance = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = USDC.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) revert TransferAmountMismatch();
        emit Funded(roundId, msg.sender, amount, r.fundedTotal);
    }

    /// @notice Anyone may finalize full funding, even after the deadline, without transfers.
    function finalize(uint256 roundId) external nonReentrant {
        Round storage r = _round(roundId);
        if (r.status != Status.Funding) revert WrongStatus();
        if (r.fundedTotal != r.totalAmount) revert NotFullyFunded();
        r.status = Status.Settled;
        emit Finalized(roundId, r.groupId, r.totalAmount, msg.sender);
    }

    /// @notice Claim your settled credit to your own address.
    function withdraw(uint256 roundId) external nonReentrant { _withdraw(roundId, msg.sender); }

    /// @notice Claim only your own settled credit to a nonzero alternative recipient.
    function withdrawTo(uint256 roundId, address to) external nonReentrant { _withdraw(roundId, to); }

    /// @notice Recover only your own deposit to yourself after an incompletely funded expiry.
    function refund(uint256 roundId) external nonReentrant { _refund(roundId, msg.sender); }

    /// @notice Recover only your own deposit to a nonzero alternative recipient (e.g. if your address is blocklisted).
    function refundTo(uint256 roundId, address to) external nonReentrant { _refund(roundId, to); }

    /// @notice Return effective status, including deterministic expiry/refund derivation.
    function roundStatus(uint256 roundId) external view returns (Status) { return _effectiveStatus(_round(roundId)); }

    /// @notice Return membership and zero-based index (zero when absent).
    function memberIndex(uint256 groupId, address who) external view returns (bool isMember, uint8 index) {
        _group(groupId);
        uint8 plusOne = _indexPlusOne[groupId][who];
        return (plusOne != 0, plusOne == 0 ? 0 : plusOne - 1);
    }

    /// @notice Return the immutable group configuration and round counters.
    function getGroup(uint256 groupId) external view returns (GroupView memory) {
        Group storage g = _group(groupId);
        return GroupView(groupId, g.creator, g.name, g.roundCount, g.activeRoundId, g.members);
    }

    /// @notice Return the complete round snapshot in immutable member order; at most eight members.
    function getRound(uint256 roundId) external view returns (RoundView memory v) {
        Round storage r = _round(roundId);
        v.roundId = roundId;
        v.groupId = r.groupId;
        v.roundNumber = r.roundNumber;
        v.proposer = r.proposer;
        v.status = _effectiveStatus(r);
        v.approvalCount = r.approvalCount;
        v.createdAt = r.createdAt;
        v.deadline = r.deadline;
        v.planHash = r.planHash;
        v.expensesHash = r.expensesHash;
        v.totalAmount = r.totalAmount;
        v.fundedTotal = r.fundedTotal;
        v.refundedTotal = r.refundedTotal;
        v.withdrawnTotal = r.withdrawnTotal;
        v.members = _groups[r.groupId].members;
        uint256 n = v.members.length;
        v.debts = new uint128[](n);
        v.credits = new uint128[](n);
        v.approved = new bool[](n);
        v.funded = new bool[](n);
        v.refunded = new bool[](n);
        v.withdrawn = new bool[](n);
        for (uint256 i; i < n; ++i) {
            uint8 bit = uint8(1 << i);
            v.debts[i] = r.debts[i];
            v.credits[i] = r.credits[i];
            v.approved[i] = (r.approved & bit) != 0;
            v.funded[i] = (r.funded & bit) != 0;
            v.refunded[i] = (r.refunded & bit) != 0;
            v.withdrawn[i] = (r.withdrawn & bit) != 0;
        }
    }

    /// @notice All group round IDs; appending costs O(1), but this view copies an unbounded history.
    function groupRounds(uint256 groupId) external view returns (uint256[] memory roundIds) {
        return _group(groupId).rounds;
    }

    function _withdraw(uint256 roundId, address to) private {
        Round storage r = _round(roundId);
        uint8 idx = _member(r.groupId, msg.sender);
        uint128 amount = r.credits[idx];
        if (amount == 0) revert NotCreditor();
        if (r.status != Status.Settled) revert NotSettled();
        uint8 bit = uint8(1 << idx);
        if ((r.withdrawn & bit) != 0) revert AlreadyWithdrawn();
        if (to == address(0)) revert ZeroRecipient();
        r.withdrawn |= bit;
        r.withdrawnTotal += amount;
        totalLocked -= amount;
        USDC.safeTransfer(to, amount);
        emit Withdrawn(roundId, msg.sender, to, amount);
    }

    function _refund(uint256 roundId, address to) private {
        Round storage r = _round(roundId);
        if ((r.status != Status.Approval && r.status != Status.Funding)
            || block.timestamp < r.deadline || r.fundedTotal == r.totalAmount) revert NotRefundable();
        uint8 idx = _member(r.groupId, msg.sender);
        uint8 bit = uint8(1 << idx);
        if ((r.funded & bit) == 0) revert NothingToRefund();
        if ((r.refunded & bit) != 0) revert AlreadyRefunded();
        if (to == address(0)) revert ZeroRecipient();
        uint128 amount = r.debts[idx];
        r.refunded |= bit;
        r.refundedTotal += amount;
        totalLocked -= amount;
        USDC.safeTransfer(to, amount);
        emit Refunded(roundId, msg.sender, to, amount);
    }

    function _effectiveStatus(Round storage r) private view returns (Status) {
        if (r.status == Status.Approval || r.status == Status.Funding) {
            if (r.status == Status.Funding && r.fundedTotal == r.totalAmount) return Status.Funding;
            if (block.timestamp >= r.deadline) {
                return r.fundedTotal > 0 && r.refundedTotal == r.fundedTotal ? Status.Refunded : Status.Expired;
            }
        }
        return r.status;
    }

    function _beforeDeadline(Round storage r, Status expected) private view {
        if (r.status != expected) revert WrongStatus();
        if (block.timestamp >= r.deadline) revert DeadlinePassed();
    }

    function _group(uint256 groupId) private view returns (Group storage g) {
        g = _groups[groupId];
        if (g.creator == address(0)) revert UnknownGroup();
    }

    function _round(uint256 roundId) private view returns (Round storage r) {
        r = _rounds[roundId];
        if (r.status == Status.None) revert UnknownRound();
    }

    function _member(uint256 groupId, address who) private view returns (uint8) {
        uint8 plusOne = _indexPlusOne[groupId][who];
        if (plusOne == 0) revert NotMember();
        return plusOne - 1;
    }

    function _computePlanHash(uint256 groupId, uint256 roundId, uint128[] calldata debts,
        uint128[] calldata credits, uint64 deadline, bytes32 expensesHash) private view returns (bytes32)
    {
        return keccak256(abi.encode(PLAN_TYPEHASH, block.chainid, address(this), groupId, roundId,
            _groups[groupId].members, debts, credits, deadline, expensesHash));
    }
}
