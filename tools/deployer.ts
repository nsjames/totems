// @ts-ignore
import fs from "fs";
import {ABI, PermissionLevel} from "@wharfkit/session";
import {Serializer} from "@wharfkit/antelope";

export const deployContract = async (session:any, wasmPath:string, abiPath:string, account:string) => {
    const wasm = fs.readFileSync(wasmPath);
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

    const estimatedRam = (wasm.byteLength * 10) + JSON.stringify(abi).length;

    const accountInfo = await session.client.v1.chain.get_account(account).catch(err => {
        console.error(err);
        return {
            ram_quota: 0,
            ram_usage: 0,
            last_code_update: '1970-01-01T00:00:00.000',
        };
    });

    let previousCodeSize = 0;
    if(accountInfo.last_code_update !== '1970-01-01T00:00:00.000'){
        const previousCode = await session.client.v1.chain.get_code(account).catch(err => {
            console.error('Error getting previous code: ', err);
            return {
                code_hash: '',
                wasm: '',
                abi: {},
            };
        });
        previousCodeSize = (previousCode.wasm.length * 10) + JSON.stringify(previousCode.abi || "").length;
    }

    const freeRam = parseInt(accountInfo.ram_quota.toString()) - parseInt(accountInfo.ram_usage.toString());
    const extraRamRequired = estimatedRam - previousCodeSize;

    const ramRequired = freeRam > extraRamRequired ? 0 : extraRamRequired - freeRam;

    const permissionLevels = [PermissionLevel.from({
        actor: account,
        permission: 'active',
    })];

    let actions:any = [
        {
            account: 'eosio',
            name: 'setcode',
            data: {
                account,
                vmtype: 0,
                vmversion: 0,
                code: wasm.toString('hex'),
            },
            authorization: permissionLevels,
        },
        {
            account: 'eosio',
            name: 'setabi',
            data: {
                account,
                abi: Serializer.encode({
                    object: abi,
                    type: ABI
                }),
            },
            authorization: permissionLevels,
        }
    ];

    if(ramRequired > 0){
        actions.unshift({
            account: 'eosio',
            name: 'buyrambytes',
            data: {
                payer: account,
                receiver: account,
                bytes: ramRequired,
            },
            authorization: permissionLevels,
        });
    }

    const result = await session.transact({
        actions,
    }).catch(err => {
        if(err.message === 'contract is already running this version of code'){
            return true;
        }

        throw err;
    });
}