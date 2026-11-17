import openpyxl,datetime as dt,json,sys,collections
wb=openpyxl.load_workbook(sys.argv[1],data_only=True)
iso=lambda d:d.strftime('%Y-%m-%d') if isinstance(d,(dt.datetime,dt.date)) else None
per=lambda d:f"{d.year}-{d.month:02d}-{1 if d.day<16 else 2}"
def num(x):
    if isinstance(x,(int,float)): return x
    t=str(x or '').strip().replace('$','').replace(' ','')
    if not t: return 0
    if ',' in t and '.' in t: t=t.replace('.','').replace(',','.') if t.rfind(',')>t.rfind('.') else t.replace(',','')
    elif ',' in t: t=t.replace(',','.')
    try: return float(t)
    except: return 0
def tdate(v):
    if isinstance(v,dt.datetime): return v
    import re
    m=re.match(r'\s*(\d{1,2})/(\d{1,2})/(\d{4})',str(v or ''))
    return dt.datetime(int(m.group(3)),int(m.group(2)),int(m.group(1))) if m else None
norm=lambda s:' '.join(str(s or '').lower().split())
PEND='2026-10-2'
out={}
ws=wb['ABM Chofer Valor Hora']
out['empresas']=[{'nombre':r[0],'division':r[1] or '','banco':r[2] or ''} for r in ws.iter_rows(min_row=5,max_row=81,max_col=3,values_only=True) if r[0]]
out['valores']=[{'division':r[4],'valor':r[5],'desde':iso(r[6]),'hasta':iso(r[7])} for r in ws.iter_rows(min_row=5,max_row=81,max_col=8,values_only=True) if r[4]]
divOf={norm(e['nombre']):e['division'] for e in out['empresas']}
def vhAt(div,f):
    c=[v for v in out['valores'] if v['division']==div and v['desde']<=f and (not v['hasta'] or v['hasta']>=f)]
    return c[0]['valor'] if c else 0
pats=[{'empresa':r[0],'patente':str(r[1]).upper().strip(),'desde':iso(r[2]),'hasta':iso(r[3])} for r in wb['ABM Patentes'].iter_rows(min_row=2,max_col=4,values_only=True) if r[0] and r[1]]
out['patentes']=pats
def owner(p,f):
    for x in pats:
        if x['patente']==p and (not x['desde'] or x['desde']<=f) and (not x['hasta'] or x['hasta']>=f): return x['empresa']
    return ''
fact=collections.defaultdict(list)
for r in wb['Facturacion Rukas'].iter_rows(min_row=4,max_col=4,values_only=True):
    if r[0] and isinstance(r[3],dt.datetime) and per(r[3])<PEND:
        fact[per(r[3])].append([r[0],num(r[1]),num(r[2]),iso(r[3])])
out['fact']=fact
agg=collections.defaultdict(lambda:[0,0,0])
for r in wb['Consumo Nafta'].iter_rows(min_row=20,max_col=14,values_only=True):
    r=list(r);r[0]=tdate(r[0])
    if not r[0] or per(r[0])>=PEND: continue
    pat=str(r[3]).upper().strip();f=iso(r[0])
    t='GNC' if 'GAS NATURAL' in str(r[6]).upper() else 'Nafta'
    a=agg[(per(r[0]),owner(pat,f),pat,t)];a[0]+=1;a[1]+=num(r[9]);a[2]+=num(r[10])
nafta=collections.defaultdict(list)
for (p,o,pat,t),a in agg.items(): nafta[p].append([o,pat,t,a[0],round(a[1],2),round(a[2],2)])
out['nafta']=nafta
def hstr(v):
    import datetime as _d
    if isinstance(v,_d.time): return v.strftime('%H:%M:%S')
    if isinstance(v,_d.datetime): return v.strftime('%H:%M:%S')
    if isinstance(v,(int,float)):
        t=round((v%1)*86400);return '%02d:%02d:%02d'%(t//3600,t%3600//60,t%60)
    import re;m=re.search(r'(\d{1,2}):(\d{2})(?::(\d{2}))?',str(v or ''))
    return '%02d:%s:%s'%(int(m.group(1)),m.group(2),m.group(3) or '00') if m else str(v or '')
keys=[]
for r in wb['Consumo Nafta'].iter_rows(min_row=20,max_col=11,values_only=True):
    r=list(r);r[0]=tdate(r[0])
    if r[0] and per(r[0])<PEND:
        keys.append('%s|%s|%s|%.2f'%(iso(r[0]),hstr(r[1]),str(r[3]).upper().strip(),num(r[10])))
out['naftaKeys']=keys
ad=[];tal=[]
TM={'Adelanto':'Adelanto','Seguro':'Seguros','Multa':'Adelanto'}
for i,r in enumerate(wb['Adelantos'].iter_rows(min_row=4,max_col=5,values_only=True)):
    if r[1] and isinstance(r[0],dt.datetime) and r[3]:
        c=r[2] or 'Adelanto'
        ad.append({'id':f'a{i}','fecha':iso(r[0]),'empresa':r[1],'tipo':TM.get(c,'Adelanto'),'desc':(('Multa - ' if c=='Multa' else '')+str(r[4] or '')).strip(),'importe':r[3],'cuotas':[{'n':1,'periodo':per(r[0]),'importe':r[3]}]})
for i,r in enumerate(wb['Gastos Camionetas'].iter_rows(min_row=4,max_col=6,values_only=True)):
    if r[1] and isinstance(r[0],dt.datetime) and r[3]:
        c=str(r[2]).lower()
        if c=='taller': tal.append({'id':f't{i}','fecha':iso(r[0]),'empresa':r[1],'patente':str(r[4] or '').upper(),'desc':str(r[5] or '').strip(),'importe':r[3]})
        else: ad.append({'id':f'g{i}','fecha':iso(r[0]),'empresa':r[1],'tipo':'Seguros' if c=='seguro' else 'Habilitaciones','desc':str(r[5] or '').strip(),'importe':r[3],'cuotas':[{'n':1,'periodo':per(r[0]),'importe':r[3]}]})
out['adelantos']=ad;out['talleres']=tal
rows=[r for r in wb['Prestamos'].iter_rows(min_row=5,max_col=11,values_only=True) if r[1] and isinstance(r[0],dt.datetime)]
vhset=set(v['valor'] for v in out['valores'])
loans={};cuotas=collections.defaultdict(list)
for r in rows:
    key=(norm(r[1]),norm(r[2]))
    if key not in loans: loans[key]={'rows':[]}
    loans[key]['rows'].append(r)
prest=[];n=0
for key,L in loans.items():
    n+=1;R=L['rows'];r0=R[0];f0=iso(r0[0]);emp=r0[1]
    horas=(r0[8] in vhset) and (r0[3] or 0)>1
    lid='L%d'%n
    prevH=[x for x in R if per(x[0])<PEND]
    if horas:
        vs=r0[8];tot=r0[10] or 0;acum0=(r0[9] or 0)-(r0[7] or 0)
        sug=((prevH[-1][7] if prevH else r0[3]) or 0)
        for x in R:
            p=per(x[0])
            if p<PEND and (x[7] or 0)>0: cuotas[p].append([lid,emp,x[7],x[8],(x[7] or 0)*(x[8] or 0)])
    else:
        vs=vhAt(divOf.get(norm(emp),''),f0) or 1
        acum0=((r0[9] or 0)-(r0[7] or 0))*r0[8]/vs
        hh=0
        for x in R:
            p=per(x[0])
            if p<PEND and (x[7] or 0)>0:
                h=(x[7] or 0)*(x[8] or 0)/vs;hh+=h;cuotas[p].append([lid,emp,round(h,4),vs,(x[7] or 0)*(x[8] or 0)])
        last=prevH[-1] if prevH else r0
        rem=((last[10] or 0)-(last[9] or 0))*(last[8] or 0)
        tot=acum0+hh+rem/vs
        sug=(last[8] or 0)/vs
    est=str(R[-1][4] or '').strip().capitalize()
    prest.append({'id':lid,'fecha':f0,'empresa':emp,'concepto':r0[2],'desc':('Convertido de cuotas fijas de $ (última cuota $ %s)' % format(int(R[-1][8] or 0),',').replace(',','.')) if not horas else '','monto':round(tot*vs),'vhSol':vs,'totalHs':round(tot,4),'cuotaHs':round(sug,4),'acum0':round(acum0,4),'estado':'Pausado' if (est=='Pausado' or per(R[-1][0])<'2026-10-1') else 'Activo'})
out['prestamos']=prest;out['cuotas']=cuotas
MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
pagos=collections.defaultdict(dict)
for r in wb['Liquidacion'].iter_rows(min_row=4,max_col=5,values_only=True):
    if not r[0] or not r[1]: continue
    q,m,_,y=r[1].split(' ');p=f"{y}-{MES.index(m)+1:02d}-{1 if q=='1ra' else 2}"
    if p>=PEND: continue
    d=pagos[p].setdefault(r[0],[0,0,iso(r[4])]);d[0]+=r[2] or 0;d[1]+=r[3] or 0
out['pagos']=pagos;out['PEND']=PEND
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,separators=(',',':'))
import os;print(os.path.getsize(sys.argv[2]),len(ad),len(tal),len(prest),sum(1 for p in prest if p['desc']))
