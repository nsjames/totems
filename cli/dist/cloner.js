"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyModTemplateContract = exports.syncTemplate = exports.cloneTemplate = void 0;
const runner_1 = require("./runner");
const prompt_1 = require("./prompt");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TEMPLATE_REPO = "https://github.com/nsjames/totems-mod-template.git";
const cloneTemplate = (targetPath) => {
    (0, runner_1.run)(`git clone ${TEMPLATE_REPO} "${targetPath}"`);
    (0, runner_1.run)(`git remote rename origin upstream`, targetPath);
    (0, runner_1.run)(`git remote set-url --push upstream DISABLED`, targetPath);
};
exports.cloneTemplate = cloneTemplate;
const TEMPLATE_SYNC_FILES = [
    "contracts/library/totems.hpp",
    "tests/helpers.ts"
];
const syncTemplate = async () => {
    console.log("🔄 Fetching upstream...");
    (0, runner_1.runLive)("git fetch upstream");
    console.log("\n📄 Changes from upstream:\n");
    let hasChanges = false;
    for (const file of TEMPLATE_SYNC_FILES) {
        const diff = (0, runner_1.run)(`git diff upstream/main -- ${file}`);
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
    const ok = await (0, prompt_1.confirm)("\nApply these changes?");
    if (!ok) {
        console.log("❌ Sync cancelled");
        return;
    }
    const files = TEMPLATE_SYNC_FILES.join(" ");
    console.log("\n⬇️  Applying upstream changes...");
    (0, runner_1.runLive)(`git checkout upstream/main -- ${files}`);
    console.log("✅ Template synced");
};
exports.syncTemplate = syncTemplate;
// copy only the /contracts/mod directory from the template repo
const copyModTemplateContract = (targetPath, modName) => {
    const contractsDir = path_1.default.join(targetPath, "contracts");
    const tempDir = path_1.default.join(contractsDir, "temp-mod");
    const finalDir = path_1.default.join(contractsDir, modName);
    if (fs_1.default.existsSync(finalDir)) {
        throw new Error(`Mod already exists: contracts/${modName}`);
    }
    if (fs_1.default.existsSync(tempDir)) {
        throw new Error(`Temporary directory already exists: contracts/temp-mod (clean it up first)`);
    }
    (0, runner_1.runLive)("git fetch upstream", targetPath);
    (0, runner_1.runLive)(`git checkout upstream/main -- contracts/mod`, targetPath);
    fs_1.default.renameSync(path_1.default.join(contractsDir, "mod"), tempDir);
    fs_1.default.cpSync(tempDir, finalDir, { recursive: true });
    fs_1.default.rmSync(tempDir, { recursive: true, force: true });
};
exports.copyModTemplateContract = copyModTemplateContract;
