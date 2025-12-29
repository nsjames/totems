"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirm = void 0;
const readline_1 = __importDefault(require("readline"));
const confirm = async (question) => {
    const rl = readline_1.default.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(`${question} (y/N) `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === "y");
        });
    });
};
exports.confirm = confirm;
