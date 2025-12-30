import {Blockchain} from "@vaulta/vert";
// @ts-ignore
import chai, { assert } from "chai";
import {pushRandomMod, pushRandomTotem, setup, transfer} from "./shared";
import * as bun from "bun";
chai.config.truncateThreshold = 0;
const blockchain = new Blockchain();

const totemsContract = blockchain.createContract('totemstotems', 'build/totems', true);
const eos = blockchain.createContract('eosio.token', 'build/eosio.token', true);
const vaulta = blockchain.createContract('core.vaulta', 'build/core.vaulta',  true,{privileged: true});
const market = blockchain.createContract('modsmodsmods', 'build/market',  true);
const ACCOUNTS = ['tester', 'eosio.fees', 'referrer', 'creator', 'holder.a', 'holder.b', 'holder.c', 'minter', 'seller'];
blockchain.createAccounts(...ACCOUNTS)

let mods:any = {};
let totems:any = {};

describe('Readonly Actions', () => {
    it('Should set up core token contracts', async () => {
        await setup(eos, vaulta, ACCOUNTS.concat([totemsContract.name.toString(), market.name.toString()]));

        // The contracts only care that there IS a balance, not WHO sent it.
        await transfer(vaulta, 'tester', market.name.toString(), '10000.0000 A');
        await transfer(vaulta, 'tester', totemsContract.name.toString(), '10000.0000 A');
    })

    it('Should push 10 mods and 10 totems', async () => {
        for(let i = 0; i < 10; i++){
            const mod = await pushRandomMod(blockchain, market, 'seller');
            mods[mod.name.toString()] = mod;
        }

        for(let i = 0; i < 10; i++){
            const randomMods = Object.keys(mods).sort(() => 0.5 - Math.random()).slice(0, 3);
            const ticker = await pushRandomTotem(totemsContract, 'creator', randomMods);
            totems[ticker] = ticker;
        }

        assert.equal(Object.keys(mods).length, 10);
        assert.equal(Object.keys(totems).length, 10);
    });

    it('should be able to get mods by contract', async () => {
        for(const mod of Object.keys(mods)){
            const result = await market.actions.getmods([[mod]]).send().then(x => {
                return JSON.parse(JSON.stringify(x[0].returnValue));
            });
            const modRows = market.tables.mods().getTableRows();
            const expectedMod = modRows.find((m:any) => m.contract === mod);
            assert.equal(result.mods.length, 1, `Should return 1 mod for contract ${mod}`);
            assert.equal(result.mods[0].contract, mod, `Mod contract should be ${mod}`);
            assert.equal(result.mods[0].seller, expectedMod.seller, `Mod seller should be ${expectedMod.seller}`);
            assert.equal(result.mods[0].price, expectedMod.price, `Mod price should be ${expectedMod.price}`);
            assert.deepEqual(result.mods[0].details, expectedMod.details, `Mod details should match`);
            assert.equal(result.mods[0].referrer, expectedMod.referrer, `Mod referrer should be ${expectedMod.referrer}`);
            assert.equal(result.mods[0].required_actions.length, expectedMod.required_actions.length,
                `Mod required actions length should be ${expectedMod.required_actions.length}`);
        }
    })

    const validateMod = (modResult:any, expectedMod:any) => {
        assert.equal(modResult.contract, expectedMod.contract, `Mod contract should be ${expectedMod.contract}`);
        assert.equal(modResult.seller, expectedMod.seller, `Mod seller should be ${expectedMod.seller}`);
        assert.equal(modResult.price, expectedMod.price, `Mod price should be ${expectedMod.price}`);
        assert.deepEqual(modResult.details, expectedMod.details, `Mod details should match`);
        assert.equal(modResult.referrer, expectedMod.referrer, `Mod referrer should be ${expectedMod.referrer}`);
        assert.equal(modResult.required_actions.length, expectedMod.required_actions.length,
            `Mod required actions length should be ${expectedMod.required_actions.length}`);
    }

    it('should be able to get multiple mods by contracts', async () => {
        const result = await market.actions.getmods([Object.keys(mods)]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(result.mods.length, Object.keys(mods).length, `Should return all mods`);
        assert(result.mods.every((mod:any) => Object.keys(mods).includes(mod.contract)), 'All returned mods should be in the original mods');
        for(const mod of result.mods){
            const expectedMod = market.tables.mods().getTableRows().find((m:any) => m.contract === mod.contract);
            validateMod(mod, expectedMod);
        }
    })

    it('should be able to list mods', async () => {
        const firstBatch = await market.actions.listmods([5, null]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(firstBatch.mods.length, 5, `Should return 5 mods`);
        assert(firstBatch.mods.every((mod:any) => Object.keys(mods).includes(mod.contract)), 'All returned mods should be in the original mods');
        for(const mod of firstBatch.mods){
            const expectedMod = market.tables.mods().getTableRows().find((m:any) => m.contract === mod.contract);
            validateMod(mod, expectedMod);
        }

        const secondBatch = await market.actions.listmods([5, firstBatch.cursor]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });

        assert.equal(secondBatch.mods.length, 5, `Should return 5 mods`);
        assert(secondBatch.mods.every((mod:any) => Object.keys(mods).includes(mod.contract)), 'All returned mods should be in the original mods');
        for(const mod of secondBatch.mods){
            assert.isFalse(firstBatch.mods.some((m:any) => m.contract === mod.contract), `Mod ${mod.contract} should not be in the first batch`);
            const expectedMod = market.tables.mods().getTableRows().find((m:any) => m.contract === mod.contract);
            validateMod(mod, expectedMod);
        }
    })

    it('should be able to get totems by tickers', async () => {
        const firstBatch = await market.actions.listmods([5, null]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(firstBatch.mods.length, 5, `Should return 5 mods`);
        assert(firstBatch.mods.every((mod:any) => Object.keys(mods).includes(mod.contract)), 'All returned mods should be in the original mods');
        for(const mod of firstBatch.mods){
            const expectedMod = market.tables.mods().getTableRows().find((m:any) => m.contract === mod.contract);
            validateMod(mod, expectedMod);
        }

        const secondBatch = await market.actions.listmods([5, firstBatch.cursor]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });

        assert.equal(secondBatch.mods.length, 5, `Should return 5 mods`);
        assert(secondBatch.mods.every((mod:any) => Object.keys(mods).includes(mod.contract)), 'All returned mods should be in the original mods');
        for(const mod of secondBatch.mods){
            assert.isFalse(firstBatch.mods.some((m:any) => m.contract === mod.contract), `Mod ${mod.contract} should not be in the first batch`);
            const expectedMod = market.tables.mods().getTableRows().find((m:any) => m.contract === mod.contract);
            validateMod(mod, expectedMod);
        }
    })

    it('should be able to get totems by tickers', async () => {
        for(const ticker of Object.keys(totems)){
            const result = await totemsContract.actions.gettotems([[ticker]]).send().then(x => {
                return JSON.parse(JSON.stringify(x[0].returnValue));
            });
            const parsedTicker = result.results[0].totem.max_supply.split(' ')[1];
            const decimals = parseInt(result.results[0].totem.max_supply.split('.')[1].split(' ')[0].length);
            const totemRows = totemsContract.tables.totems().getTableRows();
            const expectedTotem = totemRows.find((t:any) => t.max_supply === result.results[0].totem.max_supply);
            assert.equal(result.results.length, 1, `Should return 1 totem for ticker ${ticker}`);
            assert.equal(parsedTicker, ticker, `Totem ticker should be ${ticker}`);
            assert.equal(decimals, 4, `Totem decimals should be 4`);
            assert.equal(result.results[0].totem.creator, expectedTotem.creator, `Totem creator should be ${expectedTotem.creator}`);
            assert.equal(result.results[0].totem.max_supply, expectedTotem.max_supply, `Totem max_supply should be ${expectedTotem.max_supply}`);
            assert.deepEqual(result.results[0].totem.allocations, expectedTotem.allocations, `Totem allocations should match`);
            assert.deepEqual(result.results[0].totem.mods, expectedTotem.mods, `Totem mods should match`);
            assert.deepEqual(result.results[0].totem.details, expectedTotem.details, `Totem details should match`);
        }
    })

    it('should be able to get multiple totems by tickers', async () => {
        const result = await totemsContract.actions.gettotems([Object.keys(totems)]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(result.results.length, Object.keys(totems).length, `Should return all totems`);
        assert(result.results.every(({totem}) => Object.keys(totems).includes(totem.max_supply.split(' ')[1])), 'All returned totems should be in the original totems');
        for(const bundle of result.results){
            const {totem} = bundle;
            const expectedTotem = totemsContract.tables.totems().getTableRows().find((t:any) => t.max_supply === totem.max_supply);
            const parsedTicker = totem.max_supply.split(' ')[1];
            const decimals = parseInt(totem.max_supply.split('.')[1].split(' ')[0].length);
            assert.equal(parsedTicker, expectedTotem.max_supply.split(' ')[1], `Totem ticker should be ${expectedTotem.max_supply.split(' ')[1]}`);
            assert.equal(decimals, 4, `Totem decimals should be 4`);
            assert.equal(totem.creator, expectedTotem.creator, `Totem creator should be ${expectedTotem.creator}`);
            assert.equal(totem.max_supply, expectedTotem.max_supply, `Totem max_supply should be ${expectedTotem.max_supply}`);
            assert.deepEqual(totem.allocations, expectedTotem.allocations, `Totem allocations should match`);
            assert.deepEqual(totem.mods, expectedTotem.mods, `Totem mods should match`);
            assert.deepEqual(totem.details, expectedTotem.details, `Totem details should match`);
        }
    });

    it('should be able to list totems', async () => {
        const firstBatch = await totemsContract.actions.listtotems([5, null]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(firstBatch.results.length, 5, `Should return 5 totems`);
        assert(firstBatch.results.every(({totem}) => Object.keys(totems).includes(totem.max_supply.split(' ')[1])), 'All returned totems should be in the original totems');
        for(const bundle of firstBatch.results){
            const {totem} = bundle;
            const expectedTotem = totemsContract.tables.totems().getTableRows().find((t:any) => t.max_supply === totem.max_supply);
            const parsedTicker = totem.max_supply.split(' ')[1];
            const decimals = parseInt(totem.max_supply.split('.')[1].split(' ')[0].length);
            assert.equal(parsedTicker, expectedTotem.max_supply.split(' ')[1], `Totem ticker should be ${expectedTotem.max_supply.split(' ')[1]}`);
            assert.equal(decimals, 4, `Totem decimals should be 4`);
            assert.equal(totem.creator, expectedTotem.creator, `Totem creator should be ${expectedTotem.creator}`);
            assert.equal(totem.max_supply, expectedTotem.max_supply, `Totem max_supply should be ${expectedTotem.max_supply}`);
            assert.deepEqual(totem.allocations, expectedTotem.allocations, `Totem allocations should match`);
            assert.deepEqual(totem.mods, expectedTotem.mods, `Totem mods should match`);
            assert.deepEqual(totem.details, expectedTotem.details, `Totem details should match`);
        }

        const secondBatch = await totemsContract.actions.listtotems([5, firstBatch.cursor]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });

        assert.equal(secondBatch.results.length, 5, `Should return 5 totems`);
        assert(secondBatch.results.every(({totem}) => Object.keys(totems).includes(totem.max_supply.split(' ')[1])), 'All returned totems should be in the original totems');
        for(const bundle of secondBatch.results){
            const {totem} = bundle;
            assert.isFalse(firstBatch.results.some(({totem:t}) => t.max_supply === totem.max_supply), `Totem ${totem.max_supply} should not be in the first batch`);
            const expectedTotem = totemsContract.tables.totems().getTableRows().find((t:any) => t.max_supply === totem.max_supply);
            const parsedTicker = totem.max_supply.split(' ')[1];
            const decimals = parseInt(totem.max_supply.split('.')[1].split(' ')[0].length);
            assert.equal(parsedTicker, expectedTotem.max_supply.split(' ')[1], `Totem ticker should be ${expectedTotem.max_supply.split(' ')[1]}`);
            assert.equal(decimals, 4, `Totem decimals should be 4`);
            assert.equal(totem.creator, expectedTotem.creator, `Totem creator should be ${expectedTotem.creator}`);
            assert.equal(totem.max_supply, expectedTotem.max_supply, `Totem max_supply should be ${expectedTotem.max_supply}`);
            assert.deepEqual(totem.allocations, expectedTotem.allocations, `Totem allocations should match`);
            assert.deepEqual(totem.mods, expectedTotem.mods, `Totem mods should match`);
            assert.deepEqual(totem.details, expectedTotem.details, `Totem details should match`);
        }
    });

    it('should be able to get balances', async () => {
        for(const ticker of Object.keys(totems)){
            await transfer(totemsContract, 'creator', 'holder.a', `100.0001 ${ticker}`);
            await transfer(totemsContract, 'creator', 'holder.b', `200.0002 ${ticker}`);
            await transfer(totemsContract, 'creator', 'holder.c', `300.0003 ${ticker}`);
        }

        const firstBatchTickers = Object.keys(totems).slice(0, 5);
        for(const account of ['holder.a', 'holder.b', 'holder.c']){
            const result = await totemsContract.actions.getbalances([[account], firstBatchTickers]).send().then(x => {
                return JSON.parse(JSON.stringify(x[0].returnValue));
            });

            const expectedBalance = account === 'holder.a' ? '100.0001' : account === 'holder.b' ? '200.0002' : '300.0003';
            assert.equal(result.balances.length, firstBatchTickers.length, `Should return balances for all requested totems for account ${account}`);
            for(const balance of result.balances){

                assert.equal(balance.account, account, `Balance account should be ${account}`);
                assert.equal(balance.balance.split(' ')[0], expectedBalance, `Balance for ${balance.balance.split(' ')[1]} should be ${expectedBalance}`);
            }
        }

        const secondBatchTickers = Object.keys(totems).slice(5);
        for(const account of ['holder.a', 'holder.b', 'holder.c']){
            const result = await totemsContract.actions.getbalances([[account], secondBatchTickers]).send().then(x => {
                return JSON.parse(JSON.stringify(x[0].returnValue));
            });

            const expectedBalance = account === 'holder.a' ? '100.0001' : account === 'holder.b' ? '200.0002' : '300.0003';
            assert.equal(result.balances.length, secondBatchTickers.length, `Should return balances for all requested totems for account ${account}`);
            for(const balance of result.balances){

                assert.equal(balance.account, account, `Balance account should be ${account}`);
                assert.equal(balance.balance.split(' ')[0], expectedBalance, `Balance for ${balance.balance.split(' ')[1]} should be ${expectedBalance}`);
            }
        }

        const allBalances = await totemsContract.actions.getbalances([['holder.a'], []]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });
        assert.equal(allBalances.balances.length, Object.keys(totems).length, `Should return balances for all totems for holder.a`);
        for(const balance of allBalances.balances){
            assert.equal(balance.account, 'holder.a', `Balance account should be holder.a`);
            assert.equal(balance.balance.split(' ')[0], '100.0001', `Balance for ${balance.balance.split(' ')[1]} should be 100.0001`);
        }
    })

    it('should be able to get multiple balances for multiple accounts', async () => {
        const tickers = Object.keys(totems).slice(0,3);
        const accounts = ['holder.a', 'holder.b', 'holder.c'];
        const result = await totemsContract.actions.getbalances([accounts, tickers]).send().then(x => {
            return JSON.parse(JSON.stringify(x[0].returnValue));
        });

        assert.equal(result.balances.length, accounts.length * tickers.length, `Should return balances for all requested totems and accounts`);
        for(const account of accounts){
            const expectedBalance = account === 'holder.a' ? '100.0001' : account === 'holder.b' ? '200.0002' : '300.0003';
            for(const ticker of tickers){
                const balance = result.balances.find((b:any) => b.account === account && b.balance.split(' ')[1] === ticker);
                assert.isDefined(balance, `Balance for account ${account} and ticker ${ticker} should be defined`);
                assert.equal(balance.balance.split(' ')[0], expectedBalance, `Balance for ${ticker} should be ${expectedBalance}`);
            }
        }
    })
});
