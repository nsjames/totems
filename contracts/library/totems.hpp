#pragma once
#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/crypto.hpp>
#include <string>
#include <vector>
using namespace eosio;

/*
 * Totems Library
 * ----------------
 * This library gives you access to Totems-specific constants, structures, and helper functions.
 * Use these in your mods/contracts to interact with the Totems ecosystem.
 * ----------------
 * > Note about contract size: Don't worry about this adding to your contract size, as long as you only use what you need from it.
 * > I tested this with an empty contract with and without the library and it only adds 83 bytes
 * > or +0.0264 A or $0.0043619 at the time of writing this doc.
 * ----------------
 * > Note about table definitions: The tables here WILL NOT be put into your ABI. They are only used
 * > for reading data from the Totems and Mods contracts. Your contract's ABI will only include tables
 * > that you define in your own contract.
 * ----------------
 */

// Use these for your on_notify instead of hardcoding them so that
// when this contract changes networks (jungle -> vaulta) you can just update your library file.
// example: [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
#define TOTEMS_TRANSFER_NOTIFY "totemstotems::transfer"
#define TOTEMS_MINT_NOTIFY "totemstotems::mint"
#define TOTEMS_BURN_NOTIFY "totemstotems::burn"
#define TOTEMS_OPEN_NOTIFY "totemstotems::open"
#define TOTEMS_CLOSE_NOTIFY "totemstotems::close"
#define TOTEMS_CREATED_NOTIFY "totemstotems::created"


namespace totems {

	// Smart contract constants, make sure you get the right library for your network!
	static const name MARKET_CONTRACT = "modsmodsmods"_n;
	static const name TOTEMS_CONTRACT = "totemstotems"_n;
	static const name PROXY_MOD_CONTRACT = "totemodproxy"_n;

	/* ---------------- MOD MARKET ---------------- */

	// Defines the type of param in required_actions
	// (this apparently doesn't work with ABI generation, so it's here as a helper/source-of-truth only)
	enum FieldType : uint8_t {
		// A field that will always be the executing account
	    SENDER = 0,
	    // A user provided field (requires input)
	    DYNAMIC = 1,
	    // A field that is always the same value (mod-specified)
	    STATIC = 2,
	    // A field that will always be the ticker itself
	    TOTEM = 3
	    // To ignore a property, simply do not specify it here.
	    // Any ignored property should be able to be empty (like `memo` on a transfer action)
	};

	// Defines a field in a required action
	// Every field that is DYNAMIC will have a `data` property, all others will not.
	// The data property is a serialized version of the field value.
	struct ActionField {
		// The parameter name in the action (`from`, `to`, `quantity`, etc)
	    std::string param;
		// Refers to FieldType enum
	    uint8_t type;
	    // Serialized data if STATIC, or empty
        std::vector<char> data;
	    // Byte layout for being able to find and compare the field in the action data
	    uint16_t offset;
	    uint16_t size;
	    // Only used off-chain for DYNAMIC fields to define acceptable ranges/lengths
	    std::optional<uint64_t> min;
	    std::optional<uint64_t> max;
	};

	// Defines a single required action in a hook or mod setup process
	// Example: contract: eosio, action: buyrambytes, fields: [...]
	// Use the `/tools/serializer.ts` to help generate the inputs for these
	struct RequiredAction {
	    name contract;
	    name action;
	    std::vector<ActionField> fields;
	    std::string purpose;
	};

	// Specify a hook and the required actions for that hook.
	// Can only have one entry per hook per mod, but many actions per hook.
	struct RequiredHook {
	    name hook;
	    // Every required action here will be created with the transaction
	    // that the user needs to sign to use the mod for this hook
	    std::vector<RequiredAction> actions;
	};

	// Display details for a mod to be used by UI interfaces
	struct ModDetails {
	    std::string name;
	    std::string summary;
	    // Markdown gives modders extreme flexibility to describe their mods,
	    // which shows up on the Mod Market UIs for their Mod.
	    std::string markdown;
	    std::string image;
	    // https://your.website.com
	    std::string website;
	    // /path/to/{token_ticker}
	    // This is used for things like minters so UIs can point users to things like:
	    // https://website.com/minters/miner/TICKER
	    std::string website_token_path;
	    // Whether or not this mod contract is also a minter for totems
	    bool is_minter = false;
	};

	// On-chain Mod entry in the market
	struct [[eosio::table]] Mod {
	    name contract;
	    name seller;
	    uint64_t price;
	    ModDetails details;
	    // TODO: Remove this
	    int64_t score;
	    std::set<name> hooks;
	    std::vector<RequiredHook> required_actions;
	    time_point_sec published_at;
	    time_point_sec updated_at;

	    bool has_hook(const name& hook_name) const {
	        return std::find(hooks.begin(), hooks.end(), hook_name) != hooks.end();
	    }

	    uint64_t primary_key() const { return contract.value; }
	};

	typedef eosio::multi_index<"mods"_n, Mod> mods_table;

	// Fetches a mod from the market, or nullopt if it doesn't exist
	std::optional<Mod> get_mod(const name& contract) {
	    mods_table mods(MARKET_CONTRACT, MARKET_CONTRACT.value);
	    auto mod = mods.find(contract.value);
	    if (mod == mods.end()) {
	        return std::nullopt;
	    }
	    return *mod;
	}

	/* ---------------- TOTEMS ---------------- */
	// Balance table for each account
	struct [[eosio::table]] Balance {
	    asset balance;

	    uint64_t primary_key() const { return balance.symbol.code().raw(); }
	};

	typedef eosio::multi_index<"accounts"_n, Balance> balances_table;

	// Allocations are initial supply distributions when a totem is created
	// The quantity here will never be reduced so that there will always be a
	// record of who was allocated what at creation time.
	struct MintAllocation {
		std::string label;
	    name recipient;
	    asset quantity;
	    std::optional<bool> is_minter;
	};

	// Totem details for UIs
	struct TotemDetails {
		std::string name;
		std::string description;
		std::string image;
		std::string website;
		// This seed defines the generative properties of the totem.
		// It also dictates color schemes for UIs.
	    checksum256 seed;
	};

	// Totem mods for each hook
	struct TotemMods {
		std::vector<name> transfer;
		std::vector<name> mint;
		std::vector<name> burn;
		std::vector<name> open;
		std::vector<name> close;
		std::vector<name> created;
	};

	// Totems that have been created
	struct [[eosio::table]] Totem {
	    name creator;
	    asset supply;
	    asset max_supply;
	    std::vector<MintAllocation> allocations;
	    TotemMods mods;
	    TotemDetails details;
	    time_point_sec created_at;
	    time_point_sec updated_at;

	    uint64_t primary_key() const { return max_supply.symbol.code().raw(); }
	};

	typedef eosio::multi_index<"totems"_n, Totem> totems_table;

	// Totem statistics for tracking mints, burns, transfers, holders
	// This is an experiment to do this on-chain instead of offchain.
	// Not sure if it's worth the RAM cost, but it could be interesting.
	// Will make a decision about it before mainnet launch.
	struct [[eosio::table]] TotemStats {
		symbol ticker;
		uint64_t mints;
		uint64_t burns;
		uint64_t transfers;
		uint64_t holders;
		uint64_t primary_key() const { return ticker.code().raw(); }
	};

	// TODO: Maybe add some indices here for sorting by mints, burns, holders, etc?
	typedef eosio::multi_index<"totemstats"_n, TotemStats> totemstats_table;

	/***
	  * Fetches a totem by its ticker symbol code
	  * @param code - The symbol code of the totem/ticker
	  * @return An optional Totem struct, nullopt if it doesn't exist
	  */
	std::optional<Totem> get_totem(const symbol_code& code) {
	    totems_table totems(TOTEMS_CONTRACT, TOTEMS_CONTRACT.value);
	    auto totem = totems.find(code.raw());
	    if (totem == totems.end()) {
	        return std::nullopt;
	    }
	    return *totem;
	}

	/***
	  * Fetches the creator of a totem by its ticker symbol code
	  * @param code - The symbol code of the totem/ticker
	  * @return The name of the totem creator
	  */
    // TODO: nullopt or error?
	name get_totem_creator(const symbol_code& code) {
	    auto totem = get_totem(code);
	    check(totem.has_value(), "Totem does not exist");
	    return totem.value().creator;
	}

	/***
	  * Fetches the balance of a specific totem for an account
	  * @param owner - The account owning the balance
	  * @param ticker - The symbol of the totem/ticker
	  * @return The asset balance of the totem for the account or 0 if none
	  */
	asset get_balance(const name& owner, const symbol& ticker, const name& contract = TOTEMS_CONTRACT) {
	    balances_table balances(contract, owner.value);
	    auto it = balances.find(ticker.code().raw());
	    if (it == balances.end()) {
	        return asset{0, ticker};
	    }
	    return it->balance;
	}

	/***
	  * Transfers totem tokens from one account to another
	  * @param from - The account sending the totems
	  * @param to - The account receiving the totems
	  * @param quantity - The asset quantity of totems to send
	  * @param memo - A memo for the transfer
	  */
	void transfer(const name& from, const name& to, const asset& quantity, const std::string& memo, const name& contract = TOTEMS_CONTRACT) {
	    action(
	        permission_level{from, "active"_n},
	        contract,
	        "transfer"_n,
	        std::make_tuple(from, to, quantity, memo)
	    ).send();
	}

	struct [[eosio::table]] License {
        name mod;
        uint64_t primary_key() const { return mod.value; }
    };

	// scoped to ticker (symbol_code)
    typedef eosio::multi_index<"licenses"_n, License> license_table;

	void check_license(const symbol_code& ticker, const name& mod){
		{
			license_table licenses(MARKET_CONTRACT, ticker.raw());
			if(licenses.find(mod.value) != licenses.end()) return;
		}
		{
			license_table licenses(PROXY_MOD_CONTRACT, ticker.raw());
			if(licenses.find(mod.value) != licenses.end()) return;
		}

		check(false, "Mod is not licensed for this totem: " + mod.to_string());
	}

	/***
	  * This is really only useful internally for market/totem I think, but I'm leaving it here for now
	  * since all the structs are here and I'm not sure if it's useful for others yet. It's doubtful it is though.
	  */
	std::vector<RequiredAction> get_required_actions(const name& hook, const std::vector<name>& mod_names) {
	    std::vector<RequiredAction> required_actions;
	    for (const auto& mod_name : mod_names) {
	        auto mod = get_mod(mod_name);
	        check(mod.has_value(), "Mod is not published in market: " + mod_name.to_string());
	        check(mod.value().has_hook(hook), "Mod does not support required hook: " + hook.to_string());
	        // TODO: More performant way to do this?
	        for (const auto& req_hook : mod.value().required_actions) {
	            if (req_hook.hook == hook) {
	                required_actions.insert(
	                    required_actions.end(),
	                    req_hook.actions.begin(),
	                    req_hook.actions.end()
	                );
	            }
	        }
	    }
	    return required_actions;
	}

	// Adds a backwards compatibility table so that wallets and tools
	// that support `eosio.token` standard can read totem token stats.
	// Cannot merge these two because the scope is different and you'd need
	// to duplicate the more verbose Totem struct for that, so keeping a
	// separate table is more efficient.
	struct [[eosio::table]] TotemBackwardsCompat {
	    asset supply;
	    asset max_supply;
	    name issuer;

	    uint64_t primary_key() const { return supply.symbol.code().raw(); }
	};

}  // namespace totems