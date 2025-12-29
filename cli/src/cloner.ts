import {run, runLive} from './runner';
import {confirm} from "./prompt";
import fs from "fs";
import path from "path";

const TEMPLATE_REPO = "https://github.com/nsjames/totems-mod-template.git";

export const cloneTemplate = (targetPath: string) => {
    run(`git clone ${TEMPLATE_REPO} "${targetPath}"`);
    run(`git remote rename origin upstream`, targetPath);
    run(`git remote set-url --push upstream DISABLED`, targetPath);
};

const TEMPLATE_SYNC_FILES = [
    "contracts/library/totems.hpp",
    "tests/helpers.ts"
];

export const syncTemplate = async () => {
    console.log("🔄 Fetching upstream...");
    runLive("git fetch upstream");

    console.log("\n📄 Changes from upstream:\n");

    let hasChanges = false;

    for (const file of TEMPLATE_SYNC_FILES) {
        const diff = run(`git diff upstream/main -- ${file}`);
        if (diff.trim()) {
            hasChanges = true;
            console.log(`--- ${file} ---`);
            console.log(diff);
        }
    }

    if (!hasChanges) {
        console.log("✅ No upstream changes detected");
        return;
    }

    const ok = await confirm("\nApply these changes?");
    if (!ok) {
        console.log("❌ Sync cancelled");
        return;
    }

    const files = TEMPLATE_SYNC_FILES.join(" ");
    console.log("\n⬇️  Applying upstream changes...");
    runLive(`git checkout upstream/main -- ${files}`);

    console.log("✅ Template synced");
};

// copy only the /contracts/mod directory from the template repo
export const copyModTemplateContract = (
    targetPath: string,
    modName: string
) => {
    const contractsDir = path.join(targetPath, "contracts");
    const tempDir = path.join(contractsDir, "temp-mod");
    const finalDir = path.join(contractsDir, modName);

    if (fs.existsSync(finalDir)) {
        throw new Error(`Mod already exists: contracts/${modName}`);
    }

    if (fs.existsSync(tempDir)) {
        throw new Error(
            `Temporary directory already exists: contracts/temp-mod (clean it up first)`
        );
    }

    runLive("git fetch upstream", targetPath);
    runLive(`git checkout upstream/main -- contracts/mod`, targetPath);

    fs.renameSync(path.join(contractsDir, "mod"), tempDir);
    fs.cpSync(tempDir, finalDir, { recursive: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
};

