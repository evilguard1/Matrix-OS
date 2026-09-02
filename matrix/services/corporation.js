import { config, writeState, event } from "/matrix/lib/common.js";

const CITIES = ["Aevum","Chongqing","Sector-12","New Tokyo","Ishima","Volhaven"];
const AGRI = "Agriculture";
const DIV = "Matrix Agriculture";

function corpFunds(ns) { return ns.corporation.getCorporation().funds; }

function ensureApiUnlocks(ns) {
    for (const name of ["Office API", "Warehouse API"]) {
        if (ns.corporation.hasUnlock(name)) continue;
        const cost = ns.corporation.getUnlockCost(name);
        if (cost > 0 && corpFunds(ns) > cost * 1.35) {
            ns.corporation.purchaseUnlock(name);
        }
    }
    return ns.corporation.hasUnlock("Office API") && ns.corporation.hasUnlock("Warehouse API");
}


function ensureAgri(ns) {
    let corp = ns.corporation.getCorporation();
    if (!corp.divisions.includes(DIV)) {
        const data = ns.corporation.getIndustryData(AGRI);
        if (corp.funds < data.startingCost) return false;
        ns.corporation.expandIndustry(AGRI,DIV);
        corp = ns.corporation.getCorporation();
    }
    if (!corp.divisions.includes(DIV)) return false;
    const div = ns.corporation.getDivision(DIV);
    for (const city of CITIES) {
        if (!div.cities.includes(city)) {
            const cost = ns.corporation.getConstants().officeInitialCost;
            if (corpFunds(ns) > cost*2) ns.corporation.expandCity(DIV,city);
        }
        if (ns.corporation.getDivision(DIV).cities.includes(city) && !ns.corporation.hasWarehouse(DIV,city)) {
            const cost = ns.corporation.getConstants().warehouseInitialCost;
            if (corpFunds(ns) > cost*2) ns.corporation.purchaseWarehouse(DIV,city);
        }
    }
    return true;
}

function setupCity(ns,city) {
    if (!ns.corporation.getDivision(DIV).cities.includes(city)) return;
    const office = ns.corporation.getOffice(DIV,city);
    if (office.size < 9) {
        const cost = ns.corporation.getOfficeSizeUpgradeCost(DIV,city,9-office.size);
        if (corpFunds(ns)>cost*2) ns.corporation.upgradeOfficeSize(DIV,city,9-office.size);
    }
    let o2 = ns.corporation.getOffice(DIV,city);
    while (o2.numEmployees < o2.size) {
        if (!ns.corporation.hireEmployee(DIV,city,"Research & Development")) break;
        o2 = ns.corporation.getOffice(DIV,city);
    }

    const jobs = [
        ["Operations",Math.floor(o2.size*0.25)],
        ["Engineer",Math.floor(o2.size*0.30)],
        ["Business",Math.floor(o2.size*0.20)],
        ["Management",Math.floor(o2.size*0.15)],
        ["Research & Development",0],
    ];
    let assigned = jobs.reduce((s,x)=>s+x[1],0);
    jobs[4][1] = Math.max(0,o2.numEmployees-assigned);
    for (const [job,count] of jobs) {
        try { ns.corporation.setJobAssignment(DIV,city,job,count); } catch {}
    }

    if (ns.corporation.hasWarehouse(DIV,city)) {
        if (ns.corporation.hasUnlock("Smart Supply")) {
            try { ns.corporation.setSmartSupply(DIV,city,true); } catch {}
        }
        try {
            ns.corporation.sellMaterial(DIV,city,"Food","MAX","MP");
            ns.corporation.sellMaterial(DIV,city,"Plants","MAX","MP");
        } catch {}
    }
}

function upgradeGlobal(ns) {
    const names = ["Smart Factories","Smart Storage","FocusWires","Neural Accelerators","Speech Processor Implants","Nuoptimal Nootropic Injector Implants"];
    for (let loops=0;loops<20;loops++) {
        const affordable = names.map(name=>({name,cost:ns.corporation.getUpgradeLevelCost(name)}))
            .filter(x=>x.cost>0 && x.cost<corpFunds(ns)*0.03).sort((a,b)=>a.cost-b.cost)[0];
        if (!affordable) break;
        ns.corporation.levelUpgrade(affordable.name);
    }
    if (!ns.corporation.hasUnlock("Smart Supply")) {
        const cost=ns.corporation.getUnlockCost("Smart Supply");
        if (corpFunds(ns)>cost*3) ns.corporation.purchaseUnlock("Smart Supply");
    }
}

export async function main(ns) {
    ns.disableLog("ALL");
    while (true) {
        const cfg=config(ns);
        if (cfg.masterEnabled===false || cfg.automation?.corporation===false) {
            await writeState(ns,"corporation",{status:"paused"}); await ns.sleep(5000); continue;
        }
        try {
            if (!ns.corporation.hasCorporation()) {
                const selfFund = ns.getResetInfo().currentNode !== 3;
                if (ns.corporation.canCreateCorporation(selfFund)==="Success") {
                    if (ns.corporation.createCorporation("MATRIX INDUSTRIES",selfFund)) {
                        await event(ns,"corporation","Corporation created","success");
                    }
                }
            }
            if (!ns.corporation.hasCorporation()) {
                await writeState(ns,"corporation",{status:"locked",reason:"Waiting for corporation seed"});
                await ns.sleep(15000); continue;
            }

            const apiReady = ensureApiUnlocks(ns);
            const agricultureReady = ensureAgri(ns);
            if (apiReady && agricultureReady) {
                for (const city of CITIES) setupCity(ns,city);
                upgradeGlobal(ns);
            }

            const corp=ns.corporation.getCorporation();
            const offer=ns.corporation.getInvestmentOffer();
            if (offer.round<=2 && offer.funds>0 && offer.funds > corp.funds*6) {
                ns.corporation.acceptInvestmentOffer();
                await event(ns,"corporation",`Accepted investment round ${offer.round}`,"success");
            }

            await writeState(ns,"corporation",{
                status:agricultureReady?"online":"building",funds:corp.funds,revenue:corp.revenue,expenses:corp.expenses,
                profit:corp.revenue-corp.expenses,divisions:corp.divisions,investmentRound:offer.round,
                investmentOffer:offer.funds
            });
            await ns.corporation.nextUpdate();
            continue;
        } catch(e) {
            await writeState(ns,"corporation",{status:"error",error:String(e)});
        }
        await ns.sleep(5000);
    }
}
