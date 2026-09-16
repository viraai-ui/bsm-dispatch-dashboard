import json, pathlib
root=pathlib.Path(__file__).resolve().parents[1]; data=root/'data'
serial='26271031'; old='1154219000035933004'; new='1154219000036922008'; oldm='1154219000035933004-1154219000035933007-1'; newm='1154219000036922008-1154219000036922011-1'; at='2026-09-16T10:44:27Z'
def load(n): return json.loads((data/n).read_text())
def save(n,x): (data/n).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
w=load('workflow-store.json'); counter=w['serialCounter']; ow=w['orders'][old]; nw=w['orders'][new]
assert ow['processedOrder']['machines'][0]['serialNumber']==serial and ow['machines'][oldm]['serialNumber']==serial
assert nw['processedOrder']['machines'][0]['sku']==ow['processedOrder']['machines'][0]['sku']=='108 B'
assert nw['processedOrder']['machines'][0]['itemName']==ow['processedOrder']['machines'][0]['itemName']
displaced=nw['machines'][newm]['serialNumber']
for m in ow['processedOrder']['machines']:
 if m['id']==oldm: m.update(serialNumber='',qrToken='',status='Not Generated',selectedForBatch=False,qrPasted=False,qcDone=False)
om=ow['machines'][oldm]; om.update(serialNumber='',qrToken='',qrStatus='transferred',transferDestinationOrderId=new,transferDestinationSalesOrderNumber='SO-07950',transferredAt=at)
for m in nw['processedOrder']['machines']:
 if m['id']==newm: m.update(serialNumber=serial,qrToken=serial,status='QR Generated',selectedForBatch=False,qrPasted=False,qcDone=False,customerName='KIDS LEGACY',salesOrderNumber='SO-07950')
nm=nw['machines'][newm]; nm.update(serialNumber=serial,qrToken=serial,qrStatus='generated',qrGeneratedAt=at,zohoBackupStatus='synced',zohoBackupLastAttemptAt=at,zohoBackupSyncedAt=at)
# Existing dispatch-to-packing action remains truthful; downstream packing completion for displaced serial does not.
assert w['serialCounter']==counter
save('workflow-store.json',w)
s=load('synced-confirmed-orders-store.json');
for m in s['orders'][old]['machines']:
 if m['id']==oldm: m.update(serialNumber='',qrToken='',status='Not Generated')
for m in s['orders'][new]['machines']:
 if m['id']==newm: m.update(serialNumber=serial,qrToken=serial,status='QR Generated',warrantyStart='2026-08-21',vendor='K S',dispatchNote='wooden')
save('synced-confirmed-orders-store.json',s)
p=load('packaging-completed-store.json')
# Preserve cancelled order history but remove active serial/QR ownership.
for m in p.get('completed',{}).get(old,{}).get('order',{}).get('machines',[]):
 if m['id']==oldm: m.update(serialNumber='',qrToken='',status='Not Generated')
# Reset destination's completion recorded against the displaced/generated serial; it must flow through packing normally.
p.get('completed',{}).pop(new,None); save('packaging-completed-store.json',p)
b=load('operational-lifecycle-baseline.json');t=b['tombstones'][old];t.update(serialTransfer={'serialNumber':serial,'destinationOrderId':new,'destinationSalesOrderNumber':'SO-07950','destinationMachineId':newm,'transferredAt':at,'actor':'authorized-production-recovery'});save('operational-lifecycle-baseline.json',b)
a={'version':1,'transfers':[{'serialNumber':serial,'sourceOrderId':old,'sourceSalesOrderNumber':'SO-07789','sourceMachineId':oldm,'destinationOrderId':new,'destinationSalesOrderNumber':'SO-07950','destinationMachineId':newm,'machineSku':'108 B','machineName':'Latex Glue Applicator (with Double Rollers) (16 + 4 inch)','displacedDestinationSerial':displaced,'transferredAt':at,'actor':'authorized-production-recovery','reason':'Physical machine reassigned after source cancellation'}]};save('serial-transfer-audit.json',a)
print(json.dumps({'serialCounter':counter,'displaced':displaced,'old':old,'new':new,'target':newm}))
