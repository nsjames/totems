import {Blockchain, nameToBigInt, expectToThrow, symbolCodeToBigInt} from "@vaulta/vert";
import {Asset, Checksum256} from "@wharfkit/antelope";
// @ts-ignore
import chai, { assert } from "chai";
import {FieldType, serializeActionFields, uint8ToHex} from "../tools/serializer";
import {Chains} from "@wharfkit/session";
import SymbolCode = Asset.SymbolCode;
chai.config.truncateThreshold = 0;
const blockchain = new Blockchain();


beforeEach(async () => {
    // blockchain.resetTables()
})

const contract = blockchain.createContract('totemstotems', 'build/totems', true);
const eos = blockchain.createContract('eosio.token', 'build/eosio.token', true);
const vaulta = blockchain.createContract('core.vaulta', 'build/core.vaulta',  true,{privileged: true});
const market = blockchain.createContract('modsmodsmods', 'build/market',  true);
const freezer = blockchain.createContract('freezer', 'build/freezer',  true);
const freezer2 = blockchain.createContract('freezer2', 'build/freezer',  true);
const burner = blockchain.createContract('burner', 'build/burner',  true);
const testmod = blockchain.createContract('testmod', 'build/testmod',  true);
const restricted = blockchain.createContract('restricted', 'build/testmod',  true);
const ACCOUNTS = ['tester', 'eosio.fees', 'referrer', 'creator', 'holder', 'minter', 'seller', 'no.mod'];
blockchain.createAccounts(...ACCOUNTS)

const totemMods = (obj:any = {}) => Object.assign({
    transfer:[],
    mint:[],
    burn:[],
    open:[],
    close:[],
    created:[]
}, obj);

const create = async (ticker, allocations, mods = totemMods(), authorizer = 'creator', details = undefined, referrer = undefined) => {
    return contract.actions.create([
        'creator',
        ticker,
        allocations,
        mods,
        details || {
            name: "A cool new totem!",
            image: "ipfs://QmTotemImageHash",
            seed: Checksum256.hash('1110762033e7a10db4502359a19a61eb81312834769b8419047a2c9ae03ee847'),
            description: "This totem is really cool because...",
            website: "https://totems.example.com",
        },
        referrer
    ]).send(authorizer)
}

interface ModDetails {
    name: string;
    summary: string;
    markdown: string;
    website: string;
    website_token_path: string;
    image: string;
    is_minter: boolean;
}

const publish = async (seller:string, contract:string, hooks:string[], price:number, details:ModDetails, authorizer = 'seller', referrer = undefined,
                       required_actions = undefined) => {
    return market.actions.publish([
        seller,
        contract,
        hooks,
        price,
        details,
        required_actions || [],
        referrer
    ]).send(authorizer);
}

const transfer = (from, to, quantity) => {
    const _contract = quantity.includes('EOS') ? eos : vaulta;
    return _contract.actions.transfer([from, to, quantity, ""]).send(from);
}

const getBalance = (account, _contract) => {
    const table = _contract.tables.accounts(nameToBigInt(account));
    const rows = table.getTableRows();
    return rows.length ? parseFloat(rows[0].balance.split(' ')[0]) : 0;
}

const getTotemBalance = (account, ticker) => {
    const table = contract.tables.accounts(nameToBigInt(account));
    const rows = table.getTableRows();
    for (const row of rows) {
        if (row.balance.includes(ticker)) {
            return parseFloat(row.balance.split(' ')[0]);
        }
    }
    return 0;
}

const modsLength = (totem) => {
    return Object.keys(totem.mods).reduce((acc, key) => acc + totem.mods[key].length, 0);
}

let market_fee = 0;
let totems_fee = 0;

describe('Totems', () => {
    it('Should set up core token contracts', async () => {
        await eos.actions.create(['tester', '1000000000.0000 EOS']).send('eosio.token');
        await eos.actions.issue(['tester', '1000000000.0000 EOS', 'initial supply']).send('tester');

        await vaulta.actions.init(['1000000000.0000 A']).send('core.vaulta');
        await eos.actions.transfer(['tester', 'core.vaulta', '500000000.0000 EOS', '']).send('tester');

        assert(getBalance('tester', eos) === 500000000);
        assert(getBalance('core.vaulta', vaulta) === 500000000);

        for(const account of ACCOUNTS.concat([contract.name.toString()])){
            await vaulta.actions.open([account, '4,A', account]).send(account);
            await eos.actions.open([account, '4,EOS', account]).send(account);
        }
    })
    it('should set up fees', async () => {
        const checkFees = async (_contract, _fee_holder) => {
            _fee_holder = (await _contract.actions.getfee([]).send())[0].returnValue / 10000;
            assert(_fee_holder === 100, "Market fee should be 100.0000 A");

            // should not be able to set fee from any account but itself
            {
                await expectToThrow(_contract.actions.setfee([150_0000]).send('tester'), `missing required authority ${_contract.name.toString()}`);
                _fee_holder = (await _contract.actions.getfee([]).send())[0].returnValue / 10000;
                assert(_fee_holder === 100, "Totems fee should still be 100.0000 A");
            }

            // should be able to set the fee to 150, and then back to 100
            {
                await _contract.actions.setfee([150_0000]).send(_contract.name.toString());
                _fee_holder = (await _contract.actions.getfee([]).send())[0].returnValue / 10000;
                assert(_fee_holder === 150, "Totems fee should be 150.0000 A");

                await _contract.actions.setfee([100_0000]).send(_contract.name.toString());
                _fee_holder = (await _contract.actions.getfee([]).send())[0].returnValue / 10000;
                assert(_fee_holder === 100, "Totems fee should be 100.0000 A");
            }
        }

        await checkFees(market, market_fee);
        await checkFees(contract, totems_fee);
    })
    it('Should be able to create a totem with no mods', async () => {
        await transfer('tester', 'creator', '100.0000 A');

        await expectToThrow(create('4,TEST', [], undefined, 'holder'), 'missing required authority creator');
        await transfer('creator', contract.name.toString(), '99.0000 A');
        await expectToThrow(create('4,TEST', []), 'eosio_assert: Insufficient balance for fee payment');
        await transfer('creator', contract.name.toString(), '1.0000 A');
        await expectToThrow(create('4,TEST', []), 'eosio_assert: Totem initial allocation must be greater than 0');


        assert(getBalance(contract.name.toString(), eos) === 0, "Should not use EOS balances")
        assert(getBalance(contract.name.toString(), vaulta) === 100, "Should have 100 Vaulta");

        await create('4,TEST', [
            {
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '1000.0000 TEST'
            },
            {
                label: 'Founding Team',
                recipient: 'creator',
                quantity: '1000.0000 TEST'
            }
        ], undefined, 'creator');


        assert(getBalance('eosio.fees', eos) === 100, "Fee account should receive EOS fee");
        assert(getBalance('creator', vaulta) === 0, "Creator should not receive Vaulta fee");
        assert(getBalance(contract.name.toString(), vaulta) === 0, "Contract should not keep Vaulta fee");

        const totems = JSON.parse(JSON.stringify(await contract.tables.totems(nameToBigInt(contract.name.toString())).getTableRows()));
        // console.log(JSON.stringify(totems, null, 4));

        assert(totems.length === 1, "Totem should be created");
        assert(totems[0].supply === '2000.0000 TEST', "Totem should have correct supply");
        assert(totems[0].max_supply === '2000.0000 TEST', "Totem should have correct max supply");
        assert(modsLength(totems[0]) === 0, "Totem should have no mods");
        assert(totems[0].allocations.length === 2, "Totem should have 2 allocations");
        assert(totems[0].allocations[0].recipient === 'minter', "Totem should have minter allocation");
        assert(totems[0].allocations[0].quantity === '1000.0000 TEST', "Totem should have correct minter allocation");
        assert(totems[0].allocations[1].recipient === 'creator', "Totem should have creator allocation");
        assert(totems[0].allocations[1].quantity === '1000.0000 TEST', "Totem should have correct creator allocation");
        assert(totems[0].creator === 'creator', "Totem should have correct creator");
    });

    it('should do robust error checks on creation', async () => {
        await transfer('tester', 'creator', '100.0000 A');
        await transfer('creator', contract.name.toString(), '100.0000 A');

        await expectToThrow(create('4,FAIL', [
            {
                label: 'Test',
                recipient: 'minter',
                quantity: '0.0000 FAIL'
            }
        ]), 'eosio_assert: allocation quantity must be positive');
        await expectToThrow(create('4,FAIL', [
            {
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '100.0000 WRONGGGGGGG'
            }
        ]), 'eosio_assert: allocation symbol mismatch');
        await expectToThrow(create('4,FAIL', [
            {
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '100.00000 FAIL'
            },
        ]), 'eosio_assert: allocation symbol mismatch');
        await expectToThrow(create('4,TEST', [
            {
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '100.0000 TEST'
            }
        ]), 'eosio_assert: A totem with this symbol already exists');
    });
    it('should add a mod to the market', async () => {
        await transfer('tester', 'creator', '100.0000 A');
        await transfer('creator', market.name.toString(), '100.0000 A');

        await publish('seller', freezer.name.toString(), ['transfer'], 100_0000, {
            name: "Cool Mod",
            summary: "This is a cool mod.",
            markdown: "## Cool Mod\n\nThis mod is really cool because...",
            website: "",
            website_token_path: "",
            image: "ipfs://QmCoolModImageHash",
            is_minter: false,
        })

        const mods = JSON.parse(JSON.stringify(await market.tables.mods(nameToBigInt(market.name.toString())).getTableRows()));
        // console.log(JSON.stringify(mods, null, 4));

        assert(mods.length === 1, "There should be one mod");
        assert(mods[0].contract === freezer.name.toString(), "Mod should have correct contract");
        assert(mods[0].price === 100_0000, "Mod should have correct price");
        assert(mods[0].seller === 'seller', "Mod should have correct seller");
        assert(mods[0].details.name === "Cool Mod", "Mod should have correct name");
        assert(mods[0].details.summary === "This is a cool mod.", "Mod should have correct summary");
        assert(mods[0].details.markdown === "## Cool Mod\n\nThis mod is really cool because...", "Mod should have correct markdown");
        assert(mods[0].details.image === "ipfs://QmCoolModImageHash", "Mod should have correct image");
        assert(mods[0].required_actions.length === 0, "Mod should have correct number of required actions");
    });
    it('should do robust error checks on mod publishing', async () => {
        const details = {
            name: "Cool Mod",
            summary: "This is a cool mod.",
            markdown: "## Cool Mod\n\nThis mod is really cool because...",
            website: "",
            website_token_path: "",
            image: "ipfs://QmCoolModImageHash",
            is_minter: false,
        }

        await expectToThrow(publish('seller', freezer.name.toString(), ['transfer'], 0, details, 'tester'), 'missing required authority seller');
        // price is a uint64_t, so negative values are not possible
        // await expectToThrow(publish('seller', freezer.name.toString(), -100_0000, details), 'eosio_assert: Price must be positive');
        await expectToThrow(publish('seller', 'nonexistent', ['transfer'], 100_0000, details), 'eosio_assert: Contract account does not exist');
        await expectToThrow(publish('seller', 'no.mod', ['transfer'], 100_0000, details), 'eosio_assert: No contract deployed at the given account');
        await expectToThrow(publish('seller', freezer.name.toString(), ['transfer'], 100_0000, details), 'eosio_assert: Mod already published');


        await transfer('tester', 'seller', '100.0000 A');
        await transfer('seller', market.name.toString(), '99.0000 A');
        await expectToThrow(publish('seller', freezer2.name.toString(), ['transfer'], 200_0000, details), 'eosio_assert: Insufficient balance for fee payment');
        await transfer('seller', market.name.toString(), '1.0000 A');
        await publish('seller', freezer2.name.toString(), ['transfer'], 200_0000, details, 'seller');
    });
    it('should be able to create a totem with mods', async () => {
        await transfer('tester', 'creator', '400.0000 A');
        await transfer('creator', contract.name.toString(), '400.0000 A');

        await expectToThrow(create('4,MODTEST', [{
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '500.0000 MODTEST'
            }], totemMods({
                transfer: ['nonexistent']
            })
        ), 'eosio_assert: Mod is not published in market');

        await create('4,MODTEST', [
            {
                label: 'Founding Team',
                recipient: 'minter',
                quantity: '500.0000 MODTEST'
            }
        ], totemMods({
            transfer: [freezer.name.toString()]
        }));

        const totems = JSON.parse(JSON.stringify(await contract.tables.totems(nameToBigInt(contract.name.toString())).getTableRows()));
        // console.log(JSON.stringify(totems, null, 4));
        assert(totems.length === 2, "Totem should be created");
        assert(totems[1].supply === '500.0000 MODTEST', "Totem should have correct supply");
        assert(totems[1].max_supply === '500.0000 MODTEST', "Totem should have correct max supply");
        assert(modsLength(totems[1]) === 1, "Totem should have 1 mod");
        assert(totems[1].mods.transfer[0] === freezer.name.toString(), "Totem should have correct mod contract");

        // ensure there's two backwards compat tokens as well (stat table)
        // @ts-ignore
        assert(!!await contract.tables.stat(symbolCodeToBigInt(Asset.SymbolCode.from('TEST'))).getTableRows()[0],
            "Totem stat table should have entry for TEST");

        // @ts-ignore
        assert(!!await contract.tables.stat(symbolCodeToBigInt(Asset.SymbolCode.from('MODTEST'))).getTableRows()[0],
            "Totem stat table should have entry for MODTEST");
    });
    it('should be able to transfer and burn totems', async () => {
        await contract.actions.transfer(['minter', 'tester', '50.0000 MODTEST', '']).send('minter');
        assert(getTotemBalance('tester', 'MODTEST') === 50, "Tester should have 50 MODTEST");
        assert(getTotemBalance('minter', 'MODTEST') === 450, "Minter should have 450 MODTEST");

        await contract.actions.burn(['tester', '20.0000 MODTEST', '']).send('tester');
        assert(getTotemBalance('tester', 'MODTEST') === 30, "Tester should have 30 MODTEST after burn");

        // supply should have decreased
        const totems = JSON.parse(JSON.stringify(await contract.tables.totems(nameToBigInt(contract.name.toString())).getTableRows()));
        assert(totems[1].supply === '480.0000 MODTEST', "Totem should have correct supply after burn");
        assert(totems[1].max_supply === '500.0000 MODTEST', "Totem should have correct max supply after burn");
    });
    it('should be able to test mod transfer, burn, open, and mint', async () => {
        const toggleMod = async () => {
            return testmod.actions.toggle().send('tester');
        }
        await transfer('tester', 'seller', '100.0000 A');
        await transfer('seller', market.name.toString(), '100.0000 A');
        await publish('seller', testmod.name.toString(), [
            'transfer',
            'mint',
            'burn',
            'open',
            'close',
            'created'
        ], 1_0000, {
            name: "Test Mod",
            summary: "This is a test mod that can fail actions.",
            markdown: "",
            website: "",
            website_token_path: "",
            image: "image",
            is_minter: true,
        })

        const params = [
            '4,MODDED', [
                {
                    label: 'Test',
                    recipient: 'tester',
                    quantity: '100.0000 MODDED'
                },
                {
                    label: 'Test',
                    recipient: testmod.name.toString(),
                    quantity: '100.0000 MODDED',
                    is_minter: true
                }
            ], totemMods({
                transfer: [testmod.name.toString()],
                burn: [testmod.name.toString()],
                open: [testmod.name.toString()],
                mint: [testmod.name.toString()],
                close: [testmod.name.toString()],
                created: [testmod.name.toString()]
            }),
            'creator'
        ]

        await toggleMod();
        // @ts-ignore
        await expectToThrow(create(...params), 'eosio_assert: Mod is set to fail all actions');

        await toggleMod();
        // @ts-ignore
        await create(...params);

        // Transfer
        {
            await contract.actions.transfer(['tester', 'holder', '1.0000 MODDED', '']).send('tester');
            await toggleMod();
            await expectToThrow(contract.actions.transfer(['holder', 'tester', '1.0000 MODDED', '']).send('holder'), 'eosio_assert: Mod is set to fail all actions');
            await toggleMod();
        }
        // Burn
        {
            await contract.actions.burn(['tester', '1.0000 MODDED', '']).send('tester');
            await toggleMod();
            await expectToThrow(contract.actions.burn(['tester', '1.0000 MODDED', '']).send('tester'), 'eosio_assert: Mod is set to fail all actions');
            await toggleMod();
        }
        // Open
        {
            await contract.actions.open(['tester', '4,MODDED', 'tester']).send('tester');
            await toggleMod();
            await expectToThrow(contract.actions.open(['holder', '4,MODDED', 'holder']).send('holder'), 'eosio_assert: Mod is set to fail all actions');
            await toggleMod();
        }
        // Mint
        {
            await contract.actions.mint([testmod.name.toString(), 'creator', '10.0000 MODDED', '1.0000 EOS', '']).send('creator');
            await toggleMod();
            await expectToThrow(contract.actions.mint([testmod.name.toString(), 'creator', '10.0000 MODDED', '1.0000 EOS', '']).send('creator'), 'eosio_assert: Mod is set to fail all actions');
            await toggleMod();
        }
        // Close
        {
            await contract.actions.transfer(['tester', 'holder', '98.0000 MODDED', '']).send('tester');
            await toggleMod();
            await expectToThrow(contract.actions.close(['tester', '4,MODDED']).send('tester'), 'eosio_assert: Mod is set to fail all actions');
            await toggleMod();
            await contract.actions.close(['tester', '4,MODDED']).send('tester');
        }
    });
    it('should not be able to add mods with restricted action requirements', async () => {
        await transfer('tester', 'seller', '100.0000 A');
        await transfer('seller', market.name.toString(), '100.0000 A');

        const details = {
            name: "Test Mod",
            summary: "This is a test mod that requires restricted actions.",
            markdown: "",
            website: "",
            website_token_path: "",
            image: "image",
            is_minter: false,
        }

        const restrictedCoreActions = [
            'updateauth',
            'deleteauth',
            'linkauth',
            'unlinkauth',
        ];

        for(const action of restrictedCoreActions){
            for(let _contract of ['eosio', 'core.vaulta']){
                const required_actions = [{
                    hook: 'transfer',
                    actions:[
                        {
                            contract: 'eosio',
                            action: action,
                            fields: [],
                            purpose: 'Test restricted action'
                        }
                    ]
                }];

                await expectToThrow(publish('seller', restricted.name.toString(), ['transfer'], 1_0000,
                        details, 'seller', undefined, required_actions),
                    `eosio_assert_message: Usage of restricted action ${action} is not allowed in mods`);
            }
        }
    });


    it('should verify all Mod details are stored properly', async () => {
        await transfer('tester', 'seller', '100.0000 A');
        await transfer('seller', market.name.toString(), '100.0000 A');

        const modDetails = {
            name: "Complete Mod Name",
            summary: "This is a comprehensive summary of the mod functionality.",
            markdown: "## Complete Mod\n\nThis mod includes:\n- Feature 1\n- Feature 2",
            website: "https://example.com/mod",
            website_token_path: "/tokens/{ticker}",
            image: "ipfs://QmCompleteModImageHash123",
            is_minter: true,
        };

        await publish('seller', burner.name.toString(), ['burn'], 50_0000, modDetails);

        const mods = JSON.parse(JSON.stringify(await market.tables.mods(nameToBigInt(market.name.toString())).getTableRows()));
        const newMod = mods.find(m => m.contract === burner.name.toString() && m.details.name === "Complete Mod Name");

        assert(newMod !== undefined, "New mod should exist");
        assert(newMod.details.name === modDetails.name, "Mod name should match");
        assert(newMod.details.summary === modDetails.summary, "Mod summary should match");
        assert(newMod.details.markdown === modDetails.markdown, "Mod markdown should match");
        assert(newMod.details.website === modDetails.website, "Mod website should match");
        assert(newMod.details.website_token_path === modDetails.website_token_path, "Mod website_token_path should match");
        assert(newMod.details.image === modDetails.image, "Mod image should match");
        assert(newMod.price === 50_0000, "Mod price should match");
        assert(newMod.seller === 'seller', "Mod seller should match");
        assert(newMod.hooks.includes('burn'), "Mod should have burn hook");
    });

    it('should verify RequiredHook formats and fields', async () => {
        await transfer('tester', 'seller', '100.0000 A');
        await transfer('seller', market.name.toString(), '100.0000 A');
        blockchain.createContract('tempmod', 'build/testmod',  true);

        const modDetails = {
            name: "Mod with Required Actions",
            summary: "This mod requires specific actions.",
            markdown: "## Required Actions Mod",
            website: "",
            website_token_path: "",
            image: "ipfs://QmRequiredActionsHash",
            is_minter: false,
        };

        const serializedAction = await serializeActionFields({
            rpcEndpoint: Chains.Vaulta.url,
            contract: 'core.vaulta',
            action: 'transfer',
            fields: [
                { param: 'from', type: FieldType.SENDER },
                { param: 'to', type: FieldType.STATIC, data: 'seller', min: undefined, max: undefined },
                { param: 'quantity', type: FieldType.DYNAMIC, min: 1, max: 1000 },
                { param: 'memo', type: FieldType.TOTEM }
            ],
            purpose: 'Required transfer for mod functionality',
        });

        const requiredActions = [{
            hook: 'transfer',
            actions: [
                serializedAction
            ]
        }];

        await publish('seller', 'tempmod', ['transfer'], 10_0000, modDetails, 'seller', undefined, requiredActions);

        const mods = JSON.parse(JSON.stringify(await market.tables.mods(nameToBigInt(market.name.toString())).getTableRows()));
        const modWithActions = mods.find(m => m.contract === 'tempmod');

        assert(modWithActions !== undefined, "Mod with required actions should exist");
        assert(modWithActions.required_actions.length === 1, "Should have 1 required hook");
        assert(modWithActions.required_actions[0].hook === 'transfer', "Hook should be transfer");
        assert(modWithActions.required_actions[0].actions.length === 1, "Should have 1 required action");

        const action = modWithActions.required_actions[0].actions[0];
        assert(action.contract === 'core.vaulta', "Action contract should match");
        assert(action.action === 'transfer', "Action name should match");
        assert(action.purpose === 'Required transfer for mod functionality', "Action purpose should match");
        assert(action.fields.length === 4, "Should have 4 fields");
        assert(action.fields[0].param === 'from', "First field param should be 'from'");
        assert(action.fields[0].type === FieldType.SENDER, "First field should be SENDER type");
        assert(action.fields[1].type === FieldType.STATIC, "Second field should be STATIC type");
        assert(action.fields[1].data === uint8ToHex(serializedAction.fields[1].data), "Second field data should be 'seller'");
        assert(action.fields[2].type === FieldType.DYNAMIC, "Third field should be DYNAMIC type");
        assert(action.fields[2].min === 1, "Third field min should be set");
        assert(action.fields[2].max === 1000, "Third field max should be set");
        assert(action.fields[3].type === FieldType.TOTEM, "Fourth field should be TOTEM type");
    });

    it('should verify all Totem fields are stored properly', async () => {
        await transfer('tester', 'creator', '100.0000 A');
        await transfer('creator', contract.name.toString(), '100.0000 A');

        const totemDetails = {
            name: "Comprehensive Totem",
            description: "This is a detailed description of the comprehensive totem with all fields.",
            image: "ipfs://QmComprehensiveTotemHash",
            website: "https://comprehensive-totem.example.com",
            seed: Checksum256.hash('1110762033e7a10db4502359a19a61eb81312834769b8419047a2c9ae03ee847')
        };

        await create('4,COMP', [
            {
                label: 'Initial Distribution',
                recipient: 'holder',
                quantity: '5000.0000 COMP'
            },
            {
                label: 'Team Allocation',
                recipient: 'creator',
                quantity: '3000.0000 COMP'
            },
            {
                label: 'Burner Mod',
                recipient: burner.name.toString(),
                quantity: '8000.0000 COMP',
                is_minter: true
            }
        ], totemMods({
            transfer: [freezer.name.toString()],
            burn: [burner.name.toString()]
        }), 'creator', totemDetails);

        const totems = JSON.parse(JSON.stringify(await contract.tables.totems(nameToBigInt(contract.name.toString())).getTableRows()));
        const compTotem = totems.find(t => t.supply.includes('COMP'));

        assert(compTotem !== undefined, "COMP totem should exist");

        // Verify Totem basic fields
        assert(compTotem.creator === 'creator', "Creator should match");
        assert(compTotem.supply === '16000.0000 COMP', "Supply should match");
        assert(compTotem.max_supply === '16000.0000 COMP', "Max supply should match");
        assert(compTotem.created_at !== undefined, "Created_at should be set");

        // Verify TotemDetails
        assert(compTotem.details.name === totemDetails.name, "Totem name should match");
        assert(compTotem.details.description === totemDetails.description, "Totem description should match");
        assert(compTotem.details.image === totemDetails.image, "Totem image should match");
        assert(compTotem.details.website === totemDetails.website, "Totem website should match");
        assert(compTotem.details.seed !== undefined, "Totem seed should be set");

        // Verify MintAllocations
        assert(compTotem.allocations.length === 3, "Should have 3 allocations");
        assert(compTotem.allocations[0].label === 'Initial Distribution', "First allocation label should match");
        assert(compTotem.allocations[0].recipient === 'holder', "First allocation recipient should match");
        assert(compTotem.allocations[0].quantity === '5000.0000 COMP', "First allocation quantity should match");
        assert(compTotem.allocations[1].label === 'Team Allocation', "Second allocation label should match");
        assert(compTotem.allocations[1].recipient === 'creator', "Second allocation recipient should match");
        assert(compTotem.allocations[1].quantity === '3000.0000 COMP', "Second allocation quantity should match");
        assert(compTotem.allocations[2].label === 'Burner Mod', "Third allocation label should match");
        assert(compTotem.allocations[2].recipient === burner.name.toString(), "Third allocation recipient should match");
        assert(compTotem.allocations[2].quantity === '8000.0000 COMP', "Third allocation quantity should match");
        assert(compTotem.allocations[2].is_minter === true, "Third allocation should be marked as minter");

        // Verify TotemMods
        assert(compTotem.mods.transfer.length === 1, "Should have 1 transfer mod");
        assert(compTotem.mods.transfer[0] === freezer.name.toString(), "Transfer mod should match");
        assert(compTotem.mods.burn.length === 1, "Should have 1 burn mod");
        assert(compTotem.mods.burn[0] === burner.name.toString(), "Burn mod should match");
        assert(compTotem.mods.mint.length === 0, "Should have 0 mint mods");
        assert(compTotem.mods.open.length === 0, "Should have 0 open mods");
        assert(compTotem.mods.close.length === 0, "Should have 0 close mods");
        assert(compTotem.mods.created.length === 0, "Should have 0 created mods");
    });

    it('should verify TotemStats are tracked correctly', async () => {
        // Check the stats for COMP token that was created in the previous test
        const stats = JSON.parse(JSON.stringify(await contract.tables.totemstats(nameToBigInt(contract.name.toString())).getTableRows()));
        const compStats = stats.find(s => s.ticker === '4,COMP');

        assert(compStats !== undefined, "COMP stats should exist");
        assert(compStats.ticker === '4,COMP', "Ticker should match");
        assert(compStats.mints === 2, `Minted amount should be 2 from allocations (2 accounts + 1 minter mod)`);
        assert(compStats.burns === 0, "Burned amount should be 0 initially");
        assert(compStats.transfers === 0, "Transfers should be 0 initially");
        assert(compStats.holders === 2, "Holders should be 2 (holder + creator, excluding minter)");

        // Should track transfers
        {
            for(let i = 0; i < 5; i++){
                await contract.actions.transfer(['holder', 'tester', '10.0000 COMP', '']).send('holder');
                await contract.actions.transfer(['tester', 'holder', '10.0000 COMP', '']).send('tester');
            }
            const updatedStats = JSON.parse(JSON.stringify(await contract.tables.totemstats(nameToBigInt(contract.name.toString())).getTableRows()));
            const updatedCompStats = updatedStats.find(s => s.ticker === '4,COMP');

            assert(updatedCompStats.transfers === 10, "Transfers should be 10 after transfers");
        }

        // Should track burns
        {
            await contract.actions.burn(['holder', '1.0000 COMP', '']).send('holder');
            const updatedStats = JSON.parse(JSON.stringify(await contract.tables.totemstats(nameToBigInt(contract.name.toString())).getTableRows()));
            const updatedCompStats = updatedStats.find(s => s.ticker === '4,COMP');

            // one burn from the user, one burn from the burner mod
            assert(updatedCompStats.burns === 2, "Burned amount should be 2 after burn");
        }

    });

    it('should verify balances are correct after totem creation', async () => {
        // Verify balances for COMP token
        assert(getTotemBalance('holder', 'COMP') === 4999, "Holder should have 5000 COMP");
        assert(getTotemBalance('creator', 'COMP') === 3000, "Creator should have 3000 COMP");
        assert(getTotemBalance('burner', 'COMP') === 7999, "Minter should have 2000 COMP");
    });

    it('should not allow duplicate ticker symbols with different precisions', async () => {
        await transfer('tester', 'creator', '100.0000 A');
        await transfer('creator', contract.name.toString(), '100.0000 A');

        // Try to create a token with same symbol but different precision
        // First, TEST already exists with 4 decimals from earlier test
        await expectToThrow(create('5,TEST', [
            {
                label: 'Test',
                recipient: 'creator',
                quantity: '1000.00000 TEST'
            }
        ]), 'eosio_assert: A totem with this symbol already exists');

        // Also try with fewer decimals
        await expectToThrow(create('3,TEST', [
            {
                label: 'Test',
                recipient: 'creator',
                quantity: '1000.000 TEST'
            }
        ]), 'eosio_assert: A totem with this symbol already exists');

        // Verify COMP can't be created again with different precision
        await expectToThrow(create('5,COMP', [
            {
                label: 'Test',
                recipient: 'creator',
                quantity: '1000.00000 COMP'
            }
        ]), 'eosio_assert: A totem with this symbol already exists');

        await expectToThrow(create('3,COMP', [
            {
                label: 'Test',
                recipient: 'creator',
                quantity: '1000.000 COMP'
            }
        ]), 'eosio_assert: A totem with this symbol already exists');
    });

    it('should verify balances after transfers', async () => {
        const initialHolderBalance = getTotemBalance('holder', 'COMP');
        const initialTesterBalance = getTotemBalance('tester', 'COMP');

        await contract.actions.transfer(['holder', 'tester', '100.0000 COMP', '']).send('holder');

        assert(getTotemBalance('holder', 'COMP') === initialHolderBalance - 100, "Holder balance should decrease by 100");
        assert(getTotemBalance('tester', 'COMP') === initialTesterBalance + 100, "Tester balance should increase by 100");
    });

    it('should verify all TotemMods array types', async () => {
        await transfer('tester', 'creator', '300.0000 A');
        await transfer('creator', contract.name.toString(), '300.0000 A');

        // Create a totem with all mod types
        await create('4,ALLMODS', [
            {
                label: 'Test',
                recipient: 'creator',
                quantity: '1000.0000 ALLMODS'
            }
        ], totemMods({
            transfer: [freezer.name.toString()],
            mint: [testmod.name.toString()],
            burn: [testmod.name.toString()],
            open: [testmod.name.toString()],
            close: [testmod.name.toString()],
            created: [testmod.name.toString()]
        }));

        const totems = JSON.parse(JSON.stringify(await contract.tables.totems(nameToBigInt(contract.name.toString())).getTableRows()));
        const allModsTotem = totems.find(t => t.supply.includes('ALLMODS'));

        assert(allModsTotem !== undefined, "ALLMODS totem should exist");
        assert(allModsTotem.mods.transfer.length === 1, "Should have 1 transfer mod");
        assert(allModsTotem.mods.mint.length === 1, "Should have 1 mint mod");
        assert(allModsTotem.mods.burn.length === 1, "Should have 1 burn mod");
        assert(allModsTotem.mods.open.length === 1, "Should have 1 open mod");
        assert(allModsTotem.mods.close.length === 1, "Should have 1 close mod");
        assert(allModsTotem.mods.created.length === 1, "Should have 1 created mod");
        assert(modsLength(allModsTotem) === 6, "Should have 6 total mods");
    });
    it('should have licenses for all published mods', async () => {
        const licenses = JSON.parse(JSON.stringify(await contract.tables.licenses(symbolCodeToBigInt(SymbolCode.from('ALLMODS'))).getTableRows()));
        assert(licenses.length === 2, "There should be 2 licenses for ALLMODS totem");
        assert(!!licenses.find(l => l.mod === freezer.name.toString()), "Freezer license should exist");
        assert(!!licenses.find(l => l.mod === testmod.name.toString()), "Testmod license should exist");

    });
});
