import { CONFIG, STATE_DIR, readJson } from "/matrix/lib/common.js";

const G="#00ff88", G2="#00c86f", DIM="#628f76", BG="#020705", PANEL="rgba(2,18,12,.88)", RED="#ff5577", AMBER="#ffd166";

function money(n){
    if(!Number.isFinite(n))return"—";
    const a=Math.abs(n),u=[["q",1e15],["t",1e12],["b",1e9],["m",1e6],["k",1e3]];
    for(const [s,v] of u)if(a>=v)return`${n<0?"-":""}$${(a/v).toFixed(a/v>=100?0:a/v>=10?1:2)}${s}`;
    return `$${Math.round(n).toLocaleString()}`;
}
function ram(n){if(!Number.isFinite(n))return"—";if(n>=1024*1024)return`${(n/1024/1024).toFixed(1)} PB`;if(n>=1024)return`${(n/1024).toFixed(1)} TB`;return`${n.toFixed(1)} GB`;}
function pct(n){return`${((n??0)*100).toFixed(1)}%`;}
function age(t){if(!t)return"never";const s=Math.max(0,(Date.now()-t)/1000);return s<60?`${s.toFixed(0)}s`:s<3600?`${(s/60).toFixed(0)}m`:`${(s/3600).toFixed(1)}h`;}

function dashboardData(ns){
    const overview=readJson(ns,`${STATE_DIR}/overview.txt`,null);
    if(overview)return overview;
    const boot=readJson(ns,`${STATE_DIR}/bootstrap.txt`,{});
    return {
        updated:boot.updated??0,
        player:{money:ns.getServerMoneyAvailable("home")},
        network:{discovered:boot.discovered??0,rooted:boot.rooted??0,maxRam:boot.homeRam??0,ramPct:0},
        services:{bootstrap:{status:boot.status??"starting"},hacking:{status:"bootstrap",target:boot.target??"n00dles"}},
        events:[],
    };
}

const css=`
@keyframes mxPulse{0%,100%{opacity:.65}50%{opacity:1}}
@keyframes mxScan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
@keyframes mxRain{0%{transform:translateY(-120vh);opacity:0}10%{opacity:.18}90%{opacity:.08}100%{transform:translateY(120vh);opacity:0}}
.mxRoot{position:relative;min-height:720px;background:${BG};color:${G};font-family:'JetBrains Mono','Fira Code',monospace;overflow:hidden;padding:18px 20px 30px;box-sizing:border-box}
.mxRoot *{box-sizing:border-box}
.mxRoot:after{content:"";pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,255,136,.025) 0px,rgba(0,255,136,.025) 1px,transparent 1px,transparent 4px);z-index:50}
.mxScan{pointer-events:none;position:fixed;left:0;right:0;height:120px;background:linear-gradient(transparent,rgba(0,255,136,.035),transparent);animation:mxScan 7s linear infinite;z-index:49}
.mxGrid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;position:relative;z-index:2}
.mxPanel{background:${PANEL};border:1px solid rgba(0,255,136,.22);box-shadow:0 0 22px rgba(0,255,136,.045),inset 0 0 30px rgba(0,255,136,.018);border-radius:4px;padding:13px;min-width:0}
.mxTitle{font-size:11px;letter-spacing:.2em;color:${DIM};text-transform:uppercase;margin-bottom:10px;display:flex;justify-content:space-between}
.mxValue{font-size:24px;color:${G};text-shadow:0 0 12px rgba(0,255,136,.25)}
.mxSmall{font-size:11px;color:${DIM}}
.mxRow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(0,255,136,.07)}
.mxDot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:8px;box-shadow:0 0 8px currentColor}
.mxBar{height:5px;background:#07130d;border-radius:99px;overflow:hidden;margin-top:6px}.mxBar>div{height:100%;background:${G};box-shadow:0 0 10px ${G}}
.mxTabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0}.mxBtn{background:#03120b;border:1px solid rgba(0,255,136,.28);color:${G};padding:7px 10px;border-radius:3px;font:inherit;font-size:11px;cursor:pointer}.mxBtn:hover,.mxBtn.active{background:rgba(0,255,136,.11);box-shadow:0 0 12px rgba(0,255,136,.12)}
.mxLogo{font-size:23px;letter-spacing:.28em;font-weight:700;text-shadow:0 0 14px rgba(0,255,136,.38)}
.mxHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;position:relative;z-index:2}
.mxBadge{border:1px solid rgba(0,255,136,.25);padding:5px 8px;font-size:10px;letter-spacing:.12em;color:${DIM}}
.mxTable{width:100%;border-collapse:collapse;font-size:11px}.mxTable th{text-align:left;color:${DIM};font-weight:400;padding:6px;border-bottom:1px solid rgba(0,255,136,.18)}.mxTable td{padding:7px 6px;border-bottom:1px solid rgba(0,255,136,.06)}
.mxEvent{font-size:10px;padding:5px 0;border-bottom:1px solid rgba(0,255,136,.05);color:#8db7a0}.mxEvent b{color:${G2};font-weight:500}
.mxRainCol{position:fixed;top:0;color:${G};font-size:10px;line-height:12px;white-space:pre;animation:mxRain linear infinite;pointer-events:none;z-index:0;text-shadow:0 0 5px ${G}}
@media(max-width:1000px){.mxGrid{grid-template-columns:repeat(6,1fr)}}
`;

function Rain(){
    const glyphs="010101001101011001001101001011010010110101011000101101010010011010011001010101001101";
    return <>{Array.from({length:30},(_,i)=><div key={i} className="mxRainCol" style={{left:`${(i*3.37)%100}%`,animationDuration:`${10+(i%9)}s`,animationDelay:`-${(i*1.7)%14}s`,opacity:.08+(i%4)*.015}}>{glyphs.slice(i%20,55+i%20).split("").join("\n")}</div>)}</>;
}
function Panel({title,span=3,children,right}){return <div className="mxPanel" style={{gridColumn:`span ${span}`}}><div className="mxTitle"><span>{title}</span><span>{right}</span></div>{children}</div>;}
function Service({name,s}){
    const st=s?.status??"offline"; const c=st==="online"||st==="batching"||st==="trading"||st==="preparing"?G:st==="error"?RED:st==="paused"?AMBER:DIM;
    return <div className="mxRow"><span><i className="mxDot" style={{color:c,background:c}}></i>{name}</span><span className="mxSmall">{st.toUpperCase()}</span></div>;
}
function Toggle({ns,cfg,path,label}){
    const parts=path.split("."); let v=cfg; for(const p of parts)v=v?.[p];
    const flip=async()=>{const n=JSON.parse(JSON.stringify(cfg));let o=n;for(let i=0;i<parts.length-1;i++)o=o[parts[i]]??=( {} );o[parts.at(-1)]=!v;await ns.write(CONFIG,JSON.stringify(n,null,2),"w");};
    return <button className={`mxBtn ${v!==false?"active":""}`} onClick={flip}>{label}: {v!==false?"ON":"OFF"}</button>;
}

function Overview({d}){
    const h=d.services?.hacking, net=d.network??{}, p=d.player??{}, inc=d.income??{};
    const services=d.services??{};
    return <div className="mxGrid">
        <Panel title="Capital" span={3} right="LIQUID"><div className="mxValue">{money(p.money)}</div><div className="mxSmall">hacking since install {money(inc.hacking??0)}</div></Panel>
        <Panel title="Network RAM" span={3} right={pct(net.ramPct)}><div className="mxValue">{ram(net.maxRam)}</div><div className="mxBar"><div style={{width:`${Math.min(100,(net.ramPct??0)*100)}%`}}></div></div><div className="mxSmall">{net.rooted??0}/{net.discovered??0} rooted</div></Panel>
        <Panel title="Hacking Engine" span={3} right={h?.phase??"—"}><div className="mxValue">{h?.target??"SCANNING"}</div><div className="mxSmall">{h?.batches?`${h.batches} batches · ${(h.hackFraction*100).toFixed(1)}% extraction`:(h?.status??"offline")}</div></Panel>
        <Panel title="BitNode" span={3} right={`BN-${d.reset?.currentNode??"?"}`}><div className="mxValue">NODE {d.reset?.currentNode??"?"}</div><div className="mxSmall">SF: {(d.reset?.sourceFiles??[]).map(x=>`${x[0]}.${x[1]}`).join(" · ")||"none"}</div></Panel>

        <Panel title="Automation Matrix" span={4}>
            {["root","hacking","cloud","hacknet","contracts","stock","singularity","gang","sleeves","bladeburner","corporation"].map(n=><Service key={n} name={n} s={services[n]}/>)}
        </Panel>
        <Panel title="Current Objective" span={4}>
            <div className="mxValue" style={{fontSize:18}}>{services.singularity?.goal?.augmentation??h?.target??"BUILD CAPABILITY"}</div>
            {services.singularity?.goal?<><div className="mxSmall">{services.singularity.goal.faction}</div><div className="mxBar"><div style={{width:`${Math.min(100,100*(services.singularity.goal.rep||0)/(services.singularity.goal.need||1))}%`}}></div></div></>:null}
            <div style={{marginTop:15}} className="mxRow"><span>Queued augmentations</span><span>{services.singularity?.queuedAugs??0}</span></div>
            <div className="mxRow"><span>Cloud RAM</span><span>{ram(services.cloud?.totalRam??0)}</span></div>
            <div className="mxRow"><span>Hacknet production</span><span>{(services.hacknet?.production??0).toFixed?.(2)??0}</span></div>
            <div className="mxRow"><span>Contracts solved last pass</span><span>{services.contracts?.solved??0}</span></div>
        </Panel>
        <Panel title="Live Event Stream" span={4} right={`${d.events?.length??0} buffered`}>
            <div style={{maxHeight:330,overflow:"hidden"}}>{(d.events??[]).slice(0,22).map((e,i)=><div className="mxEvent" key={i}><b>{new Date(e.t).toLocaleTimeString()}</b> [{e.service}] {e.message}</div>)}</div>
        </Panel>
    </div>;
}
function Hacking({d}){
    const h=d.services?.hacking??{},n=d.network??{};
    return <div className="mxGrid">
        <Panel title="Target" span={4}><div className="mxValue">{h.target??"—"}</div><div className="mxSmall">{h.phase??h.status??"offline"}</div></Panel>
        <Panel title="Extraction" span={4}><div className="mxValue">{h.hackFraction?`${(h.hackFraction*100).toFixed(2)}%`:"—"}</div><div className="mxSmall">{h.expectedPerBatch?`${money(h.expectedPerBatch)} expected / batch`:"adaptive optimizer"}</div></Panel>
        <Panel title="Batch Geometry" span={4}><div className="mxValue">{h.batches??0}</div><div className="mxSmall">{h.gapMs??"—"} ms gap · {ram(h.batchRam??0)} / batch</div></Panel>
        <Panel title="Network capacity" span={12}>
            <table className="mxTable"><tbody>
            <tr><td>Discovered hosts</td><td>{n.discovered??0}</td><td>Rooted hosts</td><td>{n.rooted??0}</td></tr>
            <tr><td>Total RAM</td><td>{ram(n.maxRam??0)}</td><td>RAM utilization</td><td>{pct(n.ramPct??0)}</td></tr>
            <tr><td>Batch counter</td><td>{h.batchCounter??0}</td><td>Status</td><td>{h.status??"offline"}</td></tr>
            </tbody></table>
        </Panel>
    </div>;
}
function Economy({d}){
    const s=d.services??{},i=d.income??{};
    const rows=[["Hacking",i.hacking],["Hacknet",i.hacknet],["Corporation",i.corporation],["Gang",i.gang],["Crime",i.crime],["Work",i.work],["Stocks",i.stock]];
    return <div className="mxGrid">
        <Panel title="Income Sources / Since Install" span={6}><table className="mxTable"><tbody>{rows.map(([k,v])=><tr key={k}><td>{k}</td><td>{money(v??0)}</td></tr>)}</tbody></table></Panel>
        <Panel title="Capital Allocators" span={6}>
            <div className="mxRow"><span>Cloud nodes</span><span>{s.cloud?.servers??0} · {ram(s.cloud?.totalRam??0)}</span></div>
            <div className="mxRow"><span>Hacknet nodes</span><span>{s.hacknet?.nodes??0}</span></div>
            <div className="mxRow"><span>Stock exposure</span><span>{money(s.stock?.exposure??0)}</span></div>
            <div className="mxRow"><span>Corp funds</span><span>{money(s.corporation?.funds??0)}</span></div>
            <div className="mxRow"><span>Corp profit/cycle</span><span>{money(s.corporation?.profit??0)}</span></div>
        </Panel>
    </div>;
}
function Progress({d}){
    const p=d.player??{},s=d.services??{};
    return <div className="mxGrid">
        <Panel title="Operator" span={4}><div className="mxValue">HACK {p.skills?.hacking??0}</div>{["strength","defense","dexterity","agility","charisma","intelligence"].map(k=><div className="mxRow" key={k}><span>{k}</span><span>{p.skills?.[k]??0}</span></div>)}</Panel>
        <Panel title="Factions" span={4}>{(p.factions??[]).map(f=><div className="mxRow" key={f}><span>{f}</span><span>CONNECTED</span></div>)}</Panel>
        <Panel title="Advanced Systems" span={4}>
            <Service name="Singularity" s={s.singularity}/><Service name="Gang" s={s.gang}/><Service name="Sleeves" s={s.sleeves}/><Service name="Bladeburner" s={s.bladeburner}/><Service name="Corporation" s={s.corporation}/>
        </Panel>
    </div>;
}
function Settings({ns,d,cfg}){
    return <div className="mxGrid"><Panel title="Master Control" span={12}>
        <Toggle ns={ns} cfg={cfg} path="masterEnabled" label="AUTOPILOT"/>
        <div style={{height:10}}/>
        {Object.keys(cfg.automation??{}).map(k=><Toggle key={k} ns={ns} cfg={cfg} path={`automation.${k}`} label={k.toUpperCase()}/>)}
        <div style={{marginTop:16}} className="mxSmall">Changes are written directly to /matrix/config.txt. Managers pick them up on their next cycle.</div>
    </Panel></div>;
}

function App({ns}){
    const [data,setData]=React.useState(()=>dashboardData(ns));
    const [cfg,setCfg]=React.useState(()=>readJson(ns,CONFIG,{}));
    const [tab,setTab]=React.useState("OVERVIEW");
    React.useEffect(()=>{const id=setInterval(()=>{setData(dashboardData(ns));setCfg(readJson(ns,CONFIG,{}));},Math.max(300,cfg.ui?.refreshMs??750));return()=>clearInterval(id);},[cfg.ui?.refreshMs]);
    const tabs=["OVERVIEW","HACKING","ECONOMY","PROGRESS","SETTINGS"];
    let body=tab==="HACKING"?<Hacking d={data}/>:tab==="ECONOMY"?<Economy d={data}/>:tab==="PROGRESS"?<Progress d={data}/>:tab==="SETTINGS"?<Settings ns={ns} d={data} cfg={cfg}/>:<Overview d={data}/>;
    return <div className="mxRoot">
        <style>{css}</style>{cfg.ui?.matrixRain!==false?<Rain/>:null}<div className="mxScan"/>
        <div className="mxHeader"><div><div className="mxLogo">MATRIX // AUTONOMOUS CONTROL</div><div className="mxSmall">BITBURNER CYBER OPERATIONS SYSTEM · {data.game?.version??"3.x"} · TELEMETRY {age(data.updated)} AGO</div></div><div className="mxBadge">{cfg.masterEnabled!==false?"● AUTOPILOT ENGAGED":"○ AUTOPILOT PAUSED"}</div></div>
        <div className="mxTabs">{tabs.map(t=><button key={t} className={`mxBtn ${tab===t?"active":""}`} onClick={()=>setTab(t)}>{t}</button>)}</div>
        {body}
    </div>;
}

export async function main(ns){
    ns.disableLog("ALL");
    ns.clearLog();

    const app = <App ns={ns}/>;

    // Bitburner 3.0.2+ dev builds expose renderPage().
    // Steam 3.0.1 does not. Prefer it when present, otherwise
    // render the same React dashboard inside a large tail window.
    if (typeof ns.ui.renderPage === "function") {
        ns.ui.renderPage(app);
    } else {
        ns.printRaw(app);

        try {
            ns.ui.setTailTitle("MATRIX // AUTONOMOUS CONTROL");
        } catch {}

        try {
            if (typeof ns.ui.windowSize === "function") {
                const [w, h] = ns.ui.windowSize();
                ns.ui.resizeTail(
                    Math.max(900, Math.floor(w * 0.90)),
                    Math.max(650, Math.floor(h * 0.86))
                );
                ns.ui.moveTail(
                    Math.max(10, Math.floor(w * 0.05)),
                    Math.max(10, Math.floor(h * 0.06))
                );
            } else {
                ns.ui.resizeTail(1300, 780);
                ns.ui.moveTail(40, 40);
            }
        } catch {}

        ns.ui.openTail();
    }

    while(true) await ns.sleep(60000);
}
