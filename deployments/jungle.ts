import {deployContract} from "../tools/deployer";
import {Chains, Session} from "@wharfkit/session";
import {WalletPluginPrivateKey} from "@wharfkit/wallet-plugin-privatekey";
import {TransactPluginResourceProvider} from "@wharfkit/transact-plugin-resource-provider";
import {TransactPluginAutoCorrect} from '@wharfkit/transact-plugin-autocorrect'

const sessionParams = {
    chain: Chains.Jungle4,
    walletPlugin: new WalletPluginPrivateKey(process.env.JUNGLE_KEY),
    transactPlugins: [
        new TransactPluginResourceProvider(),
        new TransactPluginAutoCorrect(),
    ],
    permission: 'active',
}

const deployTotems = async () => {
    const account = 'totemstotems';
    const session = new Session(Object.assign(sessionParams, {
        actor: account,
    }));

    await deployContract(
        session,
        './build/totems.wasm',
        './build/totems.abi',
        account
    );
}

const deployMarket = async () => {
    const account = 'modsmodsmods';
    const session = new Session(Object.assign(sessionParams, {
        actor: account,
    }));

    await deployContract(
        session,
        './build/market.wasm',
        './build/market.abi',
        account
    );
}

(async() => {
    await deployTotems();
    await deployMarket();
})();