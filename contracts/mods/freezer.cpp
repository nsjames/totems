#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/system.hpp>

#include "../library/totems.hpp"
using namespace eosio;
using std::string;

CONTRACT freezer : public contract {
   public:
    using contract::contract;

    struct [[eosio::table]] Frozen {
        symbol_code ticker;
		uint64_t primary_key() const { return ticker.raw(); }
    };

    typedef eosio::multi_index<"frozen"_n, Frozen> frozen_table;

    [[eosio::action]]
    void freeze(const symbol_code& ticker){
		require_auth(totems::get_totem_creator(ticker));

		frozen_table frozen(get_self(), get_self().value);
		auto it = frozen.find(ticker.raw());
		check(it == frozen.end(), "Totem is already frozen");
		frozen.emplace(get_self(), [&](auto& row) {
			row.ticker = ticker;
		});
	}

	[[eosio::action]]
	void thaw(const symbol_code& ticker){
		require_auth(totems::get_totem_creator(ticker));

		frozen_table frozen(get_self(), get_self().value);
		auto it = frozen.find(ticker.raw());
		check(it != frozen.end(), "Totem is not frozen");
		frozen.erase(it);
	}

	[[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
	void on_transfer(const name& from, const name& to, const asset& quantity, const string& memo){
		if(from == get_self() || to == get_self()){
			return;
		}

		frozen_table frozen(get_self(), get_self().value);
		auto it = frozen.find(quantity.symbol.code().raw());
		check(it == frozen.end(), "frozen!");
	}

	[[eosio::on_notify(TOTEMS_MINT_NOTIFY)]]
	void on_mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const std::string& memo){
		frozen_table frozen(get_self(), get_self().value);
		auto it = frozen.find(quantity.symbol.code().raw());
		check(it == frozen.end(), "frozen!");
	}

	[[eosio::on_notify(TOTEMS_BURN_NOTIFY)]]
	void on_burn(const name& owner, const asset& quantity, const string& memo){
		frozen_table frozen(get_self(), get_self().value);
		auto it = frozen.find(quantity.symbol.code().raw());
		check(it == frozen.end(), "frozen!");
	}
};