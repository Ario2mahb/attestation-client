import { AlertBase } from "../alerts/AlertBase";
import { AlertsManager } from "../alerts/AlertsManager";
import { DotEnvExt } from "../utils/DotEnvExt";
import { getGlobalLogger } from "../utils/logger";
import { EServiceStatus } from "../utils/serviced";
import { sleepms } from "../utils/utils";
import { Menu, MenuItemCommand, MenuItemService } from "./menu";

async function admin() {
    const menu = new Menu();

    menu.addCommand("Update", "git pull & bash ./scripts/compile.sh");
    menu.addSubmenu("Deploy").
        addCommand("^RAll", "bash ./scripts/deploy-all").parent.
        addCommand("Indexers", "bash ./scripts/deploy-indexer").parent.
        addCommand("Alerts", "bash ./scripts/deploy-alerts").parent.
        addCommand("Coston Attestation Client", "bash ./scripts/deploy-coston-attester").parent.
        addCommand("Coston backend", "bash ./scripts/deploy-coston-backend").parent.
        addCommand("Songbird Attestation Client", "bash ./scripts/deploy-songbird-attester").parent.
        addCommand("Songbird backend", "bash ./scripts/deplay-songbird-backend");

    menu.addSubmenu("Services").
        addCommand("^RRestart all", "bash ./scripts/services-restart-all").parent.
        addCommand("^RStop all", "bash ./scripts/services-stop-all").parent.
        addSubmenu("Indexer").
            addService("ALGO", "indexer-algo").parent.
            addService("BTC", "indexer-btc").parent.
            addService("DOGE", "indexer-doge").parent.
            addService("LTC", "indexer-ltc").parent.
            addService("XRP", "indexer-xrp").parent.
        parent.
        addService("Alerts", "attester-alerts").parent.
        addService("Coston Attestation Client", "coston-attester-client").parent.
        addService("Coston backend", "coston-backend").parent.
        addService("Songbird Attestation Client", "songbird-attester-client").parent.
        addService("Songbird backend", "songbird-backend").parent;

    menu.addSubmenu("Show log").
        addSubmenu("Indexer").
            addLog("ALGO", "../global/indexer/logs/attester-ALGO.log").parent.
            addLog("BTC", "../global/indexer/logs/attester-BTC.log").parent.
            addLog("DOGE", "../global/indexer/logs/attester-DOGE.log").parent.
            addLog("LTC", "../global/indexer/logs/attester-LTC.log").parent.
            addLog("XRP", "../global/indexer/logs/attester-XRP.log").parent.
        parent.
        addLog("app", "logs/attester-global.log").parent.
        addLog("Alerts", "../global/alerts/logs/attester-global.log").parent.
        addLog("Coston Attestation Client", "../coston/attester-client/logs/attester-global.log").parent.
        addLog("Coston backend", "../coston/backend/logs/attester-global.log").parent.
        addLog("Songbird Attestation Client", "../songbird/attester-client/logs/attester-global.log").parent.
        addLog("Songbird backend", "../songbird/backend/logs/attester-global.log").parent;

    //await menu.run();

    Menu.startInputRead();

    // initialize alerts
    AlertBase.restartEnabled = false;
    const alerts = new AlertsManager();
    for (let alert of alerts.alerts) {
        await alert.initialize();
    }

    let resAlerts = [];
    let resPerfs = [];

    const logger = getGlobalLogger();

    menu.onDisplay = () => {
        logger.info(`^E System Monitor                                    `);
        for (let resAlert of resAlerts) {
            resAlert.displayStatus(logger);
        }
        logger.info(`                                                  `);
        logger.info(`^E Performance Monitor                              `);
        for (let resPerf of resPerfs) {
            resPerf.displayStatus(logger);
        }

        logger.info(`                                                  `);
        logger.info(`^E Services                                       `);
        for (let service of MenuItemService.servicemMonitors) {

            let color = "^y^K";
            switch (service.status) {
                case EServiceStatus.inactive: color = "^r^W"; break;
                case EServiceStatus.failed: color = "^b^W"; break;
                case EServiceStatus.active: color = "^g^K"; break;
            }

            logger.info(`${service.name.padEnd(30)}  ${color} ${EServiceStatus[service.status].padEnd(10)} ^^  ^B${service.comment}                              `);
        }

        logger.info(`                                                  `);
    }

    menu.display(true); 2

    while (!menu.done) {

        // update alerts
        resAlerts = [];
        for (let alert of alerts.alerts) {
            const resAlert = await alert.check();

            if (!resAlert) continue;

            resAlerts.push(resAlert);
        }

        resPerfs = [];
        for (let alert of alerts.alerts) {
            const resPerf = await alert.perf();

            if (!resPerf) continue;

            for (let i of resPerf) {
                resPerfs.push(i);
            }
        }

        // update menu
        menu.display();

        const key = await menu.waitForInputTimeout(5000);

        if (key) {
            menu.processInput(key);
        }
        else {
            // wait for execution to stop
            while (MenuItemCommand.working) {
                await sleepms(100);
            }
        }
    }
}

async function run() {
    await admin();
}

DotEnvExt();

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });