import { readConfig } from "../utils/config";
import { DotEnvExt } from "../utils/DotEnvExt";
import { AttLogger, getGlobalLogger } from "../utils/logger";
import { Terminal } from "../utils/terminal";
import { sleepms } from "../utils/utils";
import { AlertBase, AlertRestartConfig } from "./AlertBase";
import { AttesterAlert } from "./AttestationAlert";
import { IndexerAlert } from "./IndexerAlert";





export class AlertConfig {
    interval: number = 5000;

    timeLate: number = 5;
    timeDown: number = 10;
    timeRestart: number = 20;
    indexerRestart = "";
    indexers = ["ALGO", "BTC", "DOGE", "LTC", "XRP"];
    attesters = [
        { name: "Coston", mode: "dev", restart: "" },
        { name: "Songbird", mode: "songbird", restart: "" },
    ]

}

class AlertManager {
    logger: AttLogger;
    config: AlertConfig;

    alerts: AlertBase[] = [];

    constructor() {
        this.logger = getGlobalLogger();

        this.config = readConfig<AlertConfig>("alerts");

        for (let indexer of this.config.indexers) {
            this.alerts.push(new IndexerAlert(indexer, this.logger, this.config));
        }

        for (let attester of this.config.attesters) {
            this.alerts.push(new AttesterAlert(attester.name, this.logger, attester.mode, new AlertRestartConfig(this.config.timeRestart, attester.mode)));
        }
    }

    async runAlerts() {
        for (let alert of this.alerts) {
            await alert.initialize();
        }

        const terminal = new Terminal(process.stderr);
        terminal.cursor(false);

        this.logger.info(`^e^K${"name".padEnd(20)}  ${"status".padEnd(10)}    ${"message".padEnd(10)} comment                        `);

        terminal.cursorSave();

        while (true) {

            terminal.cursorRestore();

            for (let alert of this.alerts) {
                const res = await alert.check();

                res.displayStatus(this.logger);
            }

            await sleepms(this.config.interval);
        }
    }
}


DotEnvExt();

const alertManager = new AlertManager();

alertManager.runAlerts();