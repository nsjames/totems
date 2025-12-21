import {Checksum256} from "@wharfkit/antelope";
import {nameToBigInt} from "@vaulta/vert";
import {assert} from "chai";

export const totemMods = (obj:any = {}) => Object.assign({
    transfer:[],
    mint:[],
    burn:[],
    open:[],
    close:[],
    created:[]
}, obj);

export const create = async (totems, ticker, allocations, mods = totemMods(), authorizer = 'creator', details = undefined, referrer = undefined) => {
    return totems.actions.create([
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

export interface ModDetails {
    name: string;
    summary: string;
    markdown: string;
    website: string;
    website_token_path: string;
    image: string;
}

export const publish = async (market, seller:string, contract:string, hooks:string[], price:number, details:ModDetails, authorizer = 'seller', referrer = undefined,
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

export const transfer = (token, from, to, quantity) => {
    return token.actions.transfer([from, to, quantity, ""]).send(from);
}

export const getBalance = (contract, account) => {
    const table = contract.tables.accounts(nameToBigInt(account));
    const rows = table.getTableRows();
    return rows.length ? parseFloat(rows[0].balance.split(' ')[0]) : 0;
}

export const getTotemBalance = (totems, account, ticker) => {
    const table = totems.tables.accounts(nameToBigInt(account));
    const rows = table.getTableRows();
    for (const row of rows) {
        if (row.balance.includes(ticker)) {
            return parseFloat(row.balance.split(' ')[0]);
        }
    }
    return 0;
}

export const modsLength = (totem) => {
    return Object.keys(totem.mods).reduce((acc, key) => acc + totem.mods[key].length, 0);
}

export const setup = async (eos:any, vaulta:any, recipients:string[]) => {
    await eos.actions.create(['tester', '1000000000.0000 EOS']).send('eosio.token');
    await eos.actions.issue(['tester', '1000000000.0000 EOS', 'initial supply']).send('tester');

    await vaulta.actions.init(['1000000000.0000 A']).send('core.vaulta');
    await eos.actions.transfer(['tester', 'core.vaulta', '500000000.0000 EOS', '']).send('tester');

    assert(getBalance(eos, 'tester') === 500000000);
    assert(getBalance(vaulta, 'core.vaulta') === 500000000);

    for(const account of recipients){
        await vaulta.actions.open([account, '4,A', account]).send(account);
        await eos.actions.open([account, '4,EOS', account]).send(account);
    }
}

const generateRandomString = (min, max) => {
    const length = Math.floor(Math.random() * (max - min + 1)) + min;
    let ticker = '';
    for (let i = 0; i < length; i++) {
        ticker += String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }
    return ticker;
}

export const pushRandomMod = async (blockchain, market, seller:string) => {
    const account = 'mod.'+(generateRandomString(8,8)).toLowerCase();
    const contract = blockchain.createContract(account, 'build/testmod', true);

    await publish(market, seller, account, ['transfer'], Math.floor(Math.random()*1000), {
        name: `Mod ${account}`,
        summary: 'This is a random mod.',
        markdown: '',
        image: '',
        website: '',
        website_token_path: '',
    }, seller);

    return contract;
}

export const pushRandomTotem = async (totems, creator:string, transferMods:string[]) => {
    const ticker = generateRandomString(2,6);
    await create(totems, `4,${ticker}`, [
        {
            label: 'Initial Supply',
            recipient: creator,
            quantity: `10000.0000 ${ticker}`,
            isMinter: false,
        }
    ], totemMods({
        transfer: transferMods
    }), creator);

    return ticker;
}