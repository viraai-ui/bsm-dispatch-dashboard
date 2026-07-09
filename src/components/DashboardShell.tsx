const nav = ['Orders','QR & Serial Generation','Wooden Packing','Packaging TV View','Media Proof','Vehicle / Dispatch','Machine Lookup','Sync Monitor','Settings','Audit Logs']

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return <div className="shell"><aside className="side"><div className="brand"><div className="logo">BSM</div><div><strong>Dispatch</strong><div className="muted">Machine Passport</div></div></div><nav className="nav">{nav.map((item, index)=><a className={index===0?'active':''} href={item==='Packaging TV View'?'/packaging-tv':'#'+item.toLowerCase().replaceAll(' ','-').replaceAll('/','') } key={item}>{item}</a>)}</nav></aside><main className="main">{children}</main></div>
}

export function Badge({ children, tone='blue' }: { children: React.ReactNode; tone?: 'red'|'green'|'amber'|'blue' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}
