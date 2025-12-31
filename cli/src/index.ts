#!/usr/bin/env node
import { Command } from "commander";
// @ts-ignore
import packageJson from '../package.json';
import fs from "fs";
import path from "path";
import {cloneTemplate, copyModTemplateContract, copyTotemsLibrary, copyTotemsPrebuilts, syncTemplate} from './cloner';

const program = new Command();

const panic = (error: any) => {
    console.error(error);
    process.exit(1);
}

program
    .name("Totem Mods CLI")
    .version(packageJson.version)
    .description("A CLI for Totem Mods (totems.fun)")

program
    .command('create [name] [path]')
    .description('Create a new totem mod')
    .action((_name, _path) => {
        if(!_name) panic("Mod name is required");
        if(!_path) _path = _name;

        // check if current directory is empty
        const fullPath = path.resolve(_path);

        let isEmpty = true;
        try {
            const files = fs.readdirSync(fullPath);
            if(files.length > 0) isEmpty = false;
        } catch {}

        if(isEmpty){
            // no existing files, create new totem mod from template
            try { fs.mkdirSync(fullPath, { recursive: true }); } catch {}
            cloneTemplate(fullPath);
            copyTotemsPrebuilts(fullPath);
            copyTotemsLibrary(fullPath);
            console.log(`New totem mod '${_name}' created at ${fullPath}`);
        } else {
            // add new contract into 'contracts' directory
            const contractsPath = path.join(fullPath, 'contracts');
            let contractPathExists = false;
            try {
                fs.readdirSync(contractsPath);
                contractPathExists = true;
            } catch {}
            if(!contractPathExists){
                panic(`Contracts directory does not exist at ${contractsPath}`);
            }

            const newContractPath = path.join(contractsPath, _name);
            if(fs.existsSync(newContractPath)){
                panic(`Contract directory already exists at ${newContractPath}`);
            }

            copyModTemplateContract(fullPath, _name);
            console.log(`New contract '${_name}' created at ${newContractPath}`);
        }

    });

program
    .command('sync template')
    .description('Sync the local template with the latest version')
    .action(async () => {
        syncTemplate().catch(err => {
            panic(err);
        });
    });


program.parse();