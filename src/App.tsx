import { useRoute } from '@/lib/router'
import { AppShell } from '@/components/AppShell'
import Landing from '@/pages/Landing'
import DemoMode from '@/pages/DemoMode'
import CreateGroup from '@/pages/CreateGroup'
import Groups from '@/pages/Groups'
import GroupWorkspace from '@/pages/GroupWorkspace'
import DeployMainnet from '@/pages/DeployMainnet'

export default function App() {
  const route = useRoute()
  return (
    <AppShell route={route}>
      {route.name === 'landing' && <Landing />}
      {route.name === 'demo' && <DemoMode />}
      {route.name === 'deploy' && <DeployMainnet />}
      {route.name === 'create' && <CreateGroup key={`${route.chainId}-${route.revised}`} chainId={route.chainId} revised={route.revised} />}
      {route.name === 'groups' && <Groups chainId={route.chainId} />}
      {route.name === 'group' && (
        <GroupWorkspace key={`${route.chainId}-${route.groupId}`} chainId={route.chainId} groupId={route.groupId} initialTab={route.tab} />
      )}
    </AppShell>
  )
}
