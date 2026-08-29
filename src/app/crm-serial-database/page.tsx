import { PublicDatabaseClient } from '@/components/PublicDatabaseClient'
export const revalidate=300
export default function CrmSerialDatabasePage(){return <main className="public-database-shell"><div className="public-database-brand"><img src="/brand/bsm-logo.png" alt="BSM"/><div><strong>BSM Machine Database</strong><span>Search sales orders, serial numbers and customers</span></div></div><PublicDatabaseClient/></main>}
