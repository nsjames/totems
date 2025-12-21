#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/singleton.hpp>
#include "../library/totems.hpp"
using namespace eosio;
using std::string;

CONTRACT testmod : public contract {
   public:
    using contract::contract;

    struct [[eosio::table]] Config {
		bool fail = false;
	};

	typedef eosio::singleton<"config"_n, Config> config_table;

	ACTION toggle() {
		config_table _config(get_self(), get_self().value);
		bool fail = _config.exists() ? _config.get().fail : false;
		_config.set(Config{.fail = !fail}, get_self());
	}

	void check_fail() {
		config_table _config(get_self(), get_self().value);
		check(!_config.exists() || !_config.get().fail, "Mod is set to fail all actions");
	}

    [[eosio::on_notify(TOTEMS_CREATED_NOTIFY)]]
    void on_created(const name& creator, const symbol& ticker) {
        check_fail();
    }

    [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
    void on_transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
        check_fail();
    }

    [[eosio::on_notify(TOTEMS_BURN_NOTIFY)]]
    void on_burn(const name& owner, const asset& quantity, const string& memo) {
        check_fail();
    }

    [[eosio::on_notify(TOTEMS_OPEN_NOTIFY)]]
    void on_open(const name& owner, const symbol& ticker, const name& ram_payer) {
        check_fail();
    }

    [[eosio::on_notify(TOTEMS_CLOSE_NOTIFY)]]
    void on_close(const name& owner, const symbol& ticker) {
        check_fail();
    }

    [[eosio::on_notify(TOTEMS_MINT_NOTIFY)]]
    void on_mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo) {
        check_fail();
    }

    [[eosio::action]]
    void mint(const name& mod, const name& to, const asset& quantity, const asset& payment, const string& memo) {
        check(mod == get_self(), "not this mod");
        check(get_sender() == totems::TOTEMS_CONTRACT, "Only called by the Totems contract!");
        check_fail();
    }
};