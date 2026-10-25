import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'
import { formatUsdc } from '@/onchain-money'

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`

/** Format base units as a fixed 2..6 decimal USDC string with thousands separators. */
export function usdc(raw: bigint, minFraction = 2): string {
  const neg = raw < 0n
  const s = formatUsdc(neg ? -raw : raw)
  const [whole, frac = ''] = s.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(minFraction, '0')
  const w = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${w}${trimmed ? '.' + trimmed : ''}`
}

export function signedUsdc(raw: bigint): string {
  return `${raw > 0n ? '+' : ''}${usdc(raw)}`
}

export function formatDeadline(ts: bigint | number): string {
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function timeLeft(deadline: bigint, nowMs: number): string {
  const s = Number(deadline) - Math.floor(nowMs / 1000)
  if (s <= 0) return 'deadline passed'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  return `${Math.max(m, 1)}m left`
}

const ERROR_COPY: Record<string, string> = {
  NotMember: 'This wallet is not a member of the group.',
  AlreadyApproved: 'This wallet already approved the plan.',
  PlanHashMismatch: 'The plan changed. Reload and review the current plan.',
  WrongStatus: 'This action is not available in the current round state.',
  DeadlinePassed: 'The deadline has passed.',
  AlreadyFunded: 'This wallet has already funded its obligation.',
  NotDebtor: 'This wallet has no obligation to fund in this plan.',
  NotFullyFunded: 'Not every obligation is funded yet.',
  NotCreditor: 'This wallet has no entitlement in this plan.',
  NotSettled: 'The round is not finalized yet.',
  AlreadyWithdrawn: 'This entitlement was already withdrawn.',
  NotRefundable: 'Refunds are available only after the deadline, and only if funding did not complete.',
  NothingToRefund: 'This wallet has no deposit to refund.',
  AlreadyRefunded: 'This deposit was already refunded.',
  RoundStillActive: 'A plan is still active for this group.',
  PlanUnbalanced: 'The plan does not balance.',
  EmptyPlan: 'Everyone is already even. There is nothing to settle.',
  BadDeadline: 'Choose a deadline between 5 minutes and 90 days from now.',
  ZeroRecipient: 'Recipient cannot be the zero address.',
  TransferAmountMismatch: 'The token delivered a different amount than requested.',
  DuplicateMember: 'Each wallet can appear only once.',
  CreatorNotMember: 'The connected wallet must be one of the members.',
}

/** Turn a wallet/viem error into a short, actionable message. Returns null for a user rejection. */
export function describeTxError(err: unknown): string | null {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return null
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name) return ERROR_COPY[name] ?? `The contract rejected this action (${name}).`
    }
    const msg = err.shortMessage || err.message
    if (/user rejected|user denied|rejected the request/i.test(`${msg} ${err.message}`)) return null
    if (/insufficient funds|exceeds balance|exceeds the balance of the account|transfer amount exceeds/i.test(msg)) {
      return 'Insufficient USDC for this action. Network fees are paid from the same USDC balance.'
    }
    if (/allowance/i.test(msg)) return 'USDC allowance is too low. Approve the exact amount first.'
    return msg.split('\n')[0]
  }
  if (err instanceof Error) {
    if (/user rejected|denied/i.test(err.message)) return null
    return err.message.split('\n')[0]
  }
  return 'Something went wrong. Please try again.'
}
