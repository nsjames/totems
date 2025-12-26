import {deployContract} from "../tools/deployer";
import {Chains, PrivateKey, Session} from "@wharfkit/session";
import {WalletPluginPrivateKey} from "@wharfkit/wallet-plugin-privatekey";
import {TransactPluginResourceProvider} from "@wharfkit/transact-plugin-resource-provider";
import {TransactPluginAutoCorrect} from '@wharfkit/transact-plugin-autocorrect'

const publicKey = PrivateKey.from(process.env.JUNGLE_KEY).toPublic();

const sessionParams = {
    chain: Chains.Jungle4,
    walletPlugin: new WalletPluginPrivateKey(process.env.JUNGLE_KEY),
    transactPlugins: [
        new TransactPluginResourceProvider(),
        new TransactPluginAutoCorrect(),
    ],
    permission: 'active',
}

const randomName = () => {
    // 12 char name (a-z, 1-5)
    const chars = 'abcdefghijklmnopqrstuvwxyz12345';
    let name = '';
    for (let i = 0; i < 12; i++) {
        name += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return name;
}

const createAccount = async () => {
    const name = randomName();
    const session = new Session(Object.assign(sessionParams, {
        actor: 'modsmodsmods',
    }));
    await session.transact({
        actions: [
            {
                account: 'eosio',
                name: 'newaccount',
                authorization: [{
                    actor: session.actor,
                    permission: 'active',
                }],
                data: {
                    creator: session.actor.toString(),
                    name: name,
                    owner: {
                        threshold: 1,
                        keys: [{
                            key: publicKey.toString(),
                            weight: 1
                        }],
                        accounts: [],
                        waits: []
                    },
                    active: {
                        threshold: 1,
                        keys: [{
                            key: publicKey.toString(),
                            weight: 1
                        }],
                        accounts: [],
                        waits: []
                    }
                }
            },
            {
                account: 'eosio',
                name: 'buyrambytes',
                authorization: [{
                    actor: session.actor,
                    permission: 'active',
                }],
                data: {
                    payer: session.actor.toString(),
                    receiver: name,
                    bytes: 8192,
                }
            }
        ]
    });
    return name;
}

const powerupAccount = async (account:string) => {
    const session = new Session(Object.assign(sessionParams, {
        actor: 'modsmodsmods',
    }));

    await session.transact({
        actions: [
            {
                account: 'eosio',
                name: 'powerup',
                authorization: [{
                    actor: session.actor,
                    permission: 'active',
                }],
                data: {
                    payer: session.actor.toString(),
                    receiver: account,
                    days: 1,
                    net_frac: 100000000000,
                    cpu_frac: 100000000000,
                    max_payment: '1.0000 EOS',
                }
            }
        ]
    });
}

const deployFreezer = async (account:string) => {
    const session = new Session(Object.assign(sessionParams, {
        actor: account,
    }));

    await deployContract(
        session,
        './build/freezer.wasm',
        './build/freezer.abi',
        account
    );
}


(async() => {
    const account = await createAccount();
    console.log(`Created account: ${account}`);
    await powerupAccount(account);
    await deployFreezer(account);
})();