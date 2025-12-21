// @ts-ignore
import fs from "fs";
// @ts-ignore
import path from "path";

const ROOT = process.cwd();

const INPUT = path.join(
    ROOT,
    "contracts/totems/include/totems/totems.hpp"
);

const OUTPUT = path.join(
    ROOT,
    "contracts/simulator/devtotem.cpp"
);

const ALLOWED_ACTIONS = new Set([
    "created",
    "mint",
    "burn",
    "transfer",
    "open",
    "close",
]);

const source = fs.readFileSync(INPUT, "utf8");

/**
 * Matches:
 * [[eosio::action]]
 * void action_name(type a, type b, ...)
 */
const ACTION_REGEX =
    /\[\[eosio::action[^\]]*\]\]\s*void\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;

type Action = {
    name: string;
    params: string;
};

const actions: Action[] = [];
let match: RegExpExecArray | null;

while ((match = ACTION_REGEX.exec(source))) {
    const name = match[1];
    const params = match[2].trim();

    if (ALLOWED_ACTIONS.has(name)) {
        actions.push({ name, params });
    }
}

if (actions.length === 0) {
    throw new Error("No matching eosio::action methods found");
}

const buildAction = ({ name, params }: Action) => {
    const paramList = params
        ? name === 'mint' ? `${params}, const std::vector<name>& minters, const std::vector<name>& mods`
        : `${params}, const std::vector<name>& mods`
        : `const std::vector<name>& mods`;

    if (name === "mint") {
        return `
    ACTION ${name}(${paramList}) {
        for (const auto& minter : minters) {
            action(
                permission_level{get_self(), "active"_n},
                minter,
                "mint"_n,
                std::make_tuple(${params.split(",").map(p => p.trim().split(" ").pop()).join(", ")})
            ).send();
        }
        notify_mods(mods);
    }`;
    }

    return `
    ACTION ${name}(${paramList}) {
        notify_mods(mods);
    }`;
};

const actionImpls = actions.map(buildAction).join("\n");

const output = `#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <vector>
#include <string>

using namespace eosio;
using std::string;

CONTRACT devtotem : public contract {
public:
    using contract::contract;
${actionImpls}

private:
    void notify_mods(const std::vector<name>& mods) {
        for (const auto& mod : mods) {
            require_recipient(mod);
        }
    }
};
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, output);

console.log("✅ devtotem.cpp simulator generated from totems.hpp");
