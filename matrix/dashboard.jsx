import { CONFIG, STATE_DIR, readJson, writeJson } from "/matrix/lib/common.js";
import { leaseDecision } from "/matrix/lib/singleton.js";

const DECK = "/matrix/dashboard.jsx";

const COLOR = { green: "#55f6a4", mint: "#00d982", dim: "#7ba38e", ink: "#030907", red: "#ff5d79", amber: "#ffd36a", cyan: "#52ddff" };
const SERVICE_ORDER = ["root", "hacking", "cloud", "hacknet", "go", "contracts", "stock", "progression", "coordinator", "singularity", "gang", "sleeves", "stanek", "bladeburner", "corporation"];

function money(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value), units = [["q", 1e15], ["t", 1e12], ["b", 1e9], ["m", 1e6], ["k", 1e3]];
    for (const [label, size] of units) if (abs >= size) return `${value < 0 ? "-" : ""}$${(abs / size).toFixed(abs / size >= 100 ? 0 : abs / size >= 10 ? 1 : 2)}${label}`;
    return `$${Math.round(value).toLocaleString()}`;
}
function ram(value) { if (!Number.isFinite(value)) return "--"; if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} PB`; if (value >= 1024) return `${(value / 1024).toFixed(1)} TB`; return `${value.toFixed(value < 10 ? 1 : 0)} GB`; }
function percent(value) { return `${Math.max(0, Math.min(100, (value ?? 0) * 100)).toFixed(1)}%`; }
// Percentages arrive from other services through state files, so any field can
// be absent, null or a string for a frame. A bad number must degrade, never
// throw: an exception here kills the deck script, and Bitburner leaves the dead
// window on screen with a restart button rather than closing it.
function meter(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
function age(time) { if (!time) return "OFFLINE"; const seconds = Math.max(0, (Date.now() - time) / 1000); return seconds < 3 ? "LIVE" : seconds < 60 ? `${seconds.toFixed(0)} SEC AGO` : `${(seconds / 60).toFixed(0)} MIN AGO`; }

function state(ns) {
    const overview = readJson(ns, `${STATE_DIR}/overview.txt`, null);
    if (overview && Date.now() - (overview.updated ?? 0) < 15_000) return overview;
    const bootstrap = readJson(ns, `${STATE_DIR}/bootstrap.txt`, {}), early = readJson(ns, `${STATE_DIR}/early.txt`, {});
    const boot = (early.updated ?? 0) > (bootstrap.updated ?? 0) ? early : bootstrap;
    return { updated: boot.updated ?? 0, player: { money: ns.getServerMoneyAvailable("home") }, network: { discovered: boot.discovered ?? 0, rooted: boot.rooted ?? 0, maxRam: boot.homeRam ?? 0, ramPct: 0 }, services: { bootstrap: { status: boot.status ?? "starting" }, hacking: { status: boot.phase ?? "bootstrap", target: boot.target ?? "n00dles" } }, events: [] };
}

// ---------------------------------------------------------------------------
// The React tree must NEVER touch `ns`.
//
// Bitburner binds the ns API to the script's own execution context. Calling it
// from a setInterval callback or a click handler runs it on the browser's timer
// instead, and the game tears the script down without running any of our error
// paths - no terminal message, no heartbeat, just a dead window left on screen
// with a restart button. That is exactly the "deck respawns every ~10s" symptom,
// and it is the one thing early.js - which draws from inside its own loop -
// never did.
//
// So main() owns every ns call: it publishes a plain snapshot here and drains
// commands the UI queues. The UI is a pure function of that snapshot.
// ---------------------------------------------------------------------------
const store = {
    snapshot: { data: {}, config: {} },
    listeners: new Set(),
    commands: [],
    publish(snapshot) {
        store.snapshot = snapshot;
        // One broken subscriber must not stop the others, or stop main().
        for (const listener of [...store.listeners]) { try { listener(); } catch {} }
    },
    subscribe(listener) { store.listeners.add(listener); return () => store.listeners.delete(listener); },
    send(command) { store.commands.push(command); },
    drain() { const pending = store.commands; store.commands = []; return pending; },
};

function useStore() {
    const [, force] = React.useState(0);
    React.useEffect(() => store.subscribe(() => force(n => n + 1)), []);
    return store.snapshot;
}

// Deliberately does NOT touch window or document. Bitburner charges 25 GB
// (RamCostConstants Dom: 25) the moment a script mentions either identifier -
// statically, whether or not the line runs. A single window.innerWidth here made
// the whole command deck 26.9 GB and silently unlaunchable at 32 GB.
// The canvas is position:fixed inset:0, so its own client box IS the viewport.
function MatrixRainCanvas({ enabled = true }) {
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        if (!enabled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const fontSize = 14;
        let width = 0;
        let height = 0;
        let drops = [];

        const resize = () => {
            const w = canvas.clientWidth || 800;
            const h = canvas.clientHeight || 600;
            if (w === width && h === height) return;
            width = canvas.width = w;
            height = canvas.height = h;
            const columns = Math.max(1, Math.floor(width / fontSize));
            drops = Array(columns).fill(1);
        };

        const katakana = "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZMATRIXOS";

        const drawRain = () => {
            // Re-measure each frame instead of listening for a window resize event.
            resize();
            ctx.fillStyle = "rgba(3, 9, 7, 0.08)";
            ctx.fillRect(0, 0, width, height);
            ctx.font = `${fontSize}px monospace`;
            for (let i = 0; i < drops.length; i++) {
                const text = katakana.charAt(Math.floor(Math.random() * katakana.length));
                const x = i * fontSize;
                const y = drops[i] * fontSize;
                const rand = Math.random();
                ctx.fillStyle = rand > 0.88 ? "#e6fff3" : rand > 0.6 ? "#52ddff" : "#00ff88";
                ctx.fillText(text, x, y);
                if (y > height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        };

        const interval = setInterval(drawRain, 45);
        return () => clearInterval(interval);
    }, [enabled]);

    if (!enabled) return null;
    return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.16 }} />;
}

const css = `
@keyframes matrixPulse{0%,100%{opacity:.42}50%{opacity:1}}@keyframes matrixSweep{from{transform:translateY(-140px)}to{transform:translateY(calc(100vh + 140px))}}@keyframes matrixDrift{from{transform:translate3d(0,-10px,0)}to{transform:translate3d(0,10px,0)}}
.mxRoot{--green:${COLOR.green};--mint:${COLOR.mint};--dim:${COLOR.dim};--ink:${COLOR.ink};--red:${COLOR.red};--amber:${COLOR.amber};--cyan:${COLOR.cyan};position:relative;min-height:100vh;overflow:hidden;padding:18px;color:var(--green);background:radial-gradient(circle at 78% 2%,rgba(0,217,130,.12),transparent 25%),radial-gradient(circle at 12% 80%,rgba(82,221,255,.06),transparent 26%),var(--ink);font-family:'JetBrains Mono','Cascadia Code','Fira Code',monospace;letter-spacing:.015em}.mxRoot *{box-sizing:border-box}.mxRoot:before{content:"";pointer-events:none;position:fixed;inset:0;z-index:20;opacity:.38;background:repeating-linear-gradient(0deg,rgba(123,255,184,.025) 0,rgba(123,255,184,.025) 1px,transparent 1px,transparent 4px)}.mxRoot:after{content:"";pointer-events:none;position:fixed;inset:0;z-index:0;opacity:.28;background-image:linear-gradient(rgba(85,246,164,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(85,246,164,.06) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 74%)}.mxSweep{pointer-events:none;position:fixed;inset:auto 0 0;top:0;height:130px;z-index:19;background:linear-gradient(transparent,rgba(85,246,164,.045),transparent);animation:matrixSweep 8s linear infinite}.mxShell{position:relative;z-index:2;max-width:1680px;margin:0 auto}
.mxHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:5px 0 17px;border-bottom:1px solid rgba(85,246,164,.25)}.mxBrand{min-width:0}.mxKicker{color:var(--cyan);font-size:10px;letter-spacing:.22em;text-transform:uppercase;margin-bottom:7px}.mxLogo{color:#e6fff3;font-size:clamp(20px,3vw,34px);line-height:1;font-weight:800;letter-spacing:.11em;text-shadow:0 0 18px rgba(85,246,164,.35)}.mxSubtitle{margin-top:10px;color:var(--dim);font-size:10px;letter-spacing:.14em}.mxSignal{flex:0 0 auto;display:flex;align-items:center;gap:9px;color:var(--mint);border:1px solid rgba(85,246,164,.28);background:rgba(0,217,130,.06);padding:9px 11px;font-size:10px;letter-spacing:.13em}.mxSignal i{width:8px;height:8px;border-radius:99px;background:currentColor;box-shadow:0 0 12px currentColor;animation:matrixPulse 1.8s ease-in-out infinite}
.mxTabs{display:flex;gap:5px;margin:15px 0;flex-wrap:wrap}.mxBtn{appearance:none;border:1px solid rgba(85,246,164,.24);background:rgba(1,13,8,.78);color:var(--dim);padding:8px 11px;border-radius:0;font:inherit;font-size:10px;letter-spacing:.11em;cursor:pointer;transition:background .18s,color .18s,border .18s,transform .18s}.mxBtn:hover{color:var(--green);border-color:rgba(85,246,164,.7);transform:translateY(-1px)}.mxBtn.active{color:#05130c;background:var(--green);border-color:var(--green);box-shadow:0 0 18px rgba(85,246,164,.24)}
.mxGrid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:11px}.mxPanel{position:relative;overflow:hidden;min-width:0;padding:14px;border:1px solid rgba(85,246,164,.2);background:linear-gradient(145deg,rgba(7,27,17,.93),rgba(2,13,8,.9));box-shadow:inset 0 1px rgba(255,255,255,.03),0 12px 30px rgba(0,0,0,.16)}.mxPanel:before{content:"";position:absolute;top:0;left:0;width:36px;height:2px;background:var(--green);box-shadow:0 0 12px var(--green)}.mxPanel:after{content:"";pointer-events:none;position:absolute;inset:0;opacity:.26;background:linear-gradient(135deg,rgba(85,246,164,.045),transparent 45%)}.span-3{grid-column:span 3}.span-4{grid-column:span 4}.span-6{grid-column:span 6}.span-8{grid-column:span 8}.span-12{grid-column:span 12}.mxPanelTitle{position:relative;z-index:1;display:flex;justify-content:space-between;gap:10px;color:var(--dim);font-size:10px;letter-spacing:.16em;text-transform:uppercase}.mxPanelTitle span:last-child{color:rgba(123,163,142,.72);white-space:nowrap}.mxValue{position:relative;z-index:1;margin:12px 0 4px;color:#e6fff3;font-size:clamp(22px,2.3vw,31px);line-height:1;font-weight:700;text-shadow:0 0 15px rgba(85,246,164,.2)}.mxHint{position:relative;z-index:1;color:var(--dim);font-size:10px;line-height:1.55}.mxMeter{position:relative;z-index:1;height:5px;margin-top:12px;overflow:hidden;background:#06180e}.mxMeter>i{display:block;height:100%;background:linear-gradient(90deg,var(--mint),var(--green));box-shadow:0 0 14px var(--green)}.mxMeter.cyan>i{background:linear-gradient(90deg,#257a8d,var(--cyan));box-shadow:0 0 14px var(--cyan)}.mxMeter.amber>i{background:linear-gradient(90deg,#8d6b25,var(--amber));box-shadow:0 0 14px var(--amber)}
.mxRow{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:31px;padding:5px 0;border-bottom:1px solid rgba(85,246,164,.075);font-size:11px}.mxRow:last-child{border-bottom:0}.mxRow>span:last-child{color:#d7ffe9;text-align:right}.mxServiceName{display:flex;align-items:center;min-width:0}.mxDot{width:7px;height:7px;flex:0 0 auto;margin-right:9px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}.mxServiceStatus{color:var(--dim)!important;font-size:9px;letter-spacing:.1em}.mxHero{min-height:198px;display:flex;flex-direction:column;justify-content:space-between}.mxTarget{position:relative;z-index:1;display:flex;align-items:baseline;gap:11px;margin:10px 0}.mxTargetName{position:relative;z-index:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6fff3;font-size:clamp(28px,4.5vw,58px);font-weight:800;letter-spacing:-.045em;text-shadow:0 0 22px rgba(85,246,164,.26)}.mxTargetTag{position:relative;z-index:1;color:var(--cyan);font-size:10px;letter-spacing:.13em}.mxTargetFooter{position:relative;z-index:1;display:flex;justify-content:space-between;gap:12px;color:var(--dim);font-size:10px}.mxRadar{position:absolute;z-index:0;right:-23px;bottom:-41px;width:210px;height:210px;border:1px solid rgba(85,246,164,.2);border-radius:50%;background:repeating-radial-gradient(circle,transparent 0 28px,rgba(85,246,164,.14) 29px 30px)}.mxRadar:before{content:"";position:absolute;left:50%;top:50%;width:1px;height:105px;transform-origin:bottom;background:linear-gradient(var(--green),transparent);box-shadow:0 0 14px var(--green);animation:matrixDrift 2.4s ease-in-out infinite alternate}.mxRadar:after{content:"";position:absolute;inset:45%;border-radius:50%;background:var(--green);box-shadow:0 0 18px var(--green)}
.mxCommand{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px}.mxCommandCell{padding:9px;border-left:2px solid rgba(85,246,164,.34);background:rgba(0,0,0,.17)}.mxCommandCell b{display:block;color:#e6fff3;margin-top:4px;font-size:14px;font-weight:600}.mxCommandCell span{color:var(--dim);font-size:9px;letter-spacing:.12em}.mxEventFeed{position:relative;z-index:1;max-height:303px;overflow:hidden}.mxEvent{display:grid;grid-template-columns:62px 77px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid rgba(85,246,164,.065);color:#aac9b7;font-size:10px;line-height:1.45}.mxEvent time{color:var(--dim)}.mxEvent b{color:var(--cyan);font-weight:500;text-transform:uppercase}.mxEvent.warn b{color:var(--amber)}.mxEvent.error b{color:var(--red)}.mxEmpty{position:relative;z-index:1;padding:24px 0;color:var(--dim);font-size:10px;letter-spacing:.11em;text-align:center}.mxTable{position:relative;z-index:1;width:100%;border-collapse:collapse;font-size:11px}.mxTable th{padding:8px 7px;color:var(--dim);border-bottom:1px solid rgba(85,246,164,.17);text-align:left;font-size:9px;font-weight:500;letter-spacing:.12em}.mxTable td{padding:9px 7px;border-bottom:1px solid rgba(85,246,164,.065)}.mxTable td:last-child{text-align:right;color:#e6fff3}.mxSettings{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.mxWire{position:relative;z-index:1}.mxWireRow{display:grid;grid-template-columns:74px 1fr auto;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(85,246,164,.075)}.mxWireRow:last-child{border-bottom:0}.mxWireRow.urgent .mxWireTag{color:var(--amber);border-color:rgba(255,211,106,.45)}.mxWireTag{padding:3px 5px;border:1px solid rgba(85,246,164,.3);color:var(--cyan);font-size:8px;letter-spacing:.11em;text-align:center}.mxWireBody{min-width:0}.mxWireBody b{display:block;color:#e6fff3;font-size:11px;font-weight:600;line-height:1.35}.mxWireBody em{display:block;margin-top:3px;color:var(--dim);font-size:9px;font-style:normal;line-height:1.5}
.mxVoice{display:block;margin-bottom:4px;color:var(--green);font-size:10px;font-style:italic;line-height:1.5;opacity:.92;quotes:none}
.mxCmd{display:block;margin-top:5px;padding:5px 7px;border-left:2px solid var(--cyan);background:rgba(0,0,0,.34);color:var(--cyan);font-family:inherit;font-size:9px;line-height:1.5;word-break:break-all;user-select:all}
.mxBadge{display:inline-block;padding:2px 6px;border-radius:2px;font-size:9px;letter-spacing:.08em;font-weight:600;text-transform:uppercase}.mxBadge.green{background:rgba(0,217,130,.15);color:var(--mint);border:1px solid rgba(0,217,130,.4)}.mxBadge.amber{background:rgba(255,211,106,.15);color:var(--amber);border:1px solid rgba(255,211,106,.4)}.mxBadge.red{background:rgba(255,93,121,.15);color:var(--red);border:1px solid rgba(255,93,121,.4)}
@media(max-width:1000px){.mxRoot{padding:14px}.mxGrid{grid-template-columns:repeat(6,minmax(0,1fr))}.span-12,.span-8,.span-6{grid-column:span 6}.span-4,.span-3{grid-column:span 3}.mxLogo{letter-spacing:.07em}}@media(max-width:620px){.mxRoot{padding:11px}.mxHeader{flex-direction:column;gap:12px}.mxSignal{align-self:stretch;justify-content:center}.mxGrid{grid-template-columns:1fr;gap:8px}.span-12,.span-8,.span-6,.span-4,.span-3{grid-column:span 1}.mxPanel{padding:12px}.mxEvent{grid-template-columns:54px 64px 1fr;gap:5px}.mxTargetName{font-size:34px}.mxTabs{margin:12px 0}.mxBtn{flex:1 1 90px}}
`;

function Panel({ title, right, span = 3, className = "", children }) { return <section className={`mxPanel span-${span} ${className}`}><div className="mxPanelTitle"><span>{title}</span><span>{right}</span></div>{children}</section>; }
function serviceColor(status) { if (["online", "batching", "preparing", "trading"].includes(status)) return COLOR.green; if (status === "liquidating") return COLOR.amber; if (status === "error") return COLOR.red; if (status === "paused") return COLOR.amber; return COLOR.dim; }
const SF_REQUIRED = { singularity: 4, progression: 4, gang: 2, sleeves: 10, bladeburner: 6, corporation: 3, stanek: 13 };
function Service({ name, value, sourceFiles }) {
    const need = SF_REQUIRED[name];
    // Telemetry serialises ownedSF as [n, lvl] pairs, but accept the {n, lvl}
    // shape too and skip anything else rather than destructuring a non-array.
    const owned = need ? (Array.isArray(sourceFiles) ? sourceFiles : []).some(entry =>
        Number(Array.isArray(entry) ? entry[0] : entry?.n) === need) : true;
    const status = value?.status ?? (need && !owned ? `needs SF${need}` : "offline");
    const color = need && !owned && !value ? COLOR.dim : serviceColor(value?.status ?? "offline");
    return <div className="mxRow"><span className="mxServiceName"><i className="mxDot" style={{ color }} />{name}</span><span className="mxServiceStatus" style={{ color }}>{String(status).toUpperCase()}</span></div>;
}

function ManualActions({ data }) {
    const actions = data.manual ?? [];
    if (data.singularity) {
        return (
            <>
                <div className="mxValue" style={{ fontSize: 17, color: COLOR.mint }}>FULLY AUTONOMOUS</div>
                <div className="mxHint">Singularity is available - MATRIX buys RAM, programs and augmentations itself.</div>
            </>
        );
    }
    if (!actions.length) return <div className="mxEmpty">NOTHING OUTSTANDING</div>;
    return (
        <>
            <div className="mxHint" style={{ marginBottom: 8 }}>
                Bitburner gates these behind Singularity (Source-File 4). No script can do them yet - you must.
            </div>
            {actions.map(action => (
                <div className="mxRow" key={action.id}>
                    <span className="mxServiceName">
                        <i className="mxDot" style={{ color: action.ready ? COLOR.green : COLOR.dim }} />
                        {action.label}
                    </span>
                    <span style={{ textAlign: "right" }}>
                        <b style={{ color: action.ready ? "#e6fff3" : COLOR.dim }}>{action.cost > 0 ? money(action.cost) : "FREE"}</b>
                        <div style={{ fontSize: 9, color: COLOR.dim }}>{action.where}</div>
                    </span>
                </div>
            ))}
        </>
    );
}
function Toggle({ config, path, label }) { const parts = path.split("."); let value = config; for (const part of parts) value = value?.[part]; const change = () => { const next = JSON.parse(JSON.stringify(config ?? {})); let current = next; for (let index = 0; index < parts.length - 1; index++) current = current[parts[index]] ??= {}; current[parts.at(-1)] = !value; store.send({ type: "config", value: next }); }; return <button className={`mxBtn ${value !== false ? "active" : ""}`} onClick={change}>{label} {value !== false ? "ON" : "OFF"}</button>; }

// "Wake up, Neo." Everything the game will not let a script do yet arrives
// here as an instruction, in priority order, so there is always one clear next
// move on screen instead of a locked module and no explanation.
function Transmission({ data }) {
    const directives = (Array.isArray(data.directives) ? data.directives : []).filter(d => d && d.label);
    const manual = (Array.isArray(data.manual) ? data.manual : []).filter(a => a && a.label);
    // Faction moves lead: they gate augmentations, which gate everything else.
    const feed = [...directives, ...manual.map(action => ({
        id: action.id, tag: action.tag, label: action.label,
        detail: action.detail ?? action.short, urgent: false, ready: action.ready,
    }))].slice(0, 6);

    if (!feed.length) return <div className="mxEmpty">NO OPERATOR INPUT REQUIRED</div>;
    return (
        <div className="mxWire">
            {feed.map((item, index) => (
                <div className={`mxWireRow${item.urgent ? " urgent" : ""}`} key={item.id ?? index}>
                    <span className="mxWireTag">{item.tag ?? "DO"}</span>
                    <span className="mxWireBody">
                        {item.voice ? <q className="mxVoice">{item.voice}</q> : null}
                        <b>{item.label}</b>
                        <em>{item.detail}</em>
                        {item.command ? <code className="mxCmd">{item.command}</code> : null}
                    </span>
                    <span className={`mxBadge ${item.urgent ? "amber" : item.ready ? "green" : ""}`}>
                        {item.urgent ? "YOU" : item.ready ? "READY" : "LOCKED"}
                    </span>
                </div>
            ))}
        </div>
    );
}

// The full faction map: what is linked, what is waiting, and for everything else
// the exact requirements still missing. This is knowledge, not an API call, so
// it works with no Singularity at all.
function FactionIntel({ data }) {
    // Telemetry may be mid-write, from an older version, or reporting a service
    // that failed - so every list is proved to be a list before it is mapped.
    const factions = data.factions ?? null;
    const list = value => (Array.isArray(value) ? value : []);
    const joined = list(factions?.joined).length ? list(factions.joined) : list(data.player?.factions);
    const eligible = list(factions?.eligible).filter(f => f && f.name);
    const pending = list(factions?.pending).filter(f => f && f.name);
    if (!joined.length && !eligible.length && !pending.length) {
        return <div className="mxEmpty">NO FACTION INTELLIGENCE</div>;
    }
    return (
        <>
            {eligible.map(faction => (
                <div className="mxRow" key={`e-${faction.name}`}>
                    <span className="mxServiceName"><i className="mxDot" style={{ color: COLOR.amber }} />{faction.name}</span>
                    <span style={{ color: COLOR.amber }}>INVITATION WAITING - JOIN IT</span>
                </div>
            ))}
            {joined.map(faction => (
                <div className="mxRow" key={`j-${faction}`}>
                    <span className="mxServiceName"><i className="mxDot" style={{ color: COLOR.green }} />{faction}</span>
                    <span style={{ color: COLOR.mint }}>CONNECTED</span>
                </div>
            ))}
            {pending.map(faction => (
                <div className="mxRow" key={`p-${faction.name}`}>
                    <span className="mxServiceName"><i className="mxDot" style={{ color: COLOR.dim }} />{faction.name}</span>
                    <span className="mxServiceStatus" style={{ color: COLOR.dim, textAlign: "right" }}>
                        {(faction.missing ?? []).slice(0, 3).join(" · ") || "LOCKED"}
                    </span>
                </div>
            ))}
        </>
    );
}

function Overview({ data }) {
    const services = data.services ?? {}, network = data.network ?? {}, hacking = services.hacking ?? {}, player = data.player ?? {}, income = data.income ?? {}, coord = services.coordinator ?? {}, target = hacking.target ?? "SCANNING", phase = hacking.phase ?? hacking.status ?? "BOOTSTRAP", rootRate = network.discovered ? network.rooted / network.discovered : 0;
    const objectiveTitle = coord.title ?? "Network Expansion & Hacking Income";
    const objectiveReason = coord.reason ?? (services.singularity?.goal?.augmentation ? `funding ${services.singularity.goal.augmentation}` : "building capability through hacking");
    const milestone = coord.milestone ?? null;
    const liquidate = Boolean(coord.liquidateStocks);
    const directives = coord.directives ?? null;

    return (
        <div className="mxGrid">
            <Panel title="Liquid capital" right="LIVE" span={3}>
                <div className="mxValue">{money(player.money)}</div>
                <div className="mxHint">hacking income {money(income.hacking ?? 0)} since install</div>
            </Panel>
            <Panel title="Network authority" right={`${network.rooted ?? 0}/${network.discovered ?? 0}`} span={3}>
                <div className="mxValue">{ram(network.maxRam ?? 0)}</div>
                <div className="mxMeter cyan"><i style={{ width: `${rootRate * 100}%` }} /></div>
                <div className="mxHint">{percent(network.ramPct)} RAM utilization</div>
            </Panel>
            <Panel title="BitNode route" right={`BN-${data.reset?.currentNode ?? "?"}`} span={3}>
                <div className="mxValue">NODE {data.reset?.currentNode ?? "?"}</div>
                <div className="mxHint">{services.progression?.nextNode ? `next route: BN-${services.progression.nextNode}` : "route calculation standing by"}</div>
            </Panel>
            <Panel title="System heartbeat" right={age(data.updated)} span={3}>
                <div className="mxValue" style={{ color: data.updated ? COLOR.green : COLOR.amber }}>{data.updated ? "NOMINAL" : "LINK LOST"}</div>
                <div className="mxHint">telemetry updates once per second</div>
            </Panel>

            <Panel title="Primary operation" right={phase} span={8} className="mxHero">
                <div className="mxRadar" />
                <div>
                    <div className="mxTarget"><span className="mxTargetTag">ACTIVE TARGET</span></div>
                    <div className="mxTargetName">{target}</div>
                </div>
                <div className="mxTargetFooter">
                    <span>ENGINE: {String(phase).toUpperCase()}</span>
                    <span>{hacking.batches ? `${hacking.batches} HWGW BATCHES` : "ADAPTIVE CONTROL"}</span>
                </div>
            </Panel>

            <Panel title="Mission board" right="PROGRESSION COORDINATOR" span={4}>
                <div className="mxCommand">
                    <div className="mxCommandCell" style={{ gridColumn: "span 2" }}>
                        <span>GLOBAL OBJECTIVE</span>
                        <b style={{ fontSize: 13, color: COLOR.mint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {objectiveTitle}
                        </b>
                    </div>
                    <div className="mxCommandCell">
                        <span>QUEUED AUGS</span>
                        <b>{services.singularity?.queuedAugs ?? 0}</b>
                    </div>
                    <div className="mxCommandCell">
                        <span>STOCK STATUS</span>
                        <b style={{ color: liquidate ? COLOR.amber : COLOR.green, fontSize: 11 }}>{liquidate ? "LIQUIDATING" : "ACTIVE"}</b>
                    </div>
                </div>

                <div style={{ marginTop: 12, padding: "9px", background: "rgba(0,0,0,0.25)", borderLeft: `2px solid ${COLOR.cyan}` }}>
                    <div style={{ fontSize: 9, color: COLOR.cyan, letterSpacing: "0.14em", textTransform: "uppercase" }}>NEXT STEP / MILESTONE</div>
                    <div style={{ fontSize: 11, color: "#e6fff3", fontWeight: 600, marginTop: 3 }}>
                        {coord.nextStep ?? "Building hacking level & capital"}
                    </div>
                    <div className="mxRow" style={{ padding: "4px 0 0", border: 0 }}>
                        <span style={{ fontSize: 10, color: COLOR.dim }}>COUNTDOWN / EST. TIME</span>
                        <span className="mxBadge green" style={{ fontSize: 10 }}>{coord.etaStr ?? "IN PROGRESS"}</span>
                    </div>
                </div>

                {coord.phase ? (
                    <div style={{ marginTop: 10 }}>
                        <div className="mxRow" style={{ padding: "2px 0", border: 0 }}>
                            <span style={{ fontSize: 9, color: COLOR.dim, letterSpacing: "0.12em" }}>PHASE</span>
                            <span style={{ fontSize: 10, color: COLOR.cyan, fontWeight: 700 }}>{coord.phase}</span>
                        </div>
                        {directives ? (
                            <div style={{ fontSize: 9, color: COLOR.dim, letterSpacing: "0.06em", lineHeight: 1.6 }}>
                                HACK {String(directives.hacking ?? "-").toUpperCase()} · SLV {String(directives.sleeves ?? "-").toUpperCase()} · GANG {String(directives.gang ?? "-").toUpperCase()} · STOCK {String(directives.stock ?? "-").toUpperCase()}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {milestone ? (
                    <div style={{ marginTop: 10 }}>
                        <div className="mxRow" style={{ padding: "2px 0", border: 0 }}>
                            <span style={{ fontSize: 9, color: COLOR.dim }}>{milestone.name}</span>
                            <span style={{ fontSize: 9, color: COLOR.mint }}>{meter(milestone.pct).toFixed(1)}%</span>
                        </div>
                        <div className="mxMeter"><i style={{ width: `${meter(milestone.pct)}%` }} /></div>
                    </div>
                ) : null}
            </Panel>

            <Panel title="Automation mesh" right={`${SERVICE_ORDER.length} MODULES`} span={4}>
                {SERVICE_ORDER.map(name => <Service key={name} name={name} value={services[name]} sourceFiles={data.reset?.sourceFiles} />)}
            </Panel>
            <Panel title="Incoming transmission" right={data.singularity ? "AUTONOMOUS" : "OPERATOR INPUT REQUIRED"} span={4}>
                <Transmission data={data} />
            </Panel>
            <Panel title="Live event stream" right={`${data.events?.length ?? 0} BUFFERED`} span={8}>
                <div className="mxEventFeed">
                    {data.events?.length ? (
                        data.events.slice(0, 20).map((event, index) => (
                            <div key={index} className={`mxEvent ${event.level ?? ""}`}>
                                <time>{new Date(event.t).toLocaleTimeString()}</time>
                                <b>{event.service}</b>
                                <span>{event.message}</span>
                            </div>
                        ))
                    ) : (
                        <div className="mxEmpty">AWAITING FIRST SYSTEM EVENT</div>
                    )}
                </div>
            </Panel>
        </div>
    );
}

function Hacking({ data }) {
    const hacking = data.services?.hacking ?? {}, network = data.network ?? {};
    const extraction = hacking.hackFraction ? percent(hacking.hackFraction) : "--";
    const rows = [
        ["Target host", hacking.target ?? "--"],
        ["Engine phase", hacking.phase ?? hacking.status ?? "offline"],
        ["Active HWGW batches", hacking.batches ?? 0],
        ["Hack extraction %", extraction],
        ["Expected money / batch", money(hacking.expectedPerBatch)],
        ["Batch RAM footprint", ram(hacking.batchRam)],
        ["Launch delay gap", hacking.gapMs ? `${hacking.gapMs} ms` : "--"],
        ["Completed batch count", hacking.batchCounter ?? 0],
    ];

    return (
        <div className="mxGrid">
            <Panel title="Hacking engine" right={hacking.status ?? "OFFLINE"} span={8} className="mxHero">
                <div className="mxRadar" />
                <div className="mxTargetTag">ACTIVE TARGET</div>
                <div className="mxTargetName">{hacking.target ?? "SCANNING"}</div>
                <div className="mxTargetFooter">
                    <span>{String(hacking.phase ?? "waiting").toUpperCase()}</span>
                    <span>{extraction} EXTRACTION</span>
                </div>
            </Panel>
            <Panel title="Network reserve" right={percent(network.ramPct)} span={4}>
                <div className="mxValue">{ram(network.maxRam ?? 0)}</div>
                <div className="mxMeter"><i style={{ width: `${(network.ramPct ?? 0) * 100}%` }} /></div>
                <div className="mxHint">{network.rooted ?? 0} rooted hosts / {network.discovered ?? 0} discovered</div>
            </Panel>
            <Panel title="Batch telemetry & thread breakdown" right="LIVE SCHEDULER" span={12}>
                <table className="mxTable">
                    <tbody>
                        {rows.map(([label, value]) => (
                            <tr key={label}>
                                <td>{label}</td>
                                <td>{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>
        </div>
    );
}

function Economy({ data }) {
    const services = data.services ?? {}, income = data.income ?? {}, coord = services.coordinator ?? {};
    const rows = [
        ["Hacking", income.hacking],
        ["Hacknet", income.hacknet],
        ["Corporation", income.corporation],
        ["Gang", income.gang],
        ["Crime", income.crime],
        ["Work", income.work],
        ["Stocks", income.stock],
    ];

    return (
        <div className="mxGrid">
            <Panel title="Capital flow" right="SINCE INSTALL" span={6}>
                <table className="mxTable">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Accumulated</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([name, value]) => (
                            <tr key={name}>
                                <td>{name}</td>
                                <td>{money(value ?? 0)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Panel>
            <Panel title="Asset allocation & Infrastructure" right="AUTOPILOT" span={6}>
                <div className="mxRow"><span>Purchased servers</span><span>{services.cloud?.servers ?? 0} / {ram(services.cloud?.totalRam ?? 0)}</span></div>
                <div className="mxRow"><span>Hacknet nodes</span><span>{services.hacknet?.nodes ?? 0} nodes</span></div>
                <div className="mxRow"><span>Stock exposure</span><span>{money(services.stock?.exposure ?? 0)}</span></div>
                <div className="mxRow"><span>Stock liquidation mode</span><span style={{ color: coord.liquidateStocks ? COLOR.amber : COLOR.mint }}>{coord.liquidateStocks ? "TRIGGERED" : "NORMAL"}</span></div>
                <div className="mxRow"><span>Corporation treasury</span><span>{money(services.corporation?.funds ?? 0)}</span></div>
                <div className="mxRow"><span>Corporation profit/cycle</span><span>{money(services.corporation?.profit ?? 0)}</span></div>
            </Panel>
        </div>
    );
}

function Progress({ data }) {
    const player = data.player ?? {}, services = data.services ?? {}, goal = services.singularity?.goal, coord = services.coordinator ?? {}, go = services.go ?? {}, augs = data.augmentations ?? {},
        // Telemetry may be older, mid-write, or reporting a failed service: a
        // nullish guard does not save a `.map` on a string.
        augReady = Array.isArray(augs.ready) ? augs.ready.filter(a => a && a.name) : [],
        augBlocked = Array.isArray(augs.blocked) ? augs.blocked.filter(a => a && a.name) : [],
        grind = data.grind && typeof data.grind === "object" ? data.grind : null;
    const skills = ["strength", "defense", "dexterity", "agility", "charisma", "intelligence"];

    return (
        <div className="mxGrid">
            <Panel title="Operator profile" right={player.city ?? "UNKNOWN"} span={4}>
                <div className="mxValue">HACK {player.skills?.hacking ?? 0}</div>
                {skills.map(skill => (
                    <div className="mxRow" key={skill}>
                        <span>{skill}</span>
                        <span>{player.skills?.[skill] ?? 0}</span>
                    </div>
                ))}
            </Panel>
            <Panel title="Augmentation directive" right={services.singularity?.status ?? "LOCKED"} span={4}>
                {goal ? (
                    <>
                        <div className="mxValue" style={{ fontSize: 18 }}>{goal.augmentation}</div>
                        <div className="mxHint">{goal.faction}</div>
                        <div className="mxMeter"><i style={{ width: `${Math.min(100, (100 * (goal.rep ?? 0)) / Math.max(1, goal.need ?? 1))}%` }} /></div>
                        <div className="mxHint" style={{ marginTop: 8 }}>
                            {Math.round(goal.rep ?? 0).toLocaleString()} / {Math.round(goal.need ?? 0).toLocaleString()} faction rep
                        </div>
                    </>
                ) : (
                    <div className="mxEmpty">NO SINGULARITY DIRECTIVE</div>
                )}
            </Panel>
            <Panel title="Progression Directive" right={coord.objective ?? "ACTIVE"} span={4}>
                <div className="mxValue" style={{ fontSize: 16, color: COLOR.mint }}>{coord.title ?? "Hacking Income"}</div>
                <div className="mxHint">{coord.reason ?? "Expanding network capabilities"}</div>
                <div style={{ marginTop: 10, padding: "8px", background: "rgba(0,0,0,0.2)", borderLeft: `2px solid ${COLOR.cyan}` }}>
                    <div style={{ fontSize: 9, color: COLOR.cyan, letterSpacing: "0.12em" }}>NEXT STEP</div>
                    <div style={{ fontSize: 10, color: "#e6fff3", fontWeight: 600, marginTop: 2 }}>{coord.nextStep ?? "Building hacking level & capital"}</div>
                    <div className="mxRow" style={{ padding: "4px 0 0", border: 0 }}>
                        <span style={{ fontSize: 9, color: COLOR.dim }}>ESTIMATED TIME</span>
                        <span className="mxBadge green" style={{ fontSize: 9 }}>{coord.etaStr ?? "IN PROGRESS"}</span>
                    </div>
                </div>
                {coord.milestone ? (
                    <div style={{ marginTop: 10 }}>
                        <div className="mxRow" style={{ border: 0, padding: 0 }}>
                            <span style={{ fontSize: 10, color: COLOR.dim }}>{coord.milestone.name}</span>
                            <span style={{ fontSize: 10, color: COLOR.mint }}>{meter(coord.milestone.pct).toFixed(1)}%</span>
                        </div>
                        <div className="mxMeter cyan"><i style={{ width: `${meter(coord.milestone.pct)}%` }} /></div>
                    </div>
                ) : null}
            </Panel>
            <Panel title="Augmentation shortlist" right={Number(augs.total) ? `${augs.total} REACHABLE` : "NO FACTION ACCESS"} span={12}>
                {(augReady.length || augBlocked.length) ? (
                    <>
                        {augReady.map(aug => (
                            <div className="mxRow" key={`r-${aug.name}`}>
                                <span className="mxServiceName"><i className="mxDot" style={{ color: COLOR.amber }} />{aug.name}</span>
                                <span style={{ color: COLOR.amber }}>{aug.faction} · {money(aug.money)} · BUY NOW</span>
                            </div>
                        ))}
                        {augBlocked.map(aug => (
                            <div className="mxRow" key={`b-${aug.name}`}>
                                <span className="mxServiceName"><i className="mxDot" style={{ color: COLOR.dim }} />{aug.name}</span>
                                <span className="mxServiceStatus" style={{ color: COLOR.dim }}>
                                    {aug.faction} · {aug.repShort > 0 ? `${Math.round(aug.repShort).toLocaleString()} rep short` : ""}
                                    {aug.repShort > 0 && aug.moneyShort > 0 ? " · " : ""}
                                    {aug.moneyShort > 0 ? `${money(aug.moneyShort)} short` : ""}
                                </span>
                            </div>
                        ))}
                        {grind?.faction ? <div className="mxHint" style={{ marginTop: 10 }}>Best faction to work for: {grind.faction} ({grind.augs ?? 0} implants locked)</div> : null}
                    </>
                ) : (
                    <div className="mxEmpty">JOIN A FACTION TO SEE ITS AUGMENTATIONS</div>
                )}
            </Panel>
            <Panel title="Subnet control // IPvGO" right={go.status === "unavailable" ? "NOT IN THIS BITNODE" : (go.opponent ?? "STANDBY")} span={12}>
                {go.status && go.status !== "unavailable" ? (
                    <>
                        <div className="mxRow"><span>opponent</span><span>{go.opponent ?? "-"}</span></div>
                        <div className="mxRow"><span>permanent bonus</span><span style={{ color: COLOR.mint }}>{go.bonus ?? "-"}</span></div>
                        <div className="mxRow"><span>routers held</span><span>{go.routers ?? 0} vs {go.enemyRouters ?? 0} · {go.open ?? 0} open</span></div>
                        <div className="mxRow"><span>record</span><span>{go.totalWins ?? 0} won of {go.games ?? 0} · streak {go.wins ?? 0}</span></div>
                    </>
                ) : (
                    <div className="mxEmpty">{go.status === "unavailable" ? "IPVGO NOT PRESENT IN THIS BITNODE" : "SUBNET ENGINE STANDING BY"}</div>
                )}
            </Panel>
            <Panel title="Faction network" right={`${data.factions?.joined?.length ?? player.factions?.length ?? 0} LINKED / ${data.factions?.eligible?.length ?? 0} WAITING`} span={12}>
                <FactionIntel data={data} />
            </Panel>
        </div>
    );
}

function Settings({ config }) {
    return (
        <div className="mxGrid">
            <Panel title="Autopilot authority" right="PERSISTENT CONFIGURATION" span={12}>
                <div className="mxSettings">
                    <Toggle config={config} path="masterEnabled" label="AUTOPILOT" />
                </div>
                <div className="mxHint" style={{ marginTop: 16 }}>
                    Every control is saved to /matrix/config.json. The running managers read it on their next cycle.
                </div>
                <div className="mxSettings">
                    {Object.keys(config.automation ?? {}).map(key => (
                        <Toggle key={key} config={config} path={`automation.${key}`} label={key.toUpperCase()} />
                    ))}
                </div>
            </Panel>
        </div>
    );
}

// The deck re-renders every 750ms against telemetry that changes shape as
// services come and go. A render that throws on the 400th tick would kill the
// script - and Bitburner leaves the dead window on screen with a restart button,
// which is exactly what a pile of "refreshing" decks turns out to be.
//
// An error boundary makes a bad frame survivable: the deck shows what broke
// instead of dying and orphaning its window.
class DeckBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="mxRoot" style={{ padding: 24 }}>
                <div className="mxLogo">COMMAND DECK FAULT</div>
                <div className="mxHint" style={{ marginTop: 12, color: COLOR.amber }}>
                    A panel threw while rendering. The deck stayed up so the fault is visible
                    instead of leaving a dead window behind.
                </div>
                <pre style={{ marginTop: 16, color: COLOR.red, fontSize: 11, whiteSpace: "pre-wrap" }}>
                    {String(this.state.error?.stack ?? this.state.error)}
                </pre>
            </div>
        );
    }
}

function App() {
    const { data, config } = useStore();
    const [tab, setTab] = React.useState("OVERVIEW");

    const tabs = ["OVERVIEW", "HACKING", "ECONOMY", "PROGRESS", "SETTINGS"];
    const content =
        tab === "HACKING" ? (
            <Hacking data={data} />
        ) : tab === "ECONOMY" ? (
            <Economy data={data} />
        ) : tab === "PROGRESS" ? (
            <Progress data={data} />
        ) : tab === "SETTINGS" ? (
            <Settings config={config} />
        ) : (
            <Overview data={data} />
        );

    return (
        <div className="mxRoot">
            <style>{css}</style>
            <MatrixRainCanvas enabled={config.ui?.matrixRain !== false} />
            <div className="mxSweep" />
            <main className="mxShell">
                <header className="mxHeader">
                    <div className="mxBrand">
                        <div className="mxKicker">BITBURNER // CYBER OPERATIONS SYSTEM</div>
                        <div className="mxLogo">MATRIX COMMAND DECK</div>
                        <div className="mxSubtitle">
                            VERSION {data.game?.version ?? "3.x"} / TELEMETRY {age(data.updated)} / HOME LINK ACTIVE
                        </div>
                    </div>
                    <div className="mxSignal">
                        <i style={{ color: config.masterEnabled === false ? COLOR.amber : COLOR.green }} />
                        {config.masterEnabled === false ? "AUTOPILOT PAUSED" : "AUTOPILOT ENGAGED"}
                    </div>
                </header>
                <nav className="mxTabs">
                    {tabs.map(name => (
                        <button key={name} className={`mxBtn ${tab === name ? "active" : ""}`} onClick={() => setTab(name)}>
                            {name}
                        </button>
                    ))}
                </nav>
                {content}
            </main>
        </div>
    );
}

const LEASE = `${STATE_DIR}/dashboard.txt`;

// Read the lease. A challenger must NOT write here - only the holder renews.
function lease(ns) {
    return readJson(ns, LEASE, null);
}

async function writeLease(ns, phase, ticks, error) {
    try {
        await writeJson(ns, LEASE, {
            service: "dashboard", updated: Date.now(), pid: ns.pid, phase, ticks,
            ...(error ? { error: String(error) } : {}),
        });
    } catch {}
}

// Every ns call in the deck happens here, in the script's own context.
function publish(ns) {
    let data = {}, settings = {};
    try { data = state(ns) ?? {}; } catch {}
    try { settings = readJson(ns, CONFIG, {}); } catch {}
    store.publish({ data, config: settings });
}

// Config toggles are queued by the UI and applied here, never in the handler.
async function applyCommands(ns) {
    for (const command of store.drain()) {
        if (command?.type !== "config") continue;
        try { await ns.write(CONFIG, JSON.stringify(command.value, null, 2), "w"); } catch {}
    }
}

function refreshMs(settings) {
    const value = Number(settings?.ui?.refreshMs);
    return Math.max(350, Number.isFinite(value) && value > 0 ? value : 750);
}

export async function main(ns) {
    ns.disableLog("ALL");
    ns.clearLog();
    // A startup-only check let racing supervisors leave several decks alive.
    // Claim ownership now and keep re-claiming below, so duplicates collapse.
    // Stand down rather than being killed: a killed script cannot close its own
    // window, which is how orphaned decks pile up on screen.
    // Take the lease before rendering, so a duplicate never opens a window.
    const held = lease(ns);
    if (leaseDecision(held, ns.pid) === "stand-down") {
        ns.tprint(`MATRIX-OS // DECK ${ns.pid} STANDING DOWN AT START (lease held by ${held?.pid})`);
        try { ns.ui.closeTail(); } catch {}
        return;
    }
    await writeLease(ns, "rendering", 0);
    // The deck was dying somewhere between launch and its first heartbeat, with
    // no trace. Record the cause and put it in the terminal, where it cannot be
    // missed, instead of silently leaving another orphaned window behind.
    // The tree renders from the snapshot, so fill it before mounting.
    publish(ns);
    try {
        ns.printRaw(<DeckBoundary><App /></DeckBoundary>);
    } catch (error) {
        await writeLease(ns, "render-failed", 0, error);
        ns.tprint(`MATRIX-OS // COMMAND DECK RENDER FAILED: ${error}`);
        return;
    }
    try { ns.tail(); } catch {}
    try { ns.ui.setTailTitle("MATRIX // COMMAND DECK"); } catch {}
    try {
        const [width, height] = ns.ui.windowSize();
        ns.ui.resizeTail(Math.min(Math.max(760, Math.floor(width * 0.88)), 1560), Math.min(Math.max(610, Math.floor(height * 0.84)), 980));
        ns.ui.moveTail(Math.max(10, Math.floor(width * 0.06)), Math.max(10, Math.floor(height * 0.07)));
    } catch {
        try {
            ns.ui.resizeTail(1260, 760);
            ns.ui.moveTail(40, 40);
        } catch {}
    }
    ns.ui.openTail();
    await writeLease(ns, "alive", 0);
    ns.tprint(`MATRIX-OS // COMMAND DECK ONLINE (pid ${ns.pid})`);
    // Re-assert ownership rather than trusting the one check at startup, and
    // leave a heartbeat so a deck that dies is diagnosable rather than silent.
    let ticks = 0;
    let lastBeat = 0;
    while (true) {
        // Never wrap ns.sleep: catching it would swallow the game's own
        // termination signal when the script is killed.
        await ns.sleep(refreshMs(store.snapshot.config));
        await applyCommands(ns);
        // Drives the UI from OUR context. The tree never calls ns itself.
        publish(ns);

        // The lease is a 2s concern; the repaint is a 750ms one. Keep them
        // apart so a fast refresh does not hammer the state file.
        if (Date.now() - lastBeat < 2000) continue;
        lastBeat = Date.now();
        // Only the holder renews. Losing the lease means another deck took over
        // after ours went stale, so stand down WITHOUT writing - writing here is
        // exactly what made every instance fight over the same file.
        const current = lease(ns);
        if (leaseDecision(current, ns.pid) === "stand-down") {
            // Reported to the TERMINAL, not the lease: a challenger must never
            // write it. If a deck vanishes without printing this, it did not
            // choose to exit - something else killed it.
            ns.tprint(`MATRIX-OS // DECK ${ns.pid} LOST LEASE TO ${current?.pid} AFTER ${ticks} TICKS`);
            try { ns.ui.closeTail(); } catch {}
            return;
        }
        await writeLease(ns, "alive", ++ticks);
    }
}
