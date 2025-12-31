#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/system.hpp>
#include "../library/totems.hpp"
#include "../shared/shared.hpp"

using namespace eosio;

class [[eosio::contract("market")]] market : public contract {
   public:
    using contract::contract;

	// Adds the `mods` table to this contract's ABI
	typedef eosio::multi_index<"mods"_n, totems::Mod> mods_table;
	typedef eosio::multi_index<"feeconfig"_n, shared::FeeConfig> fee_config_table;

	[[eosio::action]]
	void setfee(const uint64_t& amount){
		shared::set_fee_config(get_self(), amount);
	}

	[[eosio::action, eosio::read_only]]
	uint64_t getfee(){
		return shared::get_base_fee(get_self());
	}

	/***
	  * Publish a mod to the market
	  * @param seller - The account publishing the mod (will receive payments)
	  * @param contract - The account where the mod contract is deployed
	  * @param hooks - The set of hooks this mod supports [transfer, mint, burn, open, close, created]
	  * @param price - The price of this mod as a uint64_t integer in 4 decimal fixed point (e.g. 1.0000 = 10000)
	  * @param details - The mod details struct
	  * @param required_actions - A vector of third party required actions and their hooks
	  * @param referrer - Optional referrer account to receive a portion of the publish fee (fee itself doesn't change)
	  */
    [[eosio::action]]
    void publish(
        const name& seller,
        const name& contract,
        const std::set<name>& hooks,
        const uint64_t& price,
        const totems::ModDetails& details,
        const std::vector<totems::RequiredHook>& required_actions,
        const std::optional<name>& referrer
    );

	/***
	 * Update the price and details of a published mod
	 * @param contract - The account where the mod contract is deployed
	 * @param price - The new price of this mod as a uint64_t integer in 4 decimal fixed point (e.g. 1.0000 = 10000)
	 * @param details - The new mod details struct
	 */
    [[eosio::action]]
    void update(const name& contract, const uint64_t& price, const totems::ModDetails& details);

    [[eosio::action]]
    void addlicenses(const symbol_code& ticker, const std::vector<name>& mods);

    struct GetModsResult {
		std::vector<totems::Mod> mods;
		name cursor;
		bool has_more;
	};

    [[eosio::action, eosio::read_only]]
    GetModsResult getmods(const std::vector<name>& contracts);

    [[eosio::action, eosio::read_only]]
    GetModsResult listmods(const uint32_t& per_page, const std::optional<name>& cursor);

	// Converts all EOS sent to this contract directly to $A so that it only has to deal with one token internally
    [[eosio::on_notify("eosio.token::transfer")]]
    void on_eos_transfer(const name& from, const name& to, const asset& quantity, const std::string& memo){
        shared::on_eos_transfer(get_self(), from, to, quantity, memo);
    }

    private:
    // Ensures that required actions are not dangerous, and hooks are valid & unique
    void validate_action(const totems::RequiredAction& action);

};