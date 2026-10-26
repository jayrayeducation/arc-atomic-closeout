// Read-only Arc Mainnet receipt and event verification. No wallet, key, signature or send method.
import { readFile, writeFile } from 'node:fs/promises'
import { decodeEventLog, decodeFunctionData, decodeFunctionResult, encodeFunctionData, isAddressEqual } from 'viem'

const path = new URL('../docs/mainnet-evidence.json', import.meta.url)
const evidence = JSON.parse(await readFile(path, 'utf8'))
const abi = JSON.parse(await readFile(new URL('../contracts/out/AtomicCloseout.sol/AtomicCloseout.json', import.meta.url), 'utf8')).abi
const usdc = '0x3600000000000000000000000000000000000000'
const transferAbi = [{ type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] }]
const rpc = process.env.ARC_RPC_URL || 'https://rpc.blockdaemon.mainnet.arc.io'
let id = 0
async function call(method, params = []) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`)
  const body = await response.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  if (body.result == null) throw new Error(`${method}: no result`)
  return body.result
}
function assert(ok, message) { if (!ok) throw new Error(message) }
function hexNumber(hex) { return Number(BigInt(hex)) }
function printable(value) { return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item)) }
async function readView(functionName, args) {
  const data = encodeFunctionData({ abi, functionName, args })
  return decodeFunctionResult({ abi, functionName, data: await call('eth_call', [{ to: evidence.contract, data }, 'latest']) })
}

assert(hexNumber(await call('eth_chainId')) === evidence.chainId, 'Wrong RPC chain ID')
const deployHash = evidence.contractDeployment.hash
const deployTx = await call('eth_getTransactionByHash', [deployHash])
const deployReceipt = await call('eth_getTransactionReceipt', [deployHash])
assert(deployReceipt.status === '0x1', 'Deployment receipt failed')
assert(deployTx.to === null, 'Deployment is not a contract creation')
assert(isAddressEqual(deployReceipt.contractAddress, evidence.contract), 'Deployment address mismatch')
assert(hexNumber(deployReceipt.blockNumber) === evidence.contractDeployment.expectedBlock, 'Deployment block mismatch')
assert((await call('eth_getCode', [evidence.contract, 'latest'])).length > 2, 'Contract has no runtime code')
const deploymentBlock = await call('eth_getBlockByNumber', [deployReceipt.blockNumber, false])
evidence.contractDeployment = { ...evidence.contractDeployment, status: 'RPC_VERIFIED', blockNumber: hexNumber(deployReceipt.blockNumber), timestamp: new Date(hexNumber(deploymentBlock.timestamp) * 1000).toISOString(), from: deployTx.from, contractAddress: deployReceipt.contractAddress, explorer: `https://explorer.arc.io/tx/${deployHash}` }

const expectedFunctions = { create: 'createGroup', propose: 'proposePlan', approve_1: 'approvePlan', approve_2: 'approvePlan', approve_3: 'approvePlan', fund_max: 'fund', fund_jon: 'fund', finalize: 'finalize', withdraw: 'withdraw' }
let groupId
let roundId
let planHash
let previousBlock = 0
const actors = new Set()
for (const step of evidence.arcDemo.steps) {
  const [tx, receipt] = await Promise.all([call('eth_getTransactionByHash', [step.hash]), call('eth_getTransactionReceipt', [step.hash])])
  assert(receipt.status === '0x1', `${step.stage}: failed receipt`)
  assert(isAddressEqual(tx.to, evidence.contract), `${step.stage}: wrong target contract`)
  assert(isAddressEqual(receipt.to, evidence.contract), `${step.stage}: receipt target differs`)
  const blockNumber = hexNumber(receipt.blockNumber)
  assert(blockNumber >= previousBlock, `${step.stage}: block order regressed`)
  previousBlock = blockNumber
  const input = decodeFunctionData({ abi, data: tx.input })
  assert(input.functionName === expectedFunctions[step.stage], `${step.stage}: wrong function ${input.functionName}`)
  const events = receipt.logs.filter((log) => isAddressEqual(log.address, evidence.contract)).flatMap((log) => {
    try { return [decodeEventLog({ abi, topics: log.topics, data: log.data })] } catch { return [] }
  })
  const event = events.find((item) => item.eventName === step.event)
  assert(event, `${step.stage}: missing ${step.event} event`)
  const args = event.args
  if (step.stage === 'create') {
    assert(args.name === evidence.arcDemo.label, `Group name is ${args.name}, expected Arc Demo`)
    assert(isAddressEqual(args.creator, tx.from), 'Creator differs from sender')
    groupId = args.groupId
    evidence.arcDemo.groupId = groupId.toString()
    evidence.arcDemo.members = args.members
  } else if (step.stage === 'propose') {
    assert(args.groupId === groupId, 'Proposed plan belongs to a different group')
    assert(args.totalAmount === BigInt(step.expectedUsdcBaseUnits), 'Plan amount differs')
    assert(isAddressEqual(args.proposer, tx.from), 'Proposer differs from sender')
    roundId = args.roundId
    planHash = args.planHash
    evidence.arcDemo.roundId = roundId.toString()
    evidence.arcDemo.planHash = planHash
  } else {
    assert(args.roundId === roundId, `${step.stage}: wrong round ID`)
    if (step.stage.startsWith('approve')) {
      assert(isAddressEqual(args.member, tx.from), `${step.stage}: approving wallet differs from sender`)
      assert(args.planHash === planHash, `${step.stage}: plan hash differs`)
      assert(args.approvalCount === Number(step.stage.at(-1)), `${step.stage}: approval count differs`)
      actors.add(tx.from.toLowerCase())
    }
    if (step.stage.startsWith('fund')) {
      assert(isAddressEqual(args.member, tx.from), `${step.stage}: funder differs from sender`)
      assert(args.amount === BigInt(step.expectedUsdcBaseUnits), `${step.stage}: deposit amount differs`)
    }
    if (step.stage === 'finalize') assert(args.totalAmount === BigInt(step.expectedUsdcBaseUnits) && args.groupId === groupId, 'Finalization amount/group differs')
    if (step.stage === 'withdraw') assert(args.amount === BigInt(step.expectedUsdcBaseUnits) && isAddressEqual(args.member, tx.from), 'Withdrawal amount/member differs')
  }
  if (step.stage.startsWith('fund') || step.stage === 'withdraw') {
    const transfers = receipt.logs.filter((log) => isAddressEqual(log.address, usdc)).flatMap((log) => {
      try { return [decodeEventLog({ abi: transferAbi, topics: log.topics, data: log.data })] } catch { return [] }
    }).filter((item) => item.eventName === 'Transfer')
    const from = step.stage === 'withdraw' ? evidence.contract : tx.from
    const to = step.stage === 'withdraw' ? args.to : evidence.contract
    assert(transfers.some((item) => isAddressEqual(item.args.from, from) && isAddressEqual(item.args.to, to) && item.args.value === BigInt(step.expectedUsdcBaseUnits)), `${step.stage}: matching USDC Transfer missing`)
    step.usdcTransferVerified = true
  }
  const block = await call('eth_getBlockByNumber', [receipt.blockNumber, false])
  Object.assign(step, { status: 'RPC_VERIFIED', blockNumber, timestamp: new Date(hexNumber(block.timestamp) * 1000).toISOString(), from: tx.from, to: tx.to, function: input.functionName, eventArgs: printable(args), explorer: `https://explorer.arc.io/tx/${step.hash}` })
}
assert(actors.size === 3, 'Three approvals were not made by distinct wallets')
assert(evidence.arcDemo.members.length === 3, 'Arc Demo does not have three members')
const demoRound = await readView('getRound', [roundId])
assert(demoRound.groupId === groupId && demoRound.status === 3 && demoRound.totalAmount === 200000n && demoRound.fundedTotal === 200000n && demoRound.withdrawnTotal === 200000n, 'Arc Demo is not fully settled and withdrawn onchain')
evidence.arcDemo.finalState = { status: 'Settled', totalUsdcBaseUnits: demoRound.totalAmount.toString(), fundedUsdcBaseUnits: demoRound.fundedTotal.toString(), withdrawnUsdcBaseUnits: demoRound.withdrawnTotal.toString() }
const firstGroup = await readView('getGroup', [1n])
const firstRound = firstGroup.activeRoundId > 0n ? await readView('getRound', [firstGroup.activeRoundId]) : null
evidence.groupOne = { status: 'RPC_VERIFIED_CURRENT_STATE', groupId: '1', name: firstGroup.name, members: firstGroup.members, activeRoundId: firstGroup.activeRoundId.toString(), round: firstRound ? { statusCode: firstRound.status, totalUsdcBaseUnits: firstRound.totalAmount.toString(), fundedUsdcBaseUnits: firstRound.fundedTotal.toString(), withdrawnUsdcBaseUnits: firstRound.withdrawnTotal.toString() } : null, note: 'Separate earlier run. Its transaction hashes are not part of Arc Demo evidence.' }
evidence.verificationStatus = 'RPC_VERIFIED'
evidence.verifiedAt = new Date().toISOString()
evidence.rpc = rpc
if (process.argv.includes('--write')) await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`)
console.log(JSON.stringify({ status: evidence.verificationStatus, chainId: evidence.chainId, contract: evidence.contract, groupId: evidence.arcDemo.groupId, roundId: evidence.arcDemo.roundId, transactions: evidence.arcDemo.steps.length, deploymentBlock: evidence.contractDeployment.blockNumber, write: process.argv.includes('--write') }))
