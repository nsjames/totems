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
    "contracts/interfaces/mod.interface.hpp"
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

const handlers = actions
    .map(
        ({ name, params }) => `
    [[eosio::on_notify(TOTEMS_${name.toUpperCase()}_NOTIFY)]]
    void on_${name}(${params});`
    )
    .join("\n");

const output = `#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <string>

using namespace eosio;
using std::string;

class [[eosio::contract("mod")]] mod : public contract {
   public:
    using contract::contract;

    ${handlers}
};
`;

fs.writeFileSync(OUTPUT, output);
console.log("✅ mod.interface.hpp generated from totems.hpp");
