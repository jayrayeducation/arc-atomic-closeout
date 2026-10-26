import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import clsx from 'clsx'
import { Wallet } from 'lucide-react'
import type { Route } from '@/lib/router'
import { shortAddr } from '@/lib/format'
import { getDeployment } from '@/lib/deployments'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ac-g" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#43E0D0" />
          <stop offset="1" stopColor="#568AFF" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="16" r="9" stroke="url(#ac-g)" strokeWidth="2.5" />
      <circle cx="20" cy="16" r="9" stroke="url(#ac-g)" strokeWidth="2.5" opacity="0.55" />
      <circle cx="16" cy="16" r="2.4" fill="#F3F7FC" />
    </svg>
  )
}

const NAV: { label: string; href: string; match: Route['name'][] }[] = [
  { label: 'My groups', href: '#/groups', match: ['groups', 'group'] },
  { label: 'Create', href: '#/create', match: ['create'] },
  { label: 'Interactive demo', href: '#/demo', match: ['demo'] },
  { label: 'Mainnet deploy', href: '/deploy', match: ['deploy'] },
]

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-navy-900">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] bg-[radial-gradient(60%_60%_at_20%_0%,rgba(86,138,255,0.16),transparent),radial-gradient(40%_50%_at_85%_0%,rgba(67,224,208,0.10),transparent)]" />
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-navy-900/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href="/#/" className="flex items-center gap-2.5" aria-label="Atomic Closeout home">
            <LogoMark />
            <span className="font-display text-[17px] font-semibold tracking-tight">Atomic Closeout</span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={route.name === 'deploy' && n.href.startsWith('#') ? `/${n.href}` : n.href}
                className={clsx(
                  'rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white/[0.05]',
                  n.match.includes(route.name) ? 'text-cyan' : 'text-ink-dim',
                )}
              >
                {n.label}
              </a>
            ))}
          </nav>
          {route.name !== 'deploy' && <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => (
              <button className="btn-ghost min-h-[40px]" onClick={show}>
                <Wallet className="h-4 w-4" aria-hidden />
                {isConnected && address ? shortAddr(address) : 'Connect wallet'}
              </button>
            )}
          </ConnectKitButton.Custom>}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.04] px-3 py-1 md:hidden" aria-label="Primary mobile">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={route.name === 'deploy' && n.href.startsWith('#') ? `/${n.href}` : n.href}
              className={clsx('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium', n.match.includes(route.name) ? 'text-cyan' : 'text-ink-dim')}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="relative z-20 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {(route.name === 'create' || route.name === 'groups') && (
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
            <span>Network:</span>
            {[5042, 5042002].map((chainId) => {
              const label = getDeployment(chainId)?.label
              const available = Boolean(getDeployment(chainId)?.contract)
              return available ? (
                <a key={chainId} className={route.chainId === chainId ? 'text-cyan underline' : 'text-ink-dim underline'} href={`#/${route.name}/${chainId}`}>
                  {label}
                </a>
              ) : <span key={chainId} className="text-ink-mute">{label}: not deployed</span>
            })}
          </div>
        )}
        {children}
      </main>
      <footer className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-6 text-xs text-ink-mute sm:px-6">
        <a className="mb-4 inline-block text-cyan underline" href="https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009" target="_blank" rel="noopener noreferrer">
          Built with Arc Studio
        </a>
        <p className="max-w-3xl text-pretty">
          Atomic Closeout is unaudited. Finalization records creditor entitlements; each creditor withdraws in a separate transaction.
          Approvals and deposits also require separate transactions. Expense notes are stored in this browser only and may not synchronize across devices.
        </p>
      </footer>
    </div>
  )
}
