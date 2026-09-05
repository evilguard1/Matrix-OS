// Test-only entry point in an isolated local build. Never distributed with MatrixOS.
import { Player } from "./Player";
import { Terminal } from "./Terminal";
import { ITutorial } from "./InteractiveTutorial";
import { Router } from "./ui/GameRoot";
import { Page } from "./ui/Router";
import { Settings } from "./Settings/Settings";
Settings.RemoteFileApiPort = 0;
Settings.RemoteFileApiReconnectionDelay = 0;
Object.assign(globalThis, { __ghostHarness: {
  ready: () => Boolean(Player?.getHomeComputer?.()),
  configure: (ram: number, cash: number, node: number = 1, sf4: number = 0) => {
    Player.getHomeComputer().maxRam = ram;
    Player.money = cash;
    Player.bitNodeN = node;
    Player.sourceFiles.set(4, sf4);
  },
  read: (name: string) => Player.getHomeComputer().textFiles.get(name as never)?.text ?? "",
  ram: () => {
    const home = Player.getHomeComputer();
    return [...home.scripts.values()].map(script => {
      script.updateRamUsage(home.scripts);
      return { file: script.filename, ram: script.getRamUsage(home.scripts), error: script.ramCalculationError };
    });
  },
  load: (files: Record<string,string>) => {
    ITutorial.isRunning = false;
    const home = Player.getHomeComputer();
    home.maxRam = 64;
    for (const [name, content] of Object.entries(files)) home.writeToContentFile(name as never, content);
    Router.toPage(Page.Terminal);
    const script = home.scripts.get("matrix/dashboard.jsx" as never);
    return { ram: script?.getRamUsage(home.scripts), error: script?.ramCalculationError, files: [...home.scripts.keys()] };
  },
  run: (command: string) => Terminal.executeCommand(command),
  report: () => {
    const home = Player.getHomeComputer();
    return { running: [...home.runningScriptMap.values()].flatMap(byPid => [...byPid.values()]).map(s => ({pid:s.pid, filename:s.filename, logEntries:s.logs.length, textLogs:s.logs.filter(x=>typeof x === "string")})),
      lease:home.textFiles.get("matrix/state/dashboard.txt" as never)?.text };
  },
}});
