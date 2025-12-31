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
    "tests/helpers.ts"
];

export const syncTemplate = async () => {
    runLive("git fetch upstream");

    const files = TEMPLATE_SYNC_FILES.join(" ");
    runLive(`git checkout upstream/main -- ${files}`);
    copyTotemsPrebuilts(process.cwd());
    copyTotemsLibrary(process.cwd());

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
        run(`git clone --depth=1 --filter=blob:none --no-checkout ${REPO_URL} "${tempDir}"`);

        run(`git sparse-checkout init --cone`, tempDir);
        run(`git sparse-checkout set build`, tempDir);
        run(`git checkout ${BRANCH}`, tempDir);

        fs.mkdirSync(prebuiltsDir, { recursive: true });
        fs.cpSync(
            path.join(tempDir, "build"),
            prebuiltsDir,
            { recursive: true }
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};

export const copyTotemsLibrary = (targetPath: string) => {
    const REPO_URL = "https://github.com/nsjames/totems.git";
    const BRANCH = "main";

    const targetDir = path.join(targetPath, "contracts", "library");
    const targetFile = path.join(targetDir, "totems.hpp");

    if (fs.existsSync(targetFile)) {
        fs.rmSync(targetFile, { force: true });
    }

    const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "totems-library-")
    );

    try {
        run(
            `git clone --depth=1 --filter=blob:none --no-checkout ${REPO_URL} "${tempDir}"`
        );

        run(`git sparse-checkout init --cone`, tempDir);
        run(`git sparse-checkout set contracts/library`, tempDir);
        run(`git checkout ${BRANCH}`, tempDir);

        fs.mkdirSync(targetDir, { recursive: true });

        const sourceFile = path.join(
            tempDir,
            "contracts",
            "library",
            "totems.hpp"
        );

        if (!fs.existsSync(sourceFile)) {
            throw new Error("contracts/library/totems.hpp not found in repo");
        }
        fs.copyFileSync(sourceFile, targetFile);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
};




