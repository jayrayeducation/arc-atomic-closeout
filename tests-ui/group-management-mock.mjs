// Local-only Group #1 UX rehearsal. Every chain value below is MOCK DATA; no network or signature.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, toFunctionSelector } from 'viem'

const host = 'http://127.0.0.1:4178'
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const contract = '0xe05790767da98b524472ea9d78459aca4fb3b6c6'
const members = ['0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']
const abi = JSON.parse(await readFile('contracts/out/AtomicCloseout.sol/AtomicCloseout.json', 'utf8')).abi
const hash = `0x${'12'.repeat(32)}`
const blockHash = `0x${'ab'.repeat(32)}`
const group = { groupId: 1n, creator: members[0], name: 'MOCK settled group', roundCount: 1, activeRoundId: 1n, members }
const round = { roundId: 1n, groupId: 1n, roundNumber: 1, proposer: members[0], status: 3, approvalCount: 3,
  createdAt: 1n, deadline: 2n, planHash: `0x${'01'.repeat(32)}`, expensesHash: `0x${'02'.repeat(32)}`,
  totalAmount: 200000n, fundedTotal: 200000n, refundedTotal: 0n, withdrawnTotal: 200000n,
  members, debts: [100000n, 100000n, 0n], credits: [0n, 0n, 200000n], approved: [true, true, true],
  funded: [true, true, false], refunded: [false, false, false], withdrawn: [false, false, true] }
const memberLog = { address: contract, blockNumber: '0x1a90d8b', blockHash, transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false,
  topics: encodeEventTopics({ abi, eventName: 'MemberAdded', args: { groupId: 1n, member: members[0] } }),
  data: encodeAbiParameters([{ type: 'uint8' }], [0]) }
const selectors = Object.fromEntries(['getGroup', 'groupRounds', 'getRound'].map((name) => [toFunctionSelector(abi.find((x) => x.name === name)), name]))
const multicallAbi = [{ type: 'function', name: 'aggregate3', stateMutability: 'payable', inputs: [{ name: 'calls', type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'allowFailure', type: 'bool' }, { name: 'callData', type: 'bytes' }] }], outputs: [{ name: 'returnData', type: 'tuple[]', components: [{ name: 'success', type: 'bool' }, { name: 'returnData', type: 'bytes' }] }] }]
const contractResult = (data) => {
  const name = selectors[data.slice(0, 10)]
  if (name === 'getGroup') return encodeFunctionResult({ abi, functionName: name, result: group })
  if (name === 'groupRounds') return encodeFunctionResult({ abi, functionName: name, result: [1n] })
  if (name === 'getRound') return encodeFunctionResult({ abi, functionName: name, result: round })
  throw new Error(`Unexpected mock eth_call ${data.slice(0, 10)}`)
}
const calls = []
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { stdio: 'ignore', shell: false })
let browser
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(host)).ok) break } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true, hasTouch: true })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === host) return route.continue()
    if (!['rpc.blockdaemon.mainnet.arc.io', 'rpc.drpc.mainnet.arc.io', 'rpc.nodeflare.app'].includes(url.host)) return route.abort()
    const request = route.request().postDataJSON()
    const requests = Array.isArray(request) ? request : [request]
    const responses = requests.map(({ method, params, id }) => {
      calls.push(method)
      let result
      if (method === 'eth_chainId') result = '0x13b2'
      else if (method === 'eth_blockNumber') result = '0x1a90d8c'
      else if (method === 'eth_getBlockByNumber') result = { number: '0x1a90d8c', timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`, hash: blockHash, parentHash: `0x${'cd'.repeat(32)}`, gasLimit: '0x1c9c380', gasUsed: '0x0', baseFeePerGas: '0x4a817c800' }
      else if (method === 'eth_getLogs') result = [memberLog]
      else if (method === 'eth_getBalance') result = '0xde0b6b3a7640000'
      else if (method === 'eth_call') {
        if (params[0].data.startsWith('0x82ad56cb')) {
          const decoded = decodeFunctionData({ abi: multicallAbi, data: params[0].data })
          result = encodeFunctionResult({ abi: multicallAbi, functionName: 'aggregate3', result: decoded.args[0].map((call) => ({ success: true, returnData: contractResult(call.callData) })) })
        } else result = contractResult(params[0].data)
      } else throw new Error(`Unexpected mock RPC ${method}`)
      return { jsonrpc: '2.0', id, result }
    })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.isArray(request) ? responses : responses[0]) })
  })
  await page.addInitScript((account) => {
    const requests = []
    let connected = sessionStorage.getItem('group-mock-connected') === '1'
    const provider = { isRabby: true, request: async ({ method, params }) => {
      requests.push({ method, params })
      if (method === 'eth_accounts') return connected ? [account] : []
      if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts', caveats: [] }]
      if (method === 'eth_requestAccounts') { connected = true; sessionStorage.setItem('group-mock-connected', '1'); return [account] }
      if (method === 'eth_chainId') return '0x13b2'
      if (method === 'net_version') return '5042'
      throw new Error(`Blocked mock wallet method ${method}`)
    }, on: () => {}, removeListener: () => {} }
    Object.defineProperty(window, 'ethereum', { configurable: true, value: provider })
    window.__groupMock = requests
  }, members[0])
  await page.goto(`${host}/#/groups/5042`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click()
  await page.getByText(/Rabby|Browser Wallet|Injected/i).first().click()
  await page.getByText('MOCK settled group').first().waitFor({ timeout: 15_000 })
  const manage = () => page.getByLabel('Manage group 1').first()
  const physicalClick = async (locator) => {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (!box) throw new Error('Click target has no bounding box')
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const hit = await locator.evaluate((element, { x, y }) => {
      const found = document.elementFromPoint(x, y)
      return element === found || element.contains(found)
    }, point)
    if (!hit) throw new Error(`Hit testing failed for ${await locator.getAttribute('aria-label') ?? await locator.textContent()}: ${JSON.stringify({ point, under: await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 250), point) })}`)
    await page.mouse.click(point.x, point.y)
  }
  if (process.argv.includes('--pointer')) {
    const widths = [[1920, 1080], [1366, 768], [390, 844], [360, 740]]
    for (const [width, height] of widths) {
      await page.setViewportSize({ width, height })
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
      const hide = page.getByRole('dialog', { name: 'hide group 1' })
      if (!await page.evaluate(() => document.elementFromPoint(20, 20)?.getAttribute('role') === 'presentation')) throw new Error('Modal backdrop is under the sticky header')
      await physicalClick(hide.getByRole('button', { name: 'Cancel' }))
      await hide.waitFor({ state: 'hidden' })
      if (!await page.getByRole('tab', { name: /Active \(1\)/ }).isVisible()) throw new Error('Cancel changed group visibility')
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
      await physicalClick(page.getByRole('button', { name: 'Close dialog' }))
      await hide.waitFor({ state: 'hidden' })
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Archive group' }))
      await physicalClick(page.getByRole('button', { name: 'Confirm archive' }))
      await page.getByRole('dialog', { name: 'archive group 1' }).waitFor({ state: 'hidden' })
      await physicalClick(page.getByRole('tab', { name: /Archived \(1\)/ }))
      await page.getByText('MOCK settled group').first().waitFor()
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Restore group' }))
      await physicalClick(page.getByRole('tab', { name: /Active \(1\)/ }))
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
      await physicalClick(page.getByRole('button', { name: 'Confirm hide' }))
      await hide.waitFor({ state: 'hidden' })
      await physicalClick(page.getByRole('tab', { name: /Hidden \(1\)/ }))
      await page.getByText('MOCK settled group').first().waitFor()
      await physicalClick(manage())
      await physicalClick(page.getByRole('button', { name: 'Restore group' }))
      await physicalClick(page.getByRole('tab', { name: /Active \(1\)/ }))
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Horizontal overflow at ${width}px`)
    }
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('MOCK settled group').first().waitFor()
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'hide group 1' }).waitFor({ state: 'hidden' })
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
    await page.keyboard.press('Tab')
    if (!await page.getByRole('dialog', { name: 'hide group 1' }).evaluate((element) => element.contains(document.activeElement))) throw new Error('Tab escaped modal focus trap')
    await page.keyboard.press('Shift+Tab')
    if (!await page.getByRole('dialog', { name: 'hide group 1' }).evaluate((element) => element.contains(document.activeElement))) throw new Error('Shift+Tab escaped modal focus trap')
    const cancel = page.getByRole('dialog', { name: 'hide group 1' }).getByRole('button', { name: 'Cancel' })
    await cancel.focus()
    await page.keyboard.press('Space')
    await page.getByRole('dialog', { name: 'hide group 1' }).waitFor({ state: 'hidden' })
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
    await page.touchscreen.tap(20, 20)
    await page.getByRole('dialog', { name: 'hide group 1' }).waitFor({ state: 'hidden' })
    if (!page.url().includes('#/groups/5042')) throw new Error('Backdrop touch clicked through to navigation')
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Hide from My groups' }))
    const touchConfirm = page.getByRole('dialog', { name: 'hide group 1' }).getByRole('button', { name: 'Confirm hide' })
    const touchBox = await touchConfirm.boundingBox()
    if (!touchBox) throw new Error('Touch confirmation is not visible')
    await page.touchscreen.tap(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height / 2)
    await page.getByRole('tab', { name: /Hidden \(1\)/ }).waitFor()
    await physicalClick(page.getByRole('tab', { name: /Hidden \(1\)/ }))
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Restore group' }))
    await physicalClick(page.getByRole('tab', { name: /Active \(1\)/ }))
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Rename locally / Edit local details' }))
    await page.getByRole('dialog', { name: 'details group 1' }).getByLabel('Local title').fill('Pointer QA LOCAL')
    await physicalClick(page.getByRole('button', { name: 'Save local details' }))
    await page.getByText('Pointer QA LOCAL').first().waitFor()
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Duplicate as new group' }))
    await page.getByRole('dialog', { name: 'revision group 1' }).waitFor()
    await physicalClick(page.getByRole('dialog', { name: 'revision group 1' }).getByRole('button', { name: 'Cancel' }))
    await physicalClick(manage())
    await physicalClick(page.getByRole('button', { name: 'Delete local notes' }).first())
    await page.getByRole('dialog', { name: 'delete group 1' }).waitFor()
    await physicalClick(page.getByRole('dialog', { name: 'delete group 1' }).getByRole('button', { name: 'Cancel' }))
    await physicalClick(page.getByRole('link', { name: 'Open group', exact: true }).first())
    await page.getByText(/Settled/).first().waitFor()
    for (const tabName of ['Expenses', 'Balances', 'Activity', 'Round']) {
      await physicalClick(page.getByRole('tab', { name: tabName, exact: true }))
      if (await page.getByRole('tab', { name: tabName, exact: true }).getAttribute('aria-selected') !== 'true') throw new Error(`${tabName} tab did not activate`)
    }
    await physicalClick(page.getByRole('tab', { name: 'Expenses' }))
    await page.getByPlaceholder('Dinner on Saturday').fill('Pointer QA dinner')
    await page.getByPlaceholder('0.00').first().fill('0.30')
    await physicalClick(page.getByRole('button', { name: 'Custom amounts' }))
    await physicalClick(page.getByRole('button', { name: 'Equal' }))
    await physicalClick(page.getByRole('button', { name: 'Add expense' }))
    await page.getByText('Pointer QA dinner').first().waitFor()
    page.on('dialog', (native) => void native.accept())
    await physicalClick(page.getByRole('button', { name: 'Delete Pointer QA dinner' }))
    await page.getByText('No expenses yet').waitFor()
    await physicalClick(page.getByRole('button', { name: 'Move notes to another device' }))
    await physicalClick(page.getByRole('button', { name: 'Export as text' }))
    if (!(await page.getByLabel('Export or import text').inputValue()).includes('"v": 2')) throw new Error('Export button failed')
    await physicalClick(page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'Interactive demo' }))
    await page.waitForURL('**/#/demo')
    if (!page.url().includes('#/demo')) throw new Error('Demo navigation failed')
    await physicalClick(page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'Create', exact: true }))
    await page.waitForURL('**/#/create')
    if (!page.url().includes('#/create')) throw new Error('Create navigation failed')
    await physicalClick(page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'My groups' }))
    await page.waitForURL('**/#/groups')
    if (!page.url().includes('#/groups')) throw new Error('My groups navigation failed')
    await physicalClick(page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'Mainnet deploy' }))
    await page.waitForURL('**/deploy')
    if (!page.url().includes('/deploy')) throw new Error('Deploy navigation failed')
    const walletCalls = await page.evaluate(() => window.__groupMock.map((call) => call.method))
    if (walletCalls.some((method) => /^(eth_sendTransaction|eth_sign|personal_sign|wallet_switchEthereumChain)/.test(method))) throw new Error('Pointer QA requested wallet transaction')
    console.log(JSON.stringify({ pass: true, mode: 'MOCK_ONLY', suite: 'physical-pointer', viewports: widths, checks: ['mouse confirm/cancel/close', 'archive/restore', 'hide/restore', 'reload', 'header hit test', 'touch backdrop/confirm', 'keyboard Escape/Tab/Shift+Tab/Space', 'rename', 'duplicate/delete cancel', 'workspace tabs', 'expense add/delete/split', 'export', 'navigation', 'no click through'], walletTransactions: 0 }))
  } else {
  await manage().click()
  await page.getByRole('button', { name: 'Rename locally / Edit local details' }).click()
  await page.getByRole('dialog', { name: 'details group 1' }).getByLabel('Local title').fill('Contest proof LOCAL')
  await page.getByRole('button', { name: 'Save local details' }).click()
  await page.getByText('Contest proof LOCAL').first().waitFor()
  await manage().click(); await page.getByRole('button', { name: 'Archive group' }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  await page.getByRole('tab', { name: /Archived \(1\)/ }).click()
  await page.getByText('Contest proof LOCAL').first().waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Archived \(1\)/ }).click()
  await page.getByText('Contest proof LOCAL').first().waitFor()
  await manage().click(); await page.getByRole('button', { name: 'Restore group' }).click()
  await page.getByRole('tab', { name: /Active \(1\)/ }).click()
  await manage().click(); await page.getByRole('button', { name: 'Hide from My groups' }).click()
  await page.getByRole('button', { name: 'Confirm hide' }).click()
  await page.getByRole('tab', { name: /Hidden \(1\)/ }).click()
  await page.getByText('Contest proof LOCAL').first().waitFor()
  await manage().click(); await page.getByRole('button', { name: 'Restore group' }).click()
  await page.getByRole('tab', { name: /Active \(1\)/ }).click()
  await manage().click(); await page.getByRole('button', { name: 'Change members / Create revised group' }).click()
  const dialog = page.getByRole('dialog', { name: 'revision group 1' })
  await dialog.getByRole('button', { name: 'Add member' }).click()
  await dialog.getByLabel('New member 4').fill(members[0])
  await dialog.getByText(/Each wallet can appear only once/).waitFor()
  await dialog.getByLabel('New member 4').fill('0x3333333333333333333333333333333333333333')
  await dialog.getByRole('button', { name: 'Move member 4 up' }).click()
  await dialog.getByRole('button', { name: 'Save revised group draft' }).click()
  await page.getByText(/Revised draft from Group #1/).waitFor()
  if (!page.url().includes('#/create/5042/revised')) throw new Error('Draft did not open separate Create group route')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/Revised draft from Group #1/).waitFor()
  const walletCalls = await page.evaluate(() => window.__groupMock.map((call) => call.method))
  if (walletCalls.some((method) => /^(eth_sendTransaction|eth_sign|personal_sign|wallet_switchEthereumChain)/.test(method))) throw new Error('Local group management requested a wallet transaction or switch')
  await page.goto(`${host}/#/g/5042/1`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/Settled/).first().waitFor()
  page.on('dialog', (dialog) => void dialog.accept())
  await page.getByRole('tab', { name: 'Expenses' }).click()
  await page.getByPlaceholder('Dinner on Saturday').fill('Mock dinner')
  await page.getByPlaceholder('0.00').first().fill('0.30')
  await page.getByRole('button', { name: 'Add expense' }).click()
  await page.getByRole('button', { name: 'Edit Mock dinner' }).click()
  await page.getByLabel('Note (local only)').fill('MOCK DATA note')
  await page.getByRole('button', { name: 'Save local expense' }).click()
  await page.getByText('MOCK DATA note', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Move notes to another device' }).click()
  await page.getByRole('button', { name: 'Export as text' }).click()
  const backupText = await page.getByLabel('Export or import text').inputValue()
  if (!backupText.includes('"v": 2') || !backupText.includes('Mock dinner')) throw new Error('Bound backup was not exported')
  await page.getByRole('button', { name: 'Delete Mock dinner' }).click()
  await page.getByText('No expenses yet').waitFor()
  await page.getByLabel('Export or import text').fill(backupText)
  await page.getByRole('button', { name: 'Restore local backup from this text' }).click()
  await page.getByText(/Download the current Group #1 backup/).first().waitFor()
  const beforeImportBackup = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download current backup' }).click()
  await beforeImportBackup
  await page.getByRole('button', { name: 'Restore local backup from this text' }).click()
  await page.getByText('MOCK DATA note', { exact: true }).waitFor()
  await page.getByLabel('Manage group 1').first().click()
  await page.getByRole('button', { name: 'Delete local notes' }).first().click()
  const deleteDialog = page.getByRole('dialog', { name: 'delete group 1' })
  await deleteDialog.getByLabel('Type DELETE LOCAL NOTES to continue').fill('DELETE LOCAL NOTES')
  if (await deleteDialog.getByRole('button', { name: 'Delete local notes' }).isEnabled()) throw new Error('Group #1 notes can be erased before backup')
  const download = page.waitForEvent('download')
  await deleteDialog.getByRole('button', { name: 'Download local backup first' }).click()
  if (!(await download).suggestedFilename().includes('group-1')) throw new Error('Group #1 backup filename is wrong')
  await deleteDialog.getByRole('button', { name: 'Delete local notes' }).click()
  await page.getByText('No expenses yet').waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('MOCK settled group').first().waitFor()
  await page.getByText(/Settled/).first().waitFor()
  await page.setViewportSize({ width: 1280, height: 800 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Desktop horizontal overflow')
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Mobile horizontal overflow')
  console.log(JSON.stringify({ pass: true, mode: 'MOCK_ONLY', group: 'MOCK Group #1', checks: ['rename', 'archive', 'reload', 'restore', 'hide', 'new member', 'duplicate address blocked', 'member order', 'revised draft reload', 'expense edit', 'bound backup export/import', 'Group #1 protected delete', 'old settlement visible', 'mobile', 'desktop'], walletTransactions: 0, rpcMethods: [...new Set(calls)] }))
  }
} finally { await browser?.close(); server.kill() }
