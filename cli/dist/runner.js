"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLive = exports.run = void 0;
const child_process_1 = require("child_process");
const run = (cmd, cwd) => {
    return (0, child_process_1.execSync)(cmd, {
        stdio: "pipe",
        cwd,
        encoding: "utf-8"
    });
};
exports.run = run;
const runLive = (cmd, cwd) => {
    (0, child_process_1.execSync)(cmd, { stdio: "inherit", cwd });
};
exports.runLive = runLive;
