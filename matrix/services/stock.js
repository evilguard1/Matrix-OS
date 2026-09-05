import { config, managerBudget, writeState, event, getCoordinatorState, getDirectives } from "/matrix/lib/common.js";
import { spendMoney } from "/matrix/lib/budget-ledger.js";
import { stateEnvelope } from "/matrix/lib/state.js";

/** Positions and sale proceeds are observable with TIX, independently of 4S. */
export function portfolio(ns) {
    const holdings = [];
    let positions = 0, liquidationValue = 0, unrealized = 0;
    for (const sym of ns.stock.getSymbols()) {
        const [longShares, longPrice, shortShares, shortPrice] = ns.stock.getPosition(sym);
        const bid = ns.stock.getBidPrice(sym), ask = ns.stock.getAskPrice(sym);
        if (longShares > 0) {
            positions++;
            liquidationValue += ns.stock.getSaleGain(sym, longShares, "Long");
            unrealized += longShares * (bid - longPrice);
        }
        if (shortShares > 0) {
            positions++;
            liquidationValue += ns.stock.getSaleGain(sym, shortShares, "Short");
            unrealized += shortShares * (shortPrice - ask);
        }
        holdings.push({ sym, longShares, longPrice, shortShares, shortPrice, bid, ask });
    }
    return { positions, liquidationValue, exposure: Math.max(0, liquidationValue), unrealized, holdings };
}

export function liquidatePortfolio(ns) {
    const before = portfolio(ns), errors = [];
    for (const x of before.holdings) {
        for (const type of ["Long", "Short"]) {
            const shares = type === "Long" ? x.longShares : x.shortShares;
            if (!shares) continue;
            try {
                if (type === "Long") ns.stock.sellStock(x.sym, shares);
                else ns.stock.sellShort(x.sym, shares);
            } catch (error) { errors.push({ symbol: x.sym, type, error: String(error) }); }
        }
    }
    // A refused sale must remain visible. Never manufacture a zero portfolio.
    const after = portfolio(ns);
    return { ...after, closedPositions: Math.max(0, before.positions - after.positions), errors };
}

function sharesWithin(ns, sym, type, budget, price) {
    let lo = 0, hi = Math.min(ns.stock.getMaxShares(sym), Math.floor(budget / price));
    for (let i = 0; i < 60 && lo < hi; i++) {
        const n = Math.ceil((lo + hi) / 2);
        if (ns.stock.getPurchaseCost(sym, n, type) <= budget) lo = n;
        else hi = n - 1;
    }
    return lo;
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.stock === false) {
            await writeState(ns, "stock", { status: "paused" });
            await ns.sleep(5000); continue;
        }
        try {
            const coord = getCoordinatorState(ns);
            const directive = getDirectives(ns)?.directives?.stock;
            const liquidate = Boolean(coord?.liquidateStocks) || directive === "liquidate";
            const hold = directive === "hold";
            const constants = ns.stock.getConstants();
            if (!liquidate) {
                if (!ns.stock.hasWseAccount()) spendMoney(ns, { owner: "stock", target: "WSE",
                    quote: () => constants.WseAccountCost, execute: () => ns.stock.purchaseWseAccount() });
                if (ns.stock.hasWseAccount() && !ns.stock.hasTixApiAccess()) spendMoney(ns, { owner: "stock", target: "TIX",
                    quote: () => constants.TixApiCost, execute: () => ns.stock.purchaseTixApi() });
            }
            if (!ns.stock.hasTixApiAccess() || !ns.stock.hasWseAccount()) {
                await writeState(ns, "stock", { status: "locked", reason: "Waiting for WSE + TIX API", positions: null, exposure: null });
                await ns.sleep(20_000); continue;
            }
            const envelope = () => stateEnvelope(ns.getResetInfo(), Date.now());
            if (liquidate) {
                const result = liquidatePortfolio(ns);
                if (result.closedPositions) await event(ns, "stock", `Closed ${result.closedPositions} position(s) for ${coord?.title ?? "liquidation"}`, "warn");
                await writeState(ns, "stock", { ...envelope(), ...result,
                    status: result.positions === 0 ? "liquidated" : "liquidation-blocked", fourS: ns.stock.has4SDataTixApi() });
                await ns.stock.nextUpdate(); continue;
            }
            if (!hold && !ns.stock.has4SDataTixApi()) spendMoney(ns, { owner: "stock", target: "4S-TIX",
                quote: () => constants.MarketDataTixApi4SCost * ns.getBitNodeMultipliers().FourSigmaMarketDataApiCost,
                execute: () => ns.stock.purchase4SMarketDataTixApi() });
            const fourS = ns.stock.has4SDataTixApi();
            if (!fourS || hold) {
                await writeState(ns, "stock", { ...envelope(), ...portfolio(ns), status: hold ? "holding" : "online", fourS,
                    reason: hold ? "Coordinator hold" : "4S not yet acquired" });
                await ns.stock.nextUpdate(); continue;
            }
            const snapshots = portfolio(ns).holdings.map(x => ({ ...x,
                forecast: ns.stock.getForecast(x.sym), vol: ns.stock.getVolatility(x.sym) }));
            for (const x of snapshots) {
                if (x.longShares > 0 && x.forecast < 0.52) ns.stock.sellStock(x.sym, x.longShares);
                if (x.shortShares > 0 && x.forecast > 0.48) { try { ns.stock.sellShort(x.sym, x.shortShares); } catch {} }
            }
            const budget = managerBudget(ns, "stock", cfg);
            let available = Math.max(0, budget - portfolio(ns).exposure);
            for (const x of snapshots.filter(x => !x.longShares && !x.shortShares).sort((a, b) => Math.abs(b.forecast - 0.5) - Math.abs(a.forecast - 0.5))) {
                const type = x.forecast > 0.6 ? "Long" : x.forecast < 0.4 ? "Short" : null;
                if (!type || available <= 0) continue;
                const conviction = Math.abs(x.forecast - 0.5) * 2;
                const slice = Math.min(available, budget * Math.min(0.12, 0.02 + conviction * 0.1) * Math.min(1.5, 0.5 + x.vol * 10));
                const shares = sharesWithin(ns, x.sym, type, slice, type === "Long" ? x.ask : x.bid);
                if (!shares) continue;
                const receipt = spendMoney(ns, { owner: "stock", target: `${x.sym}:${type}`, limit: slice,
                    quote: () => ns.stock.getPurchaseCost(x.sym, shares, type),
                    execute: () => type === "Long" ? ns.stock.buyStock(x.sym, shares) : ns.stock.buyShort(x.sym, shares) });
                if (receipt.status === "spent") available -= receipt.cost;
            }
            await writeState(ns, "stock", { ...envelope(), ...portfolio(ns), status: "trading", fourS, budget });
            await ns.stock.nextUpdate(); continue;
        } catch (error) {
            await writeState(ns, "stock", { status: "error", error: String(error) });
        }
        await ns.sleep(15_000);
    }
}
