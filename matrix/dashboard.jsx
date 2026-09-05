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
    // Preserve an old observation rather than silently replacing it with a
    // bootstrap view. The presentation reports its age and disables writes.
    if (overview && typeof overview === "object" && !Array.isArray(overview)) return overview;
    const bootstrap = readJson(ns, `${STATE_DIR}/bootstrap.txt`, {}), early = readJson(ns, `${STATE_DIR}/early.txt`, {});
    const boot = (early.updated ?? 0) > (bootstrap.updated ?? 0) ? early : bootstrap;
    return { updated: boot.updated ?? 0, player: { money: ns.getServerMoneyAvailable("home") }, network: { discovered: boot.discovered, rooted: boot.rooted }, services: { bootstrap: { updated: boot.updated, status: boot.status ?? "starting" }, hacking: { status: boot.phase ?? "bootstrap", target: boot.target } }, events: [] };
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
    snapshot: { data: {}, config: {}, configReady: false, history: [], commandLog: [] },
    listeners: new Set(),
    commands: [],
    commandLog: [],
    history: [],
    historyEpoch: null,
    nextId: 0,
    publish(snapshot) {
        store.snapshot = snapshot;
        // One broken subscriber must not stop the others, or stop main().
        for (const listener of [...store.listeners]) { try { listener(); } catch {} }
    },
    subscribe(listener) { store.listeners.add(listener); return () => store.listeners.delete(listener); },
    send(command) {
        if (store.commands.length >= 20) return;
        store.commands.push({ ...command, id: ++store.nextId });
        store.commandLog = [...store.commandLog, { t: Date.now(), status: "pending", message: `Modification demandée : ${command.path}. En attente d’écriture.` }].slice(-40);
        store.publish({ ...store.snapshot, commandLog: store.commandLog });
    },
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
    const actions = ghostArray(data.manual);
    if (!actions.length) return <div className="mxEmpty">NOTHING OUTSTANDING</div>;
    return (
        <>
            <div className="mxHint" style={{ marginBottom: 8 }}>
                Instructions publiées par la télémétrie. Un accès Singularity ne prouve pas qu’un exécuteur est actif.
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
function Toggle({ config, path, label }) {
    const parts = path.split("."); let value = config;
    for (const part of parts) value = value?.[part];
    const pending = store.commands.some(c => c.path === path);
    const disabled = pending || !store.snapshot.configReady || !ghostFresh(store.snapshot.data?.updated);
    return <button type="button" className="gx-button" aria-pressed={value !== false} disabled={disabled} onClick={() => store.send({ type: "patch", path, value: value === false, expected: value })}>{pending ? "En attente…" : `${label} ${value !== false ? "ON" : "OFF"}`}</button>;
}

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
        ["Active HWGW batches", hacking.activeBatches ?? hacking.batches ?? "--"],
        ["Hack extraction %", extraction],
        ["Expected money / batch", money(hacking.expectedPerBatch)],
        ["Batch RAM footprint", ram(hacking.batchRam)],
        ["Launch delay gap", hacking.gapMs ? `${hacking.gapMs} ms` : "--"],
        ["Successful batch launches", hacking.successfulBatchLaunches ?? hacking.batchCounter ?? "--"],
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
            <Panel title="Prep sweep" right={hacking.prep?.targets ? `${hacking.prep.targets} SERVERS` : "IDLE"} span={4}>
                {hacking.prep?.targets ? (
                    <>
                        <div className="mxRow"><span>servers being prepped</span><span>{hacking.prep.targets}</span></div>
                        <div className="mxRow"><span>threads</span><span>{Math.round(hacking.prep.threads ?? 0).toLocaleString()}</span></div>
                        <div className="mxRow"><span>RAM working</span><span>{ram(hacking.prep.ram)}</span></div>
                        <div className="mxHint" style={{ marginTop: 8 }}>Grow and weaken both pay hacking experience. Each server finished joins the wave.</div>
                    </>
                ) : <div className="mxEmpty">NO SPARE RAM TO SWEEP WITH</div>}
            </Panel>
            <Panel title="Network reserve" right={percent(network.ramPct)} span={4}>
                <div className="mxValue">{ram(network.maxRam ?? 0)}</div>
                <div className="mxMeter"><i style={{ width: `${(network.ramPct ?? 0) * 100}%` }} /></div>
                <div className="mxHint">{network.rooted ?? 0} rooted hosts / {network.discovered ?? 0} discovered</div>
            </Panel>
            <Panel title="Batch telemetry & thread breakdown" right={hacking.utilisation != null ? `${percent(hacking.utilisation)} OF NETWORK` : "LIVE SCHEDULER"} span={12}>
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

// GHOST / native React 17 presentation. No network clients or Netscript calls.
const ghostCss = `
.gx{container-type:inline-size;container-name:matrix-ghost;white-space:normal;--green:#89f4bc;--mint:#89f4bc;--dim:#9aabb9;--ink:#080d13;--red:#ff879b;--amber:#eac28a;--cyan:#81d7ed}
.gx .gx-node{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gx .gx-node span{white-space:normal}.gx .gx-saved{background:#14271f;border-color:#3c5f4d;color:#b2eac9}
.gx{--g-bg:#080d13;--g-panel:#0e1721;--g-line:#24313e;--g-ink:#eef4f7;--g-muted:#9aabb9;--g-mint:#89f4bc;--g-cyan:#81d7ed;--g-amber:#eac28a;color:var(--g-ink);background:var(--g-bg);font:400 14px/1.5 'Segoe UI',Arial,sans-serif;min-height:100%;isolation:isolate;color-scheme:dark}.gx *{box-sizing:border-box}.gx button,.gx select{font:inherit}.gx button{cursor:pointer}.gx button:disabled{opacity:.45;cursor:not-allowed}.gx button:focus-visible,.gx select:focus-visible{outline:2px solid var(--g-cyan);outline-offset:3px}.gx h1,.gx h2,.gx h3,.gx p{margin:0}.gx h2{font-size:18px;font-weight:500;letter-spacing:-.3px}.gx h3{font-size:14px;font-weight:500}.gx-mono{font-family:'Cascadia Code',Consolas,monospace;font-variant-numeric:tabular-nums}.gx-top{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:20px 26px;border-bottom:1px solid var(--g-line);background:#0b121a}.gx-brand{display:flex;align-items:center;gap:13px;min-width:0}.gx-emblem{color:var(--g-mint);width:33px;flex:none}.gx-wordmark{font-size:19px;font-weight:600;letter-spacing:3px;white-space:nowrap}.gx-edition{font:11px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--g-muted);margin-top:2px}.gx-topright{display:flex;gap:20px;align-items:center;font-size:12px;color:var(--g-muted)}.gx-link{color:var(--g-mint);display:flex;align-items:center;gap:8px}.gx-led{width:6px;height:6px;display:inline-block;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor;flex:none}.gx-warn{color:var(--g-amber)!important}.gx-preview{background:#312616;color:#f5d69c;padding:6px 26px;font:12px/1.5 Consolas,monospace;border-bottom:1px solid #5b4729}.gx-body{display:grid;grid-template-columns:184px minmax(0,1fr)}.gx-side{padding:24px 14px;background:#0b121a;border-right:1px solid var(--g-line);display:flex;flex-direction:column;gap:5px}.gx-navlabel{font:10px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--g-muted);padding:0 12px 14px}.gx-nav{display:flex;align-items:center;gap:13px;width:100%;text-align:left;color:var(--g-muted);border:1px solid transparent;background:transparent;border-radius:7px;padding:11px 12px;min-height:43px}.gx-nav:hover{color:var(--g-ink);background:#121f2a}.gx-nav[aria-current=page]{background:#192b2a;color:var(--g-mint);border-color:#2d4640}.gx-navnum{font:11px/1.5 Consolas,monospace;opacity:.75}.gx-sidefoot{margin-top:auto;padding:60px 12px 6px;color:var(--g-muted);font-size:11px;line-height:1.8}.gx-sidefoot b{color:var(--g-cyan);font-weight:500}.gx-main{padding:26px;min-width:0;max-width:1800px;width:100%;margin:0 auto}.gx-intro{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px}.gx-eyebrow{font:11px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--g-mint);margin-bottom:6px}.gx-title{font-size:clamp(26px,3vw,38px);line-height:1.15;font-weight:500;letter-spacing:-1.3px}.gx-sub{color:var(--g-muted);font-size:12px;margin-top:8px}.gx-control{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gx-button{border:1px solid #354653;background:#14212b;color:var(--g-ink);border-radius:6px;padding:8px 12px;min-height:37px;white-space:normal}.gx-button:hover{background:#1d3240;border-color:#678390}.gx-button[aria-pressed=true]{border-color:#608276;color:var(--g-mint);background:#1c332d}.gx-button.gx-primary{background:var(--g-mint);color:#0a2016;border-color:var(--g-mint)}.gx-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:22px;border:1px solid var(--g-line);border-radius:9px;background:linear-gradient(130deg,#121d28,#0c141c)}.gx-stat{padding:18px 20px;min-width:0;border-right:1px solid var(--g-line)}.gx-stat:last-child{border-right:0}.gx-statlabel{color:var(--g-muted);font-size:12px}.gx-statvalue{font:400 clamp(22px,2.3vw,30px)/1.3 'Cascadia Code',Consolas,monospace;letter-spacing:-1px;margin:6px 0;color:var(--g-ink);overflow-wrap:anywhere}.gx-statnote{font-size:11px;color:var(--g-muted)}.gx-layout{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,1fr);gap:18px}.gx-pane{border:1px solid var(--g-line);border-radius:9px;background:var(--g-panel);min-width:0;overflow:hidden}.gx-panehead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px 20px;border-bottom:1px solid var(--g-line)}.gx-caption{font:10px/1.5 Consolas,monospace;letter-spacing:1.4px;color:var(--g-muted)}.gx-panecontent{padding:18px 20px}.gx-orbit{position:relative;min-height:336px;overflow:hidden;background:radial-gradient(ellipse at 50% 52%,#143b354f,transparent 48%),radial-gradient(circle at 50% 50%,transparent 37%,#89f4bc09 37.2%,transparent 37.6%),linear-gradient(#22344228 1px,transparent 1px),linear-gradient(90deg,#22344228 1px,transparent 1px),#0a121a;background-size:auto,auto,32px 32px,32px 32px,auto}.gx-orbit:before{content:'';position:absolute;inset:22px;border:1px solid #30483855;border-radius:50%;transform:scaleX(.95);pointer-events:none}.gx-orbit-svg{position:absolute;inset:0;width:100%;height:100%;color:#365b4d}.gx-core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:172px;height:172px;display:flex;flex-direction:column;justify-content:center;align-items:center;border-radius:50%;background:#0c181c;box-shadow:0 0 65px #69f2ad12,inset 0 0 35px #89f4bc05;z-index:1}.gx-core svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}.gx-corevalue{font:32px/1.2 Consolas,monospace;color:var(--g-mint);letter-spacing:-1px}.gx-corelabel{font:10px/1.5 Consolas,monospace;letter-spacing:2px;color:var(--g-muted);margin-top:6px}.gx-corebottom{font:10px/1.5 Consolas,monospace;color:var(--g-cyan);margin-top:10px}.gx-node{position:absolute;transform:translate(-50%,-50%);padding:7px 10px;color:var(--g-muted);background:#0e1b24;border:1px solid #324452;border-radius:5px;max-width:140px;text-align:left;z-index:2;font:11px/1.4 Consolas,monospace;min-height:39px;overflow-wrap:anywhere}.gx-node:hover,.gx-node[aria-pressed=true]{color:var(--g-mint);border-color:var(--g-mint);background:#132b27;box-shadow:0 0 20px #89f4bc13}.gx-node span{display:block;font:10px/1.4 'Segoe UI',sans-serif;color:var(--g-muted);margin-top:2px}.gx-orbit-empty{position:absolute;bottom:13px;left:12px;right:12px;text-align:center;font-size:12px;color:var(--g-muted)}.gx-orbit-legend{position:absolute;top:12px;left:15px;color:var(--g-muted);font:10px/1.5 Consolas,monospace;letter-spacing:1px}.gx-targetbar{padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;background:#111f29;border-top:1px solid var(--g-line)}.gx-targetname{font:20px/1.4 Consolas,monospace;color:var(--g-ink);overflow-wrap:anywhere}.gx-targetmeta{font-size:11px;color:var(--g-muted);margin-top:3px}.gx-targetbadge{color:var(--g-mint);font:10px/1.5 Consolas,monospace;padding:5px 7px;border:1px solid #365447;border-radius:4px}.gx-mission{display:flex;flex-direction:column;gap:18px}.gx-missiontitle{font-size:22px!important;line-height:1.25;letter-spacing:-.6px!important;color:var(--g-ink)}.gx-missionreason{font-size:13px;color:var(--g-muted);margin:12px 0 18px!important;line-height:1.65}.gx-progresslabel{display:flex;justify-content:space-between;gap:14px;color:var(--g-muted);font-size:11px}.gx-track{height:4px;background:#24313a;border-radius:3px;margin-top:9px;overflow:hidden}.gx-track i{display:block;height:100%;background:var(--g-mint)}.gx-next{margin-top:20px;padding-top:15px;border-top:1px solid var(--g-line);font-size:13px;line-height:1.5}.gx-next small{display:block;font:10px/1.5 Consolas,monospace;color:var(--g-cyan);letter-spacing:1.5px;margin-bottom:6px}.gx-campaign{background:radial-gradient(ellipse at 100% 0,#34453744,transparent 75%),#111a1d;border-color:#374b42}.gx-campaign .gx-panecontent{padding-top:16px}.gx-chapter{display:flex;align-items:center;justify-content:space-between;gap:15px;font:10px/1.5 Consolas,monospace;color:var(--g-mint);letter-spacing:1.5px}.gx-campaign h2{font-size:22px;margin:10px 0 8px;letter-spacing:-.6px}.gx-campaign p{color:var(--g-muted);font-size:12px;line-height:1.65}.gx-route{display:flex;align-items:center;gap:12px;margin-top:17px;font:12px/1.5 Consolas,monospace;color:var(--g-muted)}.gx-route strong{font-weight:400;color:var(--g-ink)}.gx-route i{height:1px;flex:1;background:#405749}.gx-lower{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;margin-top:18px}.gx-chart{height:126px;position:relative}.gx-chart svg{width:100%;height:100%;display:block}.gx-chartlabels{display:flex;justify-content:space-between;gap:10px;font:10px/1.5 Consolas,monospace;color:var(--g-muted);margin-top:8px}.gx-empty{padding:22px 6px;color:var(--g-muted);font-size:13px;text-align:center}.gx-actions{display:grid;gap:13px}.gx-action{display:grid;grid-template-columns:22px 1fr;gap:10px;font-size:12px;line-height:1.5}.gx-action b{display:block;font-size:13px;font-weight:500;color:var(--g-ink);margin-bottom:3px}.gx-action span{color:var(--g-muted)}.gx-actionicon{font:12px/1.5 Consolas,monospace;color:var(--g-amber);padding-top:2px}.gx-code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--g-cyan);background:#09131b;padding:9px 11px;margin-top:8px;border-left:2px solid #41646e;font:11px/1.6 Consolas,monospace;user-select:all}.gx-bottom{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;color:var(--g-muted);font:10px/1.5 Consolas,monospace;letter-spacing:.7px;margin-top:20px}.gx-notice{padding:12px 15px;margin-bottom:18px;background:#251e15;border:1px solid #594833;border-radius:6px;color:var(--g-amber);font-size:12px}.gx-servicegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px}.gx-service{padding:17px;border:1px solid var(--g-line);border-radius:8px;background:var(--g-panel)}.gx-servicehead{display:flex;align-items:center;gap:9px;margin-bottom:8px}.gx-servicehead h3{font-family:Consolas,monospace}.gx-service p{font-size:12px;color:var(--g-muted);overflow-wrap:anywhere}.gx-service-state{margin-left:auto;font-size:11px;color:var(--g-muted)}.gx-targets{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,.85fr);gap:18px}.gx-targetlist{display:flex;flex-direction:column;gap:7px;padding:12px;max-height:700px;overflow:auto}.gx-targetrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;text-align:left;border:1px solid transparent;background:#101c27;color:var(--g-ink);padding:13px;border-radius:6px}.gx-targetrow[aria-pressed=true]{background:#182d29;border-color:#49715c}.gx-targetrow small{display:block;color:var(--g-muted);font-size:11px;margin-top:4px}.gx-details{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px}.gx-details dt{font-size:11px;color:var(--g-muted);margin-bottom:5px}.gx-details dd{margin:0;font:15px/1.5 Consolas,monospace;overflow-wrap:anywhere}.gx-eventlist{padding:0 20px}.gx-eventrow{display:grid;grid-template-columns:65px 100px minmax(0,1fr);gap:14px;padding:13px 0;border-bottom:1px solid var(--g-line);font-size:12px;overflow-wrap:anywhere}.gx-eventrow:last-child{border:0}.gx-eventrow time{font:10px/1.6 Consolas,monospace;color:var(--g-muted)}.gx-eventrow b{font:10px/1.7 Consolas,monospace;color:var(--g-cyan)}.gx-filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:17px}.gx-campaignfull{max-width:850px;margin:0 auto;padding:38px;background:radial-gradient(ellipse at 85% 10%,#2045396b,transparent 60%),#10191f}.gx-campaignfull h2{font-size:clamp(30px,5vw,57px);line-height:1.08;letter-spacing:-2px;margin:15px 0 22px;font-weight:500}.gx-campaignfull p{max-width:570px;color:var(--g-muted);line-height:1.8;font-size:14px}.gx-campaignfull .gx-route{margin:30px 0;max-width:430px}.gx-settingsrow{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:15px 0;border-bottom:1px solid var(--g-line)}.gx-settingsrow p{color:var(--g-muted);font-size:12px;line-height:1.6;max-width:650px}.gx .mxGrid{margin-top:0}.gx .mxPanel{background:var(--g-panel);border-color:var(--g-line);border-radius:9px;box-shadow:none;color:var(--g-ink)}.gx .mxPanel:before,.gx .mxPanel:after,.gx .mxRadar{display:none}.gx .mxPanelTitle,.gx .mxHint,.gx .mxEmpty{color:var(--g-muted);font-size:12px;letter-spacing:0}.gx .mxRow{font-size:13px;border-color:var(--g-line)}.gx .mxValue{color:var(--g-ink);text-shadow:none}.gx .mxTable{font-size:12px}.gx .mxTable th{font-size:11px}.gx .mxBtn{border-radius:5px;font-size:12px;letter-spacing:0}.gx .mxWireBody b{font-size:13px}.gx .mxWireBody em{font-size:12px}.gx .mxCmd{font-size:12px}.gx .mxVoice{font-size:12px}.gx .mxTargetName{font-size:36px;text-shadow:none}.gx .mxServiceStatus{font-size:11px}.gx .mxBadge{font-size:11px}.gx-motion .gx-core{animation:gx-breathe 7s ease-in-out infinite}@keyframes gx-breathe{50%{box-shadow:0 0 75px #69f2ad28,inset 0 0 35px #89f4bc12}}
@media(prefers-reduced-motion:reduce){.gx *{animation:none!important;transition:none!important}}
@container matrix-ghost (max-width:1150px){.gx-body{grid-template-columns:154px minmax(0,1fr)}.gx-main{padding:20px}.gx-side{padding:20px 9px}.gx-layout{grid-template-columns:minmax(0,1.25fr) minmax(250px,1fr)}.gx-stat{padding:16px 13px}.gx-node{max-width:112px;font-size:10px}.gx-core{width:145px;height:145px}.gx-corevalue{font-size:27px}.gx-topright{gap:12px}.gx-intro{align-items:flex-start;flex-wrap:wrap}}
@container matrix-ghost (max-width:920px){.gx-body{grid-template-columns:1fr}.gx-side{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--g-line);padding:9px 14px;gap:5px}.gx-nav{width:auto;padding:8px 11px;gap:7px;min-height:36px;font-size:12px}.gx-navlabel,.gx-sidefoot{display:none}.gx-top{padding:17px 20px}.gx-topright .gx-build{display:none}.gx-layout{grid-template-columns:minmax(0,1.3fr) minmax(250px,1fr)}.gx-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.gx-stat:nth-child(2){border-right:0}.gx-stat:nth-child(-n+2){border-bottom:1px solid var(--g-line)}.gx-targets{grid-template-columns:1fr}}
@container matrix-ghost (max-width:690px){.gx-main{padding:15px}.gx-layout,.gx-lower{grid-template-columns:1fr}.gx-core{width:165px;height:165px}.gx-orbit{min-height:330px}.gx-node{max-width:120px}.gx-top{flex-wrap:wrap;gap:12px;padding:15px}.gx-wordmark{font-size:17px}.gx-title{font-size:29px}.gx-eventrow{grid-template-columns:57px minmax(0,1fr);gap:7px}.gx-eventrow>span{grid-column:1/-1}.gx-campaignfull{padding:23px}.gx-settingsrow{align-items:flex-start}.gx-navnum{display:none}}
@container matrix-ghost (max-width:400px){.gx-node{max-width:85px;padding:6px;font-size:10px}.gx-core{width:125px;height:125px}.gx-corevalue{font-size:23px}.gx-corebottom{font-size:9px}.gx-corelabel{font-size:9px}.gx-orbit{min-height:330px}.gx-orbit-legend{font-size:9px}.gx-targetbar{flex-wrap:wrap}.gx-statvalue{font-size:22px}.gx-stat{padding:13px}.gx-panehead,.gx-panecontent{padding:15px}.gx-caption{font-size:9px}.gx-topright{flex-wrap:wrap}.gx-servicegrid{grid-template-columns:minmax(0,1fr)}}
`;

function ghostNumber(value) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function ghostText(value, fallback = "—") { return typeof value === "string" || typeof value === "number" && Number.isFinite(value) ? String(value) : fallback; }
function ghostArray(value) { return Array.isArray(value) ? value.filter(v => v && typeof v === "object" && !Array.isArray(v)) : []; }
function ghostFresh(time, now = Date.now()) { return typeof time === "number" && time > 0 && now - time < 15000 && time - now < 5000; }
function ghostTargets(data) {
    const h = data?.services?.hacking ?? {};
    const seen = new Set();
    return ghostArray(h.targetScheduler ?? h.targets).map(t => ({ ...t, target: ghostText(t.target ?? t.host, "") })).filter(t => t.target && !seen.has(t.target) && seen.add(t.target)).slice(0, 128);
}
function ghostRatio(value) { const n = ghostNumber(value); return n === null ? "—" : `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`; }
function ghostService(value) {
    if (!value || typeof value !== "object") return { label: "Sans données", tone: "muted", reason: "Aucun état reçu. Accès et démarrage non déterminés." };
    if (!ghostFresh(value.updated)) return { label: "Ancien", tone: "amber", reason: `Dernier état : ${ghostText(value.status, "non renseigné")}. Actualité non confirmée.` };
    const status = ghostText(value.status, "non renseigné");
    return { label: status, tone: /error|fail|paused|unavailable|locked/.test(status) ? "amber" : "mint", reason: ghostText(value.error ?? value.reason ?? value.phase, "État déclaré par le service ; un heartbeat ne prouve pas le progrès.") };
}
function GhostMark() { return <svg className="gx-emblem" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M3 28V8l15 16L33 8v20M3 8l15 8L33 8M18 24v8" stroke="currentColor" strokeWidth="2" /></svg>; }
function GhostStat({ label, value, note }) { return <div className="gx-stat"><div className="gx-statlabel">{label}</div><div className="gx-statvalue">{value}</div><div className="gx-statnote">{note}</div></div>; }
function GhostPane({ title, tag, children, className = "" }) { return <section className={`gx-pane ${className}`}><div className="gx-panehead"><h2>{title}</h2><span className="gx-caption">{tag}</span></div>{children}</section>; }
function GhostOrbit({ data, targets, selected, choose }) {
    const ratio = ghostNumber(data.network?.ramPct);
    const positions = [[22,23],[78,23],[18,53],[82,53],[25,81],[75,81]];
    return <div className="gx-orbit">
        <div className="gx-orbit-legend">CIBLES · VUE SCHÉMATIQUE</div>
        <svg className="gx-orbit-svg" viewBox="0 0 600 336" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="300" cy="168" rx="230" ry="130" fill="none" stroke="currentColor" strokeDasharray="2 8" opacity=".7" />{targets.slice(0,6).map((t,i) => <path key={t.target} d={`M300 168 L${positions[i][0]*6} ${positions[i][1]*3.36}`} stroke={t.target===selected?.target?"#89f4bc":"#2f4a43"} strokeWidth="1" fill="none" />)}</svg>
        <div className="gx-core" role="img" aria-label={`RAM utilisée sur le réseau : ${ghostRatio(ratio)}`}><svg viewBox="0 0 172 172" aria-hidden="true"><circle cx="86" cy="86" r="81" fill="none" stroke="#2b3b40" strokeWidth="2" /><circle cx="86" cy="86" r="81" fill="none" stroke="#89f4bc" strokeWidth="2.5" strokeDasharray={`${Math.max(0,Math.min(1,ratio ?? 0))*509} 509`} strokeLinecap="round" /><circle cx="86" cy="86" r="69" fill="none" stroke="#25413b" strokeWidth="1" strokeDasharray="1 7" /></svg><div className="gx-corevalue">{ghostRatio(ratio)}</div><div className="gx-corelabel">RAM RÉSEAU</div><div className="gx-corebottom">{ghostText(data.network?.rooted)} HÔTES ROOTÉS</div></div>
        {targets.slice(0,6).map((t,i) => <button type="button" key={t.target} className="gx-node" style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`}} aria-pressed={selected?.target===t.target} onClick={()=>choose(t.target)}>{t.target}<span>{ghostText(t.state,"état inconnu")} · {ghostText(t.activeBatches ?? t.batches)} lots</span></button>)}
        {!targets.length && <div className="gx-orbit-empty">En attente de la liste des cibles du scheduler.</div>}
    </div>;
}
function GhostCapital({ history }) {
    const samples = ghostArray(history).filter(x=>ghostNumber(x.money)!==null && ghostNumber(x.t)!==null);
    if (samples.length < 2) return <div className="gx-empty">Le graphique se construit avec les observations reçues.<br/>Aucun historique inventé.</div>;
    const low=Math.min(...samples.map(x=>x.money)),high=Math.max(...samples.map(x=>x.money)),range=Math.max(1,high-low),elapsed=Math.max(1,samples.at(-1).t-samples[0].t);
    const points=samples.map(x=>`${8+(x.t-samples[0].t)/elapsed*484},${102-(x.money-low)/range*82}`).join(" ");
    return <div className="gx-panecontent"><div className="gx-chart" role="img" aria-label={`Capital sur ${Math.round(elapsed/1000)} secondes, minimum ${money(low)}, maximum ${money(high)}.`}><svg viewBox="0 0 500 120" preserveAspectRatio="none" aria-hidden="true"><path d="M8 20H492 M8 61H492 M8 102H492" stroke="#25343d" strokeWidth="1" fill="none" /><polygon points={`8,112 ${points} 492,112`} fill="#89f4bc0d" /><polyline points={points} stroke="#89f4bc" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" /></svg></div><div className="gx-chartlabels"><span>MIN {money(low)} · MAX {money(high)}</span><span>{Math.round(elapsed/1000)} S OBSERVÉES</span></div></div>;
}
function GhostActions({ data, limit=3 }) {
    const actions=[...ghostArray(data.manual),...ghostArray(data.directives).filter(x=>x.ready || x.urgent)];
    const unique=actions.filter((x,i)=>actions.findIndex(y=>(y.id ?? y.label)===(x.id ?? x.label))===i).slice(0,limit);
    return <div className="gx-panecontent gx-actions">{unique.length?unique.map((a,i)=><div className="gx-action" key={a.id ?? i}><div className="gx-actionicon">{String(i+1).padStart(2,"0")}</div><div><b>{ghostText(a.label,"Instruction à examiner")}</b><span>{ghostText(a.detail ?? a.where ?? a.short,"Consulter la progression pour les prérequis.")}</span>{typeof a.command==="string" && <code className="gx-code">{a.command}</code>}</div></div>):<div className="gx-empty">Aucune instruction publiée.<br/>Cela ne prouve pas une autonomie complète.</div>}</div>;
}
function GhostCampaign({ data, full=false }) {
    const bn=data.reset?.currentNode;
    return <section className={`gx-pane gx-campaign ${full?"gx-campaignfull":""}`}><div className="gx-panecontent"><div className="gx-chapter"><span>THE GHOST NODE WAR</span><span>EN ATTENTE</span></div><h2>{full?<>De l’autre côté<br/>du signal.</>:"De l’autre côté du signal."}</h2><p>{bn===1?"BN1 est observé. La campagne attend la traversée réelle vers BN4.":bn===4?"BN4 est observé. Le moteur de campagne n’est pas encore connecté ; aucune scène n’est déclarée jouée.":"Le contexte de campagne reste à confirmer. Le BitNode observé ne suffit pas à reconstituer l’histoire."}</p><div className="gx-route"><strong>BN1</strong><i/><span>TRAVERSÉE</span><i/><strong>BN4</strong></div>{full && <><p>Le GPT personnalisé incarnera MATRIX dans ChatGPT. Ce panneau est réservé aux scènes autorisées et aux faits vérifiés ; il ne synchronise pas encore la conversation.</p><div className="gx-next"><small>STATUT DU MODULE</small>Préparation visuelle disponible. Aucun choix, reset ou événement RP déclenché par cette interface.</div></>}</div></section>;
}
function GhostOverview({ data, history, selected, targets, choose, navigate }) {
    const coord=data.services?.coordinator ?? {},h=data.services?.hacking ?? {},n=data.network ?? {};
    const milestone=coord.milestone,progress=ghostNumber(milestone?.pct);
    return <>
        <div className="gx-stats"><GhostStat label="Capital disponible" value={money(ghostNumber(data.player?.money))} note={`Hacking cumulé : ${money(ghostNumber(data.income?.hacking))}`} /><GhostStat label="Mémoire du réseau" value={ram(ghostNumber(n.usedRam))} note={`${ram(ghostNumber(n.maxRam))} au total · hôtes rootés`} /><GhostStat label="Lots HWGW en vol" value={ghostText(h.activeBatches ?? h.batches)} note={`${ghostText(h.readyTargets)} cibles prêtes · ${ghostText(h.preppingTargets)} en préparation`} /><GhostStat label="Compétence hacking" value={ghostText(data.player?.skills?.hacking)} note={`${ghostText(data.player?.city,"Ville inconnue")} · BN${ghostText(data.reset?.currentNode,"?")}`} /></div>
        <div className="gx-layout"><GhostPane title="Constellation d’opérations" tag={`${targets.length} CIBLES PUBLIÉES`}><GhostOrbit data={data} targets={targets} selected={selected} choose={choose}/><div className="gx-targetbar"><div><div className="gx-caption">CIBLE INSPECTÉE</div><div className="gx-targetname">{selected?.target ?? ghostText(h.target,"En attente")}</div><div className="gx-targetmeta">{selected?`Capital cible ${ghostRatio(selected.liveMoneyFraction)} · ${ghostText(selected.activeBatches ?? selected.batches)} lots actifs`:"Les détails apparaîtront à réception du scheduler."}</div></div><button type="button" className="gx-button" onClick={()=>navigate("NETWORK")}>Inspecter →</button></div></GhostPane>
        <div className="gx-mission"><GhostPane title="Directive principale" tag="COORDINATEUR"><div className="gx-panecontent"><h3 className="gx-missiontitle">{ghostText(coord.title,"Établir le signal.")}</h3><p className="gx-missionreason">{ghostText(coord.reason,"Le coordinateur n’a pas encore publié d’objectif. Les données du jeu restent la référence.")}</p>{milestone && <><div className="gx-progresslabel"><span>{ghostText(milestone.name,"Jalon publié")}</span><span>{progress===null?"—":`${meter(progress).toFixed(1)}%`}</span></div><div className="gx-track"><i style={{width:`${meter(progress)}%`}}/></div></>}<div className="gx-next"><small>PROCHAINE ÉTAPE</small>{ghostText(coord.nextStep,"En attente d’une directive vérifiable.")}</div></div></GhostPane><GhostCampaign data={data}/></div></div>
        <div className="gx-lower"><GhostPane title="Trace du capital" tag="SESSION DU DASHBOARD"><GhostCapital history={history}/></GhostPane><GhostPane title="À toi de jouer" tag="INSTRUCTIONS PUBLIÉES"><GhostActions data={data}/></GhostPane></div>
    </>;
}
function GhostNetwork({ data, targets, selected, choose }) {
    const details=[["État",selected?.state],["Lots actifs",selected?.activeBatches ?? selected?.batches],["Profondeur pipeline",selected?.pipelineDepth],["RAM par lot",ram(ghostNumber(selected?.planningBatchRam))],["Capital cible",ghostRatio(selected?.liveMoneyFraction)],["Excès de sécurité",ghostNumber(selected?.liveSecurityExcess)?.toFixed(3)],["Extraction planifiée",ghostRatio(selected?.planningRequestedHackFraction)],["Temps weaken",ghostNumber(selected?.liveWeakenTime)===null?"—":`${(selected.liveWeakenTime/1000).toFixed(1)} s`]];
    return <><div className="gx-targets"><GhostPane title="Cibles du scheduler" tag={`${targets.length} PUBLIÉES`}><div className="gx-targetlist">{targets.length?targets.map(t=><button type="button" key={t.target} className="gx-targetrow" aria-pressed={selected?.target===t.target} onClick={()=>choose(t.target)}><div><span className="gx-mono">{t.target}</span><small>{ghostText(t.state,"état non renseigné")} · capital {ghostRatio(t.liveMoneyFraction)}</small></div><span className="gx-targetbadge">{ghostText(t.activeBatches ?? t.batches)} LOTS</span></button>):<div className="gx-empty">Aucune liste reçue. Le réseau n’est pas supposé vide.</div>}</div></GhostPane><GhostPane title={selected?.target ?? "Inspection"} tag="LECTURE SEULE"><dl className="gx-details">{details.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{ghostText(value)}</dd></div>)}</dl><div className="gx-panecontent"><p className="gx-sub">{selected?.snapshotStale?`Plan marqué ancien : ${ghostText(selected.snapshotStaleReason)}.`:"Valeurs publiées par le scheduler. Les traits de la constellation ne représentent pas des routes de connexion."}</p></div></GhostPane></div>{data.services?.hacking?.targetTelemetryTruncated && <p className="gx-sub">La télémétrie source est tronquée. Cette liste ne représente pas toutes les cibles du jeu.</p>}<div className="gx-lower"><GhostPane title="Répartition des ressources" tag="SCHEDULER"><dl className="gx-details">{[["HWGW en vol",data.services?.hacking?.inflightHwgwRam],["Préparation",data.services?.hacking?.prepRam],["Réserve intentionnelle",data.services?.hacking?.intentionallyReservedRam],["RAM inactive utilisable",data.services?.hacking?.usableIdleRam]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{ram(ghostNumber(v))}</dd></div>)}</dl></GhostPane><GhostPane title="Lecture du réseau" tag="PÉRIMÈTRE"><div className="gx-panecontent"><p className="gx-sub">{ghostText(data.network?.rooted)} hôtes rootés sur {ghostText(data.network?.discovered)} découverts. La mémoire affichée couvre les hôtes rootés, y compris Home ; elle n’est pas toute nécessairement allouable.</p></div></GhostPane></div></>;
}
function GhostServices({ data }) {
    const services=data.services ?? {},names=[...new Set([...SERVICE_ORDER,...Object.keys(services)])];
    return <div className="gx-servicegrid">{names.map(name=>{const s=ghostService(services[name]);return <section className="gx-service" key={name}><div className="gx-servicehead"><i className="gx-led" style={{color:`var(--g-${s.tone})`}}/><h3>{name}</h3></div><div className="gx-caption" style={{color:`var(--g-${s.tone})`,marginBottom:9}}>{s.label}</div><p>{s.reason}</p><p style={{marginTop:10}}>État reçu : {age(services[name]?.updated)}</p></section>;})}</div>;
}
function GhostJournal({ data, commands, filter, setFilter }) {
    const entries=[...ghostArray(commands).map(c=>({t:c.t,service:"commande",level:c.status,message:c.message})),...ghostArray(data.events)].filter(e=>filter==="all" || filter==="commands"&&e.service==="commande" || filter==="errors"&&/error|failed|conflict|warn/.test(String(e.level))).sort((a,b)=>(b.t ?? 0)-(a.t ?? 0)).slice(0,120);
    return <><div className="gx-filters">{[["all","Tout"],["commands","Commandes"],["errors","À examiner"]].map(([k,label])=><button type="button" key={k} className="gx-button" aria-pressed={filter===k} onClick={()=>setFilter(k)}>{label}</button>)}</div><GhostPane title="Journal d’opérations" tag="120 ÉVÉNEMENTS MAX."><div className="gx-eventlist">{entries.length?entries.map((e,i)=><div className="gx-eventrow" key={`${e.t}-${i}`}><time>{ghostNumber(e.t)!==null?new Date(e.t).toLocaleTimeString("fr-CA",{hour12:false}):"—"}</time><b className={/error|failed|conflict|warn/.test(String(e.level))?"gx-warn":""}>{ghostText(e.service,"système")}</b><span>{ghostText(e.message,"Événement sans message.")}</span></div>):<div className="gx-empty">Aucun événement pour cette vue.</div>}</div></GhostPane></>;
}
function GhostSettings({ config, motion, setMotion }) {
    return <GhostPane title="Autorité & présentation" tag="CONFIGURATION"><div className="gx-panecontent"><div className="gx-settingsrow"><div><h3>Ambiance lumineuse</h3><p>Respiration lente du noyau. Arrêtée si les animations sont réduites dans le système.</p></div><button type="button" className="gx-button" aria-pressed={motion} onClick={()=>setMotion(!motion)}>{motion?"Activée":"Désactivée"}</button></div><div className="gx-settingsrow"><div><h3>Autorisation de l’autopilot</h3><p>Modifie la configuration existante. Les managers la lisent à leur prochain cycle. Les workers et activités persistantes peuvent continuer : ce bouton n’est pas un arrêt d’urgence.</p></div><Toggle config={config} path="masterEnabled" label="AUTOPILOT"/></div>{Object.keys(config.automation ?? {}).map(key=><div className="gx-settingsrow" key={key}><div><h3>{key}</h3><p>Autorisation du module ; l’état observé est disponible dans Services.</p></div><Toggle config={config} path={`automation.${key}`} label={key}/></div>)}</div></GhostPane>;
}
function App() {
    const rootRef = React.useRef(null);
    React.useEffect(() => {
        // Change only the log surface containing THIS React root. Bitburner
        // reverses its logs by default, which otherwise opens a tall dashboard
        // at the bottom. Refs avoid global DOM lookup and its RAM surcharge.
        let wrapper = rootRef.current?.parentElement;
        for (let depth = 0; wrapper && depth < 4; depth++, wrapper = wrapper.parentElement) {
            if (wrapper.style.flexDirection === "column" && wrapper.parentElement?.style.display === "flex") break;
        }
        const surface = wrapper?.parentElement;
        if (wrapper?.style.flexDirection !== "column" || surface?.style.display !== "flex") return;
        const previous = surface.style.flexDirection;
        surface.style.flexDirection = "column";
        surface.scrollTop = 0;
        return () => { surface.style.flexDirection = previous; };
    }, []);
    const snapshot=useStore(),data=snapshot.data ?? {},config=snapshot.config ?? {};
    const [tab,setTab]=React.useState("OVERVIEW"),[selectedHost,setSelectedHost]=React.useState(null),[motion,setMotion]=React.useState(false),[filter,setFilter]=React.useState("all");
    const tabs=[["OVERVIEW","Passerelle"],["NETWORK","Réseau"],["SERVICES","Services"],["HACKING","Hacking"],["ECONOMY","Économie"],["PROGRESS","Progression"],["CAMPAIGN","Campagne"],["JOURNAL","Journal"],["SETTINGS","Réglages"]];
    const targets=ghostTargets(data),selected=targets.find(t=>t.target===selectedHost) ?? targets.find(t=>t.target===data.services?.hacking?.target) ?? targets[0];
    const fresh=ghostFresh(data.updated),latest=ghostArray(snapshot.commandLog).at(-1);
    const title={OVERVIEW:"Le signal est à toi.",NETWORK:"Chaque cible. Chaque ressource.",SERVICES:"Une flotte sous observation.",HACKING:"La mécanique du revenu.",ECONOMY:"La puissance a un coût.",PROGRESS:"La prochaine frontière.",CAMPAIGN:"Une histoire à ouvrir.",JOURNAL:"Rien ne disparaît sans trace.",SETTINGS:"Tes règles. Ton système."}[tab] ?? "Passerelle";
    let content;
    if(tab==="NETWORK")content=<GhostNetwork data={data} targets={targets} selected={selected} choose={setSelectedHost}/>;
    else if(tab==="SERVICES")content=<GhostServices data={data}/>;
    else if(tab==="HACKING")content=<Hacking data={data}/>;
    else if(tab==="ECONOMY")content=<Economy data={data}/>;
    else if(tab==="PROGRESS")content=<Progress data={data}/>;
    else if(tab==="CAMPAIGN")content=<GhostCampaign data={data} full/>;
    else if(tab==="JOURNAL")content=<GhostJournal data={data} commands={snapshot.commandLog} filter={filter} setFilter={setFilter}/>;
    else if(tab==="SETTINGS")content=<GhostSettings config={config} motion={motion} setMotion={setMotion}/>;
    else content=<GhostOverview data={data} history={snapshot.history} targets={targets} selected={selected} choose={setSelectedHost} navigate={setTab}/>;
    return <div className={`gx ${motion?"gx-motion":""}`} lang="fr" ref={rootRef}><style>{css}{ghostCss}</style>{data.preview && <div className="gx-preview">{data.preview === "engine" ? "ESSAI NATIF BITBURNER 3.0.1 · PARTIE ISOLÉE · TÉLÉMÉTRIE SYNTHÉTIQUE" : "APERÇU DU VRAI COMPOSANT · DONNÉES SIMULÉES · AUCUNE CONNEXION AU JEU"}</div>}<header className="gx-top"><div className="gx-brand"><GhostMark/><div><div className="gx-wordmark">MATRIX OS</div><div className="gx-edition">GHOST / COMMAND DECK</div></div></div><div className="gx-topright"><span className="gx-build">BITBURNER {ghostText(data.game?.version,"VERSION INCONNUE")}</span><span className={`gx-link ${fresh?"":"gx-warn"}`}><i className="gx-led"/>{fresh?"Télémétrie récente":data.updated?"Télémétrie ancienne":"En attente du signal"}</span><span className="gx-mono">BN{ghostText(data.reset?.currentNode,"?")}</span></div></header><div className="gx-body"><nav className="gx-side" aria-label="Navigation principale"><div className="gx-navlabel">CONTRÔLE DU SYSTÈME</div>{tabs.map(([key,label],i)=><button type="button" className="gx-nav" key={key} aria-current={tab===key?"page":undefined} onClick={()=>setTab(key)}><span className="gx-navnum">{String(i+1).padStart(2,"0")}</span>{label}</button>)}<div className="gx-sidefoot"><b>LOCAL FIRST.</b><br/>Le moteur reste dans le jeu.<br/>Le récit attend les faits.<br/><br/>GHOST EDITION / 01</div></nav><main className="gx-main"><div className="gx-intro"><div><div className="gx-eyebrow">MATRIX // {tabs.find(t=>t[0]===tab)?.[1]?.toUpperCase() ?? "PASSERELLE"}</div><h1 className="gx-title">{title}</h1><div className="gx-sub">{config.masterEnabled===false?"Automatisation désactivée dans la configuration · arrêt des activités non garanti":"Observer. Comprendre. Décider."}</div></div><div className="gx-control"><button type="button" className="gx-button" onClick={()=>setTab("JOURNAL")}>Journal ↗</button><button type="button" className="gx-button" onClick={()=>setTab("SETTINGS")}>Contrôles</button></div></div>{!fresh && <div className="gx-notice">{data.updated?`Dernière observation : ${age(data.updated)}. Les valeurs ci-dessous ne sont pas confirmées actuelles.`:"Aucune télémétrie récente. Attente du bootstrap ou du service telemetry."} Les changements de configuration sont désactivés.</div>}{latest && <div className={`gx-notice ${latest.status==="saved"?"gx-saved":""}`} role="status">{latest.message}</div>}{content}<footer className="gx-bottom"><span>{fresh?"OBSERVATION RÉCENTE":"OBSERVATION NON CONFIRMÉE"} · {age(data.updated)}</span><span>REACT NATIF / NETSCRIPT ISOLÉ</span></footer></main></div></div>;
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
    let data = {}, settings = null;
    try { data = state(ns) ?? {}; } catch {}
    try { settings = readJson(ns, CONFIG, null); } catch {}
    const configReady = Boolean(settings && typeof settings === "object" && !Array.isArray(settings));
    const epoch = `${data.reset?.currentNode ?? "?"}:${data.reset?.lastAugReset ?? "?"}:${data.reset?.lastNodeReset ?? "?"}`;
    if (epoch !== store.historyEpoch) { store.history = []; store.historyEpoch = epoch; }
    if (ghostFresh(data.updated) && ghostNumber(data.player?.money) !== null) {
        const last = store.history.at(-1);
        if (last && (data.updated < last.t || data.updated - last.t > 15000)) store.history = [];
        if (!store.history.length || data.updated - store.history.at(-1).t >= 1000) {
            store.history = [...store.history, { t: data.updated, money: data.player.money }].slice(-90);
        }
    }
    store.publish({ data, config: configReady ? settings : {}, configReady, history: store.history, commandLog: store.commandLog });
}

// Config toggles are queued by the UI and applied here, never in the handler.
async function applyCommands(ns) {
    for (const command of store.drain()) {
        let status = "failed", message;
        try {
            if (command?.type !== "patch" || typeof command.value !== "boolean") throw new Error("Commande non prise en charge.");
            const allowed = command.path === "masterEnabled" || /^automation\.[a-z][a-zA-Z0-9]*$/.test(command.path ?? "") && !/constructor|prototype/i.test(command.path);
            if (!allowed) throw new Error("Clé de configuration interdite.");
            const observed = state(ns);
            if (!ghostFresh(observed?.updated)) throw new Error("Télémétrie ancienne ; modification refusée.");
            const settings = readJson(ns, CONFIG, null);
            if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Configuration illisible ; fichier conservé.");
            const parts = command.path.split("."), key = parts.at(-1);
            const owner = parts.length === 1 ? settings : settings.automation;
            if (!owner || typeof owner !== "object" || Array.isArray(owner) || !Object.hasOwn(owner, key)) throw new Error("Option absente de la configuration actuelle.");
            if (owner[key] !== command.expected) { status = "conflict"; throw new Error("Option modifiée entre-temps ; actualiser avant de réessayer."); }
            owner[key] = command.value;
            const result = await ns.write(CONFIG, JSON.stringify(settings, null, 2), "w");
            if (result === false) throw new Error("Écriture refusée.");
            const check = readJson(ns, CONFIG, null);
            const actual = parts.length === 1 ? check?.[key] : check?.automation?.[key];
            if (actual !== command.value) throw new Error("Écriture non confirmée à la relecture.");
            status = "saved";
            message = `${command.path} = ${command.value ? "ON" : "OFF"} enregistré. L’état des activités doit être vérifié dans Services.`;
        } catch (error) { message = `Modification non confirmée : ${String(error?.message ?? error)}`; }
        store.commandLog = [...store.commandLog, { t: Date.now(), id: command?.id, status, message }].slice(-40);
    }
}

function refreshMs(settings) {
    const value = Number(settings?.ui?.refreshMs);
    return Math.max(350, Number.isFinite(value) && value > 0 ? value : 750);
}

// Pure presentation exports used by the standalone preview and regression tests.
export { App, store, ghostTargets, ghostFresh, ghostService, publish, applyCommands };

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
    try { ns.ui.setTailTitle("MATRIX OS // GHOST COMMAND DECK"); } catch {}
    ns.ui.openTail();
    await writeLease(ns, "alive", 0);
    ns.tprint(`MATRIX-OS // COMMAND DECK ONLINE (pid ${ns.pid})`);
    // Re-assert ownership rather than trusting the one check at startup, and
    // leave a heartbeat so a deck that dies is diagnosable rather than silent.
    let placed = false;
    let ticks = 0;
    let lastBeat = 0;
    while (true) {
        // Never wrap ns.sleep: catching it would swallow the game's own
        // termination signal when the script is killed.
        await ns.sleep(refreshMs(store.snapshot.config));
        // Tail properties exist only after React has mounted the log surface.
        if (!placed) {
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
            placed = true;
        }
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
