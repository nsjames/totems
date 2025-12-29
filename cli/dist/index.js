#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
// @ts-ignore
const package_json_1 = __importDefault(require("../package.json"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cloner_1 = require("./cloner");
const program = new commander_1.Command();
const panic = (error) => {
    console.error(error);
    process.exit(1);
};
program
    .name("Totem Mods CLI")
    .version(package_json_1.default.version)
    .description("A CLI for Totem Mods (totems.fun)");
// .option('-v', 'version')
// .option("-t, --touch <value>", "Create a file")
// .parse(process.argv);
// const options = program.opts();
//
// if(options.v) {
//     console.log(packageJson.version);
//     process.exit(0);
// }
program
    .command('create [name] [path]')
    .description('Create a new totem mod')
    .action((_name, _path) => {
    if (!_name)
        panic("Mod name is required");
    if (!_path)
        _path = _name;
    console.log('Creating a new totem mod...', _name, _path);
    // check if current directory is empty
    const fullPath = path_1.default.resolve(_path);
    console.log('Full path:', fullPath);
    let isEmpty = true;
    try {
        const files = fs_1.default.readdirSync(fullPath);
        if (files.length > 0)
            isEmpty = false;
    }
    catch { }
    if (isEmpty) {
        // no existing files, create new totem mod from template
        try {
            fs_1.default.mkdirSync(fullPath, { recursive: true });
        }
        catch { }
        (0, cloner_1.cloneTemplate)(fullPath);
        console.log(`New totem mod '${_name}' created at ${fullPath}`);
    }
    else {
        // add new contract into 'contracts' directory
        const contractsPath = path_1.default.join(fullPath, 'contracts');
        let contractPathExists = false;
        try {
            fs_1.default.readdirSync(contractsPath);
            contractPathExists = true;
        }
        catch { }
        if (!contractPathExists) {
            panic(`Contracts directory does not exist at ${contractsPath}`);
        }
        const newContractPath = path_1.default.join(contractsPath, _name);
        if (fs_1.default.existsSync(newContractPath)) {
            panic(`Contract directory already exists at ${newContractPath}`);
        }
        (0, cloner_1.copyModTemplateContract)(fullPath, _name);
        console.log(`New contract '${_name}' created at ${newContractPath}`);
    }
});
program
    .command('sync template')
    .description('Sync the local template with the latest version')
    .action(async () => {
    (0, cloner_1.syncTemplate)().catch(err => {
        panic(err);
    });
});
program.parse();
