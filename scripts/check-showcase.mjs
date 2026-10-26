import { readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const docs = ['README.md', 'docs/MAINNET_EVIDENCE.md', 'docs/COMPETITION_EVIDENCE.md', 'docs/DORAHACKS_SUBMISSION.md', 'docs/assets/README.md']
const videoUrl = 'https://www.youtube.com/watch?v=xWpZg0jgYL0'
let checked = 0
for (const doc of docs) {
  const content = await readFile(doc, 'utf8')
  if (!content.includes(videoUrl)) throw new Error(`Final demo video missing from ${doc}`)
  if (/public (?:full-)?video URL:\s*pending|public full-video URL pending|owner to provide public URL/i.test(content)) throw new Error(`Old video placeholder in ${doc}`)
  for (const [, target] of content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue
    const file = resolve(dirname(doc), decodeURIComponent(target.split('#')[0]))
    await stat(file)
    checked++
  }
}
const evidence = JSON.parse(await readFile('docs/mainnet-evidence.json', 'utf8'))
if (evidence.chainId !== 5042 || evidence.verificationStatus !== 'RPC_VERIFIED' || evidence.arcDemo.steps.length !== 9) throw new Error('Mainnet evidence is incomplete')
const hashes = evidence.arcDemo.steps.map((step) => step.hash.toLowerCase())
if (new Set(hashes).size !== 9 || evidence.arcDemo.steps.some((step) => step.status !== 'RPC_VERIFIED')) throw new Error('Arc Demo hashes are duplicated or unverified')
const clips = ['overview', 'expenses', 'approvals', 'funding', 'activity', 'withdrawn']
for (const clip of clips) {
  const file = `docs/assets/${clip}.webp`
  const data = await readFile(file)
  if (data.length > 1_500_000 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid or oversized ${file}`)
}
console.log(JSON.stringify({ pass: true, localLinks: checked, verifiedArcDemoTransactions: hashes.length, animatedWebp: clips.length }))
