import { execSync } from "child_process";

export const run = (cmd: string, cwd?: string) => {
    return execSync(cmd, {
        stdio: "pipe",
        cwd,
        encoding: "utf-8"
    });
};

export const runLive = (cmd: string, cwd?: string) => {
    execSync(cmd, { stdio: "inherit", cwd });
};

