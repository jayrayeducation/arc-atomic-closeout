// Browser-local management and revised drafts. All addresses and expenses below are MOCK DATA.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true },
  resolve: { alias: { '@': `${process.cwd()}/src` } }, server: { middlewareMode: true }, appType: 'custom' })
after(async () => server.close())
const storage = await server.ssrLoadModule('/src/lib/storage.ts')
const revised = await server.ssrLoadModule('/src/lib/revisedGroup.ts')
const route = await server.ssrLoadModule('/src/lib/router.ts')
const values = new Map()
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
globalThis.window = { dispatchEvent: () => true }
const contract = '0xe05790767da98b524472ea9d78459aca4fb3b6c6'
const members = ['0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a', '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222']
const fourth = '0x3333333333333333333333333333333333333333'
const key = storage.groupKey(5042, contract, 1n)
const expense = { id: 'mock-expense', title: 'Mock dinner', category: 'Food', note: 'MOCK DATA', date: '2026-10-26', payer: 0,
  amount: 300000n, mode: 'equal', included: [true, true, true], custom: [0n, 0n, 0n], bps: [0, 0, 0] }

test('rename, archive, hide, restore and reload affect only browser-local metadata', () => {
  const notes = { expenses: [expense], names: { [members[0].toLowerCase()]: 'Alex' }, localTitle: 'Local trip', description: 'Private description', visibility: 'archived' }
  storage.saveLocalGroup(key, notes)
  assert.equal(storage.loadLocalGroup(key, members).localTitle, 'Local trip')
  assert.equal(storage.loadLocalGroup(key, members).visibility, 'archived')
  storage.saveLocalGroup(key, { ...storage.loadLocalGroup(key), visibility: 'hidden' })
  assert.equal(storage.loadLocalGroup(key).visibility, 'hidden')
  storage.saveLocalGroup(key, { ...storage.loadLocalGroup(key), visibility: 'active' })
  assert.equal(storage.loadLocalGroup(key).visibility, 'active')
  assert.equal(storage.loadLocalGroup(key).expenses.length, 1)
})

test('bound backup imports safely; malformed values and foreign addresses cannot replace notes', () => {
  const notes = storage.loadLocalGroup(key, members)
  const backup = storage.exportLocalGroup(key, notes, members)
  assert.equal(storage.importLocalGroup(backup, key, members).expenses[0].amount, 300000n)
  assert.throws(() => storage.importLocalGroup(backup, storage.groupKey(5042, contract, 2n), members), /does not match/)
  assert.throws(() => storage.importLocalGroup(backup, key, [members[1], members[0], members[2]]), /does not match/)
  const altered = JSON.parse(backup)
  altered.data.names[fourth.toLowerCase()] = 'Injected'
  assert.throws(() => storage.importLocalGroup(JSON.stringify(altered), key, members), /does not belong/)
  altered.data.names = {}
  altered.data.expenses[0].payer = 9
  assert.throws(() => storage.importLocalGroup(JSON.stringify(altered), key, members), /Invalid expense/)
  const legacy = JSON.stringify({ v: 1, expenses: JSON.parse(backup).data.expenses, names: {} })
  assert.equal(storage.importLegacyExpenses(legacy, members).expenses.length, 1)
})

test('revised group adds, removes, replaces and reorders without changing source notes', () => {
  const sourceNotes = storage.loadLocalGroup(key, members)
  const input = { chainId: 5042, contract, sourceGroupId: '1', sourceStatus: 'Settled', name: 'Revised trip', description: '', oldMembers: members, sourceNotes }
  const added = revised.prepareRevisedDraft({ ...input, newMembers: [...members, fourth] })
  assert.equal(added.notes.expenses.length, 1)
  assert.deepEqual(added.notes.expenses[0].included, [true, true, true, false])
  assert.equal(added.notes.expenses[0].amount, expense.amount)
  const removed = revised.prepareRevisedDraft({ ...input, newMembers: [members[0], members[2]] })
  assert.equal(removed.notes.expenses.length, 0)
  assert.equal(removed.skippedExpenses, 1)
  const replaced = revised.prepareRevisedDraft({ ...input, newMembers: [members[0], fourth, members[2]] })
  assert.equal(replaced.skippedExpenses, 1)
  const ordered = revised.prepareRevisedDraft({ ...input, newMembers: [members[2], members[0], members[1]] })
  assert.equal(ordered.notes.expenses[0].payer, 1)
  assert.throws(() => revised.prepareRevisedDraft({ ...input, newMembers: [members[0], members[0]] }), /once/)
  assert.throws(() => revised.prepareRevisedDraft({ ...input, newMembers: [members[0], 'bad'] }), /valid wallet/)
  revised.saveRevisedDraft(ordered)
  assert.deepEqual(revised.loadRevisedDraft(5042, contract).newMembers, ordered.newMembers)
  assert.equal(route.parseHash('#/create/5042/revised').revised, true)
  assert.equal(storage.loadLocalGroup(key, members).expenses[0].id, 'mock-expense')
  revised.clearRevisedDraft()
})
