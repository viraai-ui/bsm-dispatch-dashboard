import { PublicDatabaseClient } from '@/components/PublicDatabaseClient'

export const revalidate = 300

export default function CrmSerialDatabasePage() {
  return <main className="public-database-shell">
    <div className="public-database-brand"><div className="pdb-brand-lockup"><img src="/brand/bsm-logo.png" alt="BSM"/><div><strong>Machine Database</strong><span>Official BSM service record</span></div></div><span className="pdb-public-access">Public access · Read only</span></div>
    <PublicDatabaseClient/>
  </main>
}
