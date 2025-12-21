#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/system.hpp>
#include "../library/totems.hpp"
#include "../library/verifier.hpp"
#include "../shared/shared.hpp"
#include <string>

using std::string;
using namespace eosio;

class [[eosio::contract("totems")]] totemtoken : public contract {
   public:
    using contract::contract;

	// Adds these tables to the contract's ABI
    typedef eosio::multi_index<"accounts"_n, totems::Balance> balances_table;
    typedef eosio::multi_index<"totems"_n, totems::Totem> totems_table;
    typedef eosio::multi_index<"totemstats"_n, totems::TotemStats> totemstats_table;
    typedef eosio::multi_index<"stat"_n, totems::TotemBackwardsCompat> stat_table;

	/***
	  * Create a new Totem
	  * @param creator - The account creating the totem
	  * @param ticker - The symbol/ticker for the totem and its precision (4,TOTEM / 18,ETH)
	  * @param allocations - A list of allocated totems, supply & max_supply is the sum of all allocations
	  * @param mods - The totem mods to use for each hook
	  * @param details - The totem details struct for UIs
	  * @param referrer - Optional referrer account to receive a portion of the creation fee (fee itself doesn't change)
	  */
    [[eosio::action]]
    void create(
		const name& creator,
		const symbol& ticker,
		const std::vector<totems::MintAllocation>& allocations,
		const totems::TotemMods& mods,
		const totems::TotemDetails& details,
		const std::optional<name>& referrer
	);

	/***
	  * An action called by the `create` action after a totem is created so that mods can receive the notification after
	  * all other setup and inlines are done. Mods cannot listen to `create` directly.
	  */
    [[eosio::action]]
    void created(const name& creator, const symbol& ticker);

	/***
	  * Mint totems to an account, mods should never allow users to mint directly without going through this action.
	  * Mint mods will receive any `payment` as $A tokens, even if the user sent EOS.
	  * @param mod - The mod account to execute this mint
	  * @param minter - The account requesting the mint
	  * @param quantity - The quantity of totems to mint (can be 0)
	  * @param payment - The payment asset sent for this mint (can be 0, can be EOS or A)
	  * @param memo - An optional memo for the mint, will be passed to mods
	  */
    [[eosio::action]]
    void mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo);

	/***
	  * Burn totems from an account
	  * @param owner - The account owning the totems to burn
	  * @param quantity - The quantity of totems to burn
	  * @param memo - An optional memo for the burn, will be passed to mods
	  */
    [[eosio::action]]
    void burn(const name& owner, const asset& quantity, const string& memo);

	/***
	  * Transfer totems from one account to another
	  * @param from - The account sending the totems
	  * @param to - The account receiving the totems
	  * @param quantity - The quantity of totems to transfer
	  * @param memo - An optional memo for the transfer, will be passed to mods
	  */
    [[eosio::action]]
	void transfer(const name& from, const name& to, const asset& quantity, const string& memo);

	/***
	  * Open a totem balance for an account (RAM payer pays for the storage)
	  * @param owner - The account to open the balance for
	  * @param ticker - The totem ticker to open
	  * @param ram_payer - The account that will pay for the RAM to store this balance
	  */
    [[eosio::action]]
    void open(const name& owner, const symbol& ticker, const name& ram_payer);

	/***
	  * Close a totem balance for an account (balance must be zero)
	  * @param owner - The account to close the balance for
	  * @param ticker - The totem ticker to close
	  */
    [[eosio::action]]
    void close(const name& owner, const symbol& ticker);

	/***
	  * Get the total fee for using the given mods
	  * @param mods - A vector of mod account names to get the total fee for
	  * @return The total fee as a uint64_t integer in 4 decimal fixed point (e.g. 1.0000 = 10000)
	  */
    [[eosio::action, eosio::read_only]]
    uint64_t getfee(const std::vector<name> mods);

	// TODO: Add read-only actions to get totem details, balances, etc.

	/***
	  * Converts all EOS sent to this contract directly to $A so that it only has to deal with one token internally
	  */
    [[eosio::on_notify("eosio.token::transfer")]]
    void on_eos_transfer(const name& from, const name& to, const asset& quantity, const std::string& memo){
		shared::on_eos_transfer(get_self(), from, to, quantity, memo);
	}

    using create_action = eosio::action_wrapper<"create"_n, &totemtoken::create>;
    using mint_action = eosio::action_wrapper<"mint"_n, &totemtoken::mint>;
    using burn_action = eosio::action_wrapper<"burn"_n, &totemtoken::burn>;
    using transfer_action = eosio::action_wrapper<"transfer"_n, &totemtoken::transfer>;
    using open_action = eosio::action_wrapper<"open"_n, &totemtoken::open>;
    using close_action = eosio::action_wrapper<"close"_n, &totemtoken::close>;

   private:
    void sub_balance(const name& owner, const asset& value);
    void add_balance(const name& owner, const asset& value, const name& ram_payer, const bool& skip_stats = false);
    void notify_mods(const std::vector<name>& mods);
};