import { config, writeState, event } from "/matrix/lib/common.js";
import { scanAll } from "/matrix/lib/network.js";

const solvers = {
    "Find Largest Prime Factor": n => {
        let f=2, last=1;
        while (f*f<=n) {
            if (n%f===0) { last=f; n/=f; } else f += (f===2?1:2);
        }
        return Math.max(last,n);
    },
    "Subarray with Maximum Sum": a => {
        let best=-Infinity, cur=0;
        for (const x of a) { cur=Math.max(x,cur+x); best=Math.max(best,cur); }
        return best;
    },
    "Total Ways to Sum": n => {
        const dp=Array(n+1).fill(0); dp[0]=1;
        for(let x=1;x<n;x++) for(let s=x;s<=n;s++) dp[s]+=dp[s-x];
        return dp[n];
    },
    "Total Ways to Sum II": ([n,nums]) => {
        const dp=Array(n+1).fill(0); dp[0]=1;
        for(const x of nums) for(let s=x;s<=n;s++) dp[s]+=dp[s-x];
        return dp[n];
    },
    "Spiralize Matrix": m => {
        const out=[]; let t=0,b=m.length-1,l=0,r=m[0].length-1;
        while(t<=b&&l<=r){for(let j=l;j<=r;j++)out.push(m[t][j]);t++;for(let i=t;i<=b;i++)out.push(m[i][r]);r--;
        if(t<=b){for(let j=r;j>=l;j--)out.push(m[b][j]);b--;}if(l<=r){for(let i=b;i>=t;i--)out.push(m[i][l]);l++;}}
        return out;
    },
    "Array Jumping Game": a => {
        let far=0; for(let i=0;i<=far&&i<a.length;i++) far=Math.max(far,i+a[i]); return far>=a.length-1?1:0;
    },
    "Array Jumping Game II": a => {
        if(a.length<=1)return 0; let jumps=0,end=0,far=0;
        for(let i=0;i<a.length-1;i++){far=Math.max(far,i+a[i]);if(i===end){jumps++;end=far;if(end>=a.length-1)return jumps;}}
        return 0;
    },
    "Merge Overlapping Intervals": a => {
        a=[...a].sort((x,y)=>x[0]-y[0]); const out=[];
        for(const x of a){if(!out.length||out[out.length-1][1]<x[0])out.push([...x]);else out[out.length-1][1]=Math.max(out[out.length-1][1],x[1]);}
        return out;
    },
    "Generate IP Addresses": s => {
        const out=[]; for(let a=1;a<=3;a++)for(let b=1;b<=3;b++)for(let c=1;c<=3;c++){const d=s.length-a-b-c;if(d<1||d>3)continue;
        const p=[s.slice(0,a),s.slice(a,a+b),s.slice(a+b,a+b+c),s.slice(a+b+c)];
        if(p.every(x=>String(Number(x))===x&&Number(x)<=255))out.push(p.join("."));} return out;
    },
    "Algorithmic Stock Trader I": a => {
        let min=Infinity,best=0; for(const x of a){min=Math.min(min,x);best=Math.max(best,x-min);} return best;
    },
    "Algorithmic Stock Trader II": a => a.slice(1).reduce((s,x,i)=>s+Math.max(0,x-a[i]),0),
    "Algorithmic Stock Trader III": a => {
        let b1=-Infinity,s1=0,b2=-Infinity,s2=0; for(const x of a){b1=Math.max(b1,-x);s1=Math.max(s1,b1+x);b2=Math.max(b2,s1-x);s2=Math.max(s2,b2+x);} return s2;
    },
    "Algorithmic Stock Trader IV": ([k,a]) => {
        if(k>=a.length/2)return a.slice(1).reduce((s,x,i)=>s+Math.max(0,x-a[i]),0);
        const buy=Array(k+1).fill(-Infinity),sell=Array(k+1).fill(0);
        for(const x of a)for(let j=1;j<=k;j++){buy[j]=Math.max(buy[j],sell[j-1]-x);sell[j]=Math.max(sell[j],buy[j]+x);} return sell[k];
    },
    "Minimum Path Sum in a Triangle": tri => {
        const dp=[...tri[tri.length-1]]; for(let i=tri.length-2;i>=0;i--)for(let j=0;j<tri[i].length;j++)dp[j]=tri[i][j]+Math.min(dp[j],dp[j+1]);return dp[0];
    },
    "Unique Paths in a Grid I": ([r,c]) => {
        const dp=Array(c).fill(1); for(let i=1;i<r;i++)for(let j=1;j<c;j++)dp[j]+=dp[j-1]; return dp[c-1];
    },
    "Unique Paths in a Grid II": g => {
        const c=g[0].length,dp=Array(c).fill(0);dp[0]=g[0][0]?0:1;
        for(let i=0;i<g.length;i++)for(let j=0;j<c;j++){if(g[i][j])dp[j]=0;else if(j)dp[j]+=dp[j-1];}return dp[c-1];
    },
    "Encryption I: Caesar Cipher": ([s,k]) => s.split("").map(ch=>ch===" "?ch:String.fromCharCode((ch.charCodeAt(0)-65-k+260)%26+65)).join(""),
    "Encryption II: Vigenère Cipher": ([s,key]) => s.split("").map((ch,i)=>String.fromCharCode((ch.charCodeAt(0)-65+(key.charCodeAt(i%key.length)-65))%26+65)).join(""),
};

export async function main(ns) {
    ns.disableLog("ALL");
    while(true){
        const cfg=config(ns);
        if(cfg.masterEnabled===false||cfg.automation?.contracts===false){await writeState(ns,"contracts",{status:"paused"});await ns.sleep(10000);continue;}
        let solved=0,skipped=0,found=0;
        try{
            const {hosts}=scanAll(ns);
            for(const host of hosts){
                for(const file of ns.ls(host,".cct")){
                    found++;
                    const type=ns.codingcontract.getContractType(file,host);
                    const solver=solvers[type];
                    if(!solver){skipped++;continue;}
                    const data=ns.codingcontract.getData(file,host);
                    let answer;
                    try{answer=solver(data);}catch{skipped++;continue;}
                    const reward=ns.codingcontract.attempt(answer,file,host);
                    if(reward){solved++;await event(ns,"contracts",`${type}: ${reward}`,"success");}
                }
            }
            await writeState(ns,"contracts",{status:"online",found,solved,skipped,solverCount:Object.keys(solvers).length});
        }catch(e){await writeState(ns,"contracts",{status:"error",error:String(e)});}
        await ns.sleep(60000);
    }
}
