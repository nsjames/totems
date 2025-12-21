import {ABI, Chains, PermissionLevel, Session} from "@wharfkit/session"
import { WalletPluginPrivateKey } from "@wharfkit/wallet-plugin-privatekey"
// @ts-ignore
import chai, { assert, expect } from "chai";
import {FieldType, serializeActionFields} from "../tools/serializer";
chai.config.truncateThreshold = 0;
// @ts-ignore
import fs from "fs";
import {Serializer} from "@wharfkit/antelope";

const account = process.env.TESTING_ACCOUNT || '';
if(!account){
    throw new Error('TESTING_ACCOUNT environment variable is not set');
}

if(!process.env.TESTING_KEY){
    throw new Error('TESTING_KEY environment variable is not set');
}

const session = new Session({
    chain: Chains.Jungle4,
    walletPlugin: new WalletPluginPrivateKey(process.env.TESTING_KEY),
    actor: account,
    permission: 'active',
});

const deployContract = async () => {
    const wasm = fs.readFileSync('./build/validator.wasm');
    const abi = JSON.parse(fs.readFileSync('./build/validator.abi', 'utf8'));

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

const sendActions = async (sender: string, ticker: string, required_actions: any[], actions:any[])=> {
    actions.push({
        account,
        name: 'validate',
        authorization: [PermissionLevel.from({
            actor: sender,
            permission: 'active',
        })],
        data: {
            sender,
            ticker,
            required:required_actions,
        }
    })

    return session.transact({ actions });
}

describe('Validator (can only be run on chain, see .env.example)', () => {
    it('Should be able to deploy test validator', async () => {
        await deployContract();
    })
    it('Should be able to validate a correct set of required actions', async () => {
        const result = await sendActions(
            account,
            'TOTEM',
            [
                await serializeActionFields({
                    client: session.client,
                    contract: 'eosio.token',
                    action: 'transfer',
                    fields: [
                        { param: 'from', type:FieldType.SENDER },
                        { param: 'to', type:FieldType.STATIC, data: 'eosio' },
                        { param: 'quantity', type:FieldType.DYNAMIC },
                    ],
                })
            ],
            [
                {
                    account: 'eosio.token',
                    name: 'transfer',
                    authorization: [PermissionLevel.from({
                        actor: account,
                        permission: 'active',
                    })],
                    data: {
                        from: account,
                        to: 'eosio',
                        quantity: '0.0001 EOS',
                        memo: 'Testing validator',
                    }
                }
            ]
        )
    })
    it('Should NOT be able to validate an incorrect set of required actions, or missing actions', async () => {
        // Missing required action
        try {
            await sendActions(
                account,
                'TOTEM',
                [
                    await serializeActionFields({
                        client: session.client,
                        contract: 'eosio.token',
                        action: 'transfer',
                        fields: [
                            { param: 'from', type:FieldType.SENDER },
                            { param: 'to', type:FieldType.STATIC, data: 'eosio' },
                            { param: 'quantity', type:FieldType.DYNAMIC },
                        ],
                    })
                ],
                []
            )

            throw new Error('Expected validation to fail but it succeeded');
        } catch (err: any) {
            expect(err).to.be.instanceof(Error)
            expect(err.message).to.include(
                'assertion failure with message: get_action size failed'
            )
        }

        // Incorrect required action data
        try {
            await sendActions(
                account,
                'TOTEM',
                [
                    await serializeActionFields({
                        client: session.client,
                        contract: 'eosio.token',
                        action: 'transfer',
                        fields: [
                            { param: 'from', type:FieldType.SENDER },
                            { param: 'to', type:FieldType.STATIC, data: 'eosio' },
                            { param: 'quantity', type:FieldType.DYNAMIC },
                        ],
                    })
                ],
                [
                    {
                        account: 'eosio.token',
                        name: 'transfer',
                        authorization: [PermissionLevel.from({
                            actor: account,
                            permission: 'active',
                        })],
                        data: {
                            from: account,
                            to: 'core.vaulta',
                            quantity: '0.0001 EOS',
                            memo: 'Testing validator',
                        }
                    }
                ]
            )

            throw new Error('Expected validation to fail but it succeeded');
        } catch (err: any) {
            expect(err).to.be.instanceof(Error)
            expect(err.message).to.include(
                'assertion failure with message: STATIC mismatch'
            )
        }
    })
});
