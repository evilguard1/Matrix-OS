import { config, reserveMoney, writeState, event, getCoordinatorState } from "/matrix/lib/common.js";

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg = config(ns);
        if (cfg.masterEnabled === false || cfg.automation?.stock === false) {
            await writeState(ns,"stock",{status:"paused"});
            await ns.sleep(5000); continue;
        }

        try {
            const cash = ns.getServerMoneyAvailable("home");
            const reserve = reserveMoney(ns,cfg);
            const coord = getCoordinatorState(ns);
            const liquidate = Boolean(coord?.liquidateStocks);
            const constants = ns.stock.getConstants();

            if (!ns.stock.hasTixApiAccess() && cash-reserve > constants.TixApiCost*1.5) {
                ns.stock.purchaseTixApi();
            }
            if (!ns.stock.hasWseAccount() && cash-reserve > constants.WseAccountCost*1.5) {
                ns.stock.purchaseWseAccount();
            }

            if (!ns.stock.hasTixApiAccess() || !ns.stock.hasWseAccount()) {
                await writeState(ns,"stock",{status:"locked",reason:"Waiting for WSE + TIX API"});
                await ns.sleep(20_000); continue;
            }

            if (!ns.stock.has4SDataTixApi() && cash-reserve > constants.MarketDataTixApi4SCost*1.5) {
                ns.stock.purchase4SMarketDataTixApi();
            }

            const symbols = ns.stock.getSymbols();
            let exposure = 0;
            let unrealized = 0;
            let positions = 0;

            if (ns.stock.has4SDataTixApi()) {
                const budget = Math.max(0, Math.min(cash-reserve, cash*(cfg.economy?.stockBudgetFraction ?? 0.25)));
                const snapshots = [];
                for (const sym of symbols) {
                    const [longShares,longPrice,shortShares,shortPrice] = ns.stock.getPosition(sym);
                    const bid = ns.stock.getBidPrice(sym);
                    const ask = ns.stock.getAskPrice(sym);
                    const forecast = ns.stock.getForecast(sym);
                    const vol = ns.stock.getVolatility(sym);
                    snapshots.push({sym,longShares,longPrice,shortShares,shortPrice,bid,ask,forecast,vol});
                    if (longShares > 0) {
                        exposure += longShares*bid; positions++;
                        unrealized += longShares*(bid-longPrice);
                    }
                    if (shortShares > 0) {
                        exposure += shortShares*ask; positions++;
                        unrealized += shortShares*(shortPrice-ask);
                    }
                }

                if (liquidate) {
                    let closedCount = 0;
                    for (const x of snapshots) {
                        if (x.longShares > 0) {
                            ns.stock.sellStock(x.sym, x.longShares);
                            closedCount++;
                        }
                        if (x.shortShares > 0) {
                            try { ns.stock.sellShort(x.sym, x.shortShares); closedCount++; } catch {}
                        }
                    }
                    if (closedCount > 0) {
                        await event(ns, "stock", `Liquidated ${closedCount} position(s) for progression objective: ${coord?.title || "goal"}`, "warn");
                    }
                    await writeState(ns, "stock", { status: "liquidating", fourS: true, positions: 0, exposure: 0, unrealized: 0, reason: coord?.title || "liquidation" });
                    await ns.stock.nextUpdate();
                    continue;
                }

                // Exit weak positions first.
                for (const x of snapshots) {
                    if (x.longShares > 0 && x.forecast < 0.52) {
                        ns.stock.sellStock(x.sym,x.longShares);
                        exposure = Math.max(0, exposure - x.longShares*x.bid);
                        await event(ns,"stock",`Closed LONG ${x.sym} forecast ${(x.forecast*100).toFixed(1)}%`);
                    }
                    if (x.shortShares > 0 && x.forecast > 0.48) {
                        try {
                            ns.stock.sellShort(x.sym,x.shortShares);
                            exposure = Math.max(0, exposure - x.shortShares*x.ask);
                        } catch {}
                    }
                }

                // Allocate only remaining portfolio budget, strongest signals first.
                const ranked = snapshots
                    .filter(x => x.longShares===0 && x.shortShares===0)
                    .sort((a,b) => Math.abs(b.forecast-0.5) - Math.abs(a.forecast-0.5));

                for (const x of ranked) {
                    const available = Math.max(0, budget - exposure);
                    if (available <= 0) break;
                    const conviction = Math.abs(x.forecast-0.5)*2;
                    const slice = Math.min(available, budget * Math.min(0.12, 0.02 + conviction*0.10) * Math.min(1.5, 0.5+x.vol*10));
                    if (x.forecast > 0.60) {
                        const shares = Math.max(0,Math.min(ns.stock.getMaxShares(x.sym),Math.floor(slice/x.ask)));
                        if (shares>0) {
                            const price = ns.stock.buyStock(x.sym,shares);
                            if (price > 0) exposure += shares*price;
                        }
                    } else if (x.forecast < 0.40) {
                        const shares = Math.max(0,Math.min(ns.stock.getMaxShares(x.sym),Math.floor(slice/x.bid)));
                        if (shares>0) {
                            try {
                                const price = ns.stock.buyShort(x.sym,shares);
                                if (price > 0) exposure += shares*price;
                            } catch {}
                        }
                    }
                }
                await writeState(ns,"stock",{status:"trading",fourS:true,positions,exposure,unrealized,budget});
                await ns.stock.nextUpdate();
                continue;
            }

            await writeState(ns,"stock",{status:"online",fourS:false,positions,exposure,reason:"4S not yet acquired"});
        } catch(e) {
            await writeState(ns,"stock",{status:"error",error:String(e)});
        }
        await ns.sleep(15_000);
    }
}
