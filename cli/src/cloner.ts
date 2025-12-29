import {run, runLive} from './runner';
import {confirm} from "./prompt";
import fs from "fs";
import path from "path";
import * as os from "node:os";

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

    if (hasChanges) {
        const ok = await confirm("\nApply these changes?");
        if (!ok) {
            console.log("❌ Sync cancelled");
            return;
        }

        const files = TEMPLATE_SYNC_FILES.join(" ");
        console.log("\n⬇️  Applying upstream changes...");
        runLive(`git checkout upstream/main -- ${files}`);
    }



    copyTotemsPrebuilts(process.cwd());

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

export const copyTotemsPrebuilts = (targetPath: string) => {
    const REPO_URL = "https://github.com/nsjames/totems.git";
    const BRANCH = "main";

    const prebuiltsDir = path.join(targetPath, "prebuilts");
    if (fs.existsSync(prebuiltsDir)) {
        fs.rmSync(prebuiltsDir, { recursive: true, force: true });
    }

    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "totems-prebuilts-")
    );

    try {
        console.log("📦 Cloning totems repo (shallow)...");
        run(`git clone --depth=1 --filter=blob:none --no-checkout ${REPO_URL} "${tempDir}"`);

        run(`git sparse-checkout init --cone`, tempDir);
        run(`git sparse-checkout set build`, tempDir);
        run(`git checkout ${BRANCH}`, tempDir);

        fs.mkdirSync(prebuiltsDir, { recursive: true });

        console.log("📂 Copying prebuilts...");
        fs.cpSync(
            path.join(tempDir, "build"),
            prebuiltsDir,
            { recursive: true }
        );

        console.log("✅ Prebuilts copied");
    } finally {
        console.log("🧹 Cleaning up temp directory...");
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};
