#pragma once
#include <eosio/eosio.hpp>
#include <vector>
#include <string>

using namespace eosio;

namespace shared {

	static const symbol EOS_SYMBOL = symbol("EOS", 4);
	static const symbol VAULTA_SYMBOL = symbol("A", 4);

	// Hooks are triggers for on_notify events in mods
	std::vector<name> VALID_HOOKS = {
    	"created"_n,
    	"mint"_n,
    	"burn"_n,
    	"transfer"_n,
    	"open"_n,
    	"close"_n
    };

	void on_eos_transfer(const name& contract, const name& from, const name& to, const asset& quantity, const std::string& memo){
	    if (to != contract || from == contract) {
			return;
		}

		if(from == "core.vaulta"_n){
			return;
		}

		// always convert to $A so that contracts don't have to track $EOS balances
		action(
		   permission_level{contract, "active"_n},
		   "eosio.token"_n,
		   "transfer"_n,
		   std::make_tuple( contract, "core.vaulta"_n, quantity, std::string("Totems A -> EOS") )
		).send();
	}



	/* ---------------- FEES ---------------- */
	struct [[eosio::table]] CoreBalance {
        asset balance;
        uint64_t primary_key() const { return balance.symbol.code().raw(); }
    };

    typedef eosio::multi_index<"accounts"_n, CoreBalance> core_balances_table;

	void ensure_tokens_available(const uint64_t& fee, const name& account) {
        core_balances_table balances("core.vaulta"_n, account.value);
        auto balance = balances.find(VAULTA_SYMBOL.code().raw());
        check(balance != balances.end(), "No balance found for fee payment");
        check(balance->balance.amount >= fee, "Insufficient balance for fee payment");
    }

    struct FeeDisbursement {
		name recipient;
		uint64_t amount;
	};

    void dispense_tokens(const name& contract, const std::vector<FeeDisbursement>& disbursements) {
        for (const auto& disbursement : disbursements) {
            if(disbursement.recipient == "eosio.fees"_n){
                // eosio.fees only accepts/uses EOS
				action(
				   permission_level{contract, "active"_n},
				   "core.vaulta"_n,
				   "swapto"_n,
				   std::make_tuple( contract, disbursement.recipient, asset(disbursement.amount, shared::VAULTA_SYMBOL), std::string("Totem fee") )
				).send();
            } else {
                // everything else gets $A
				action(
				   permission_level{contract, "active"_n},
				   "core.vaulta"_n,
				   "transfer"_n,
				   std::make_tuple( contract, disbursement.recipient, asset(disbursement.amount, shared::VAULTA_SYMBOL), std::string("Totem fee") )
				).send();
			}
		}
	}

	struct [[eosio::table]] FeeConfig {
		uint64_t amount;

		uint64_t primary_key() const { return 0; }
	};

	typedef eosio::multi_index<"feeconfig"_n, FeeConfig> fee_config_table;

	void set_fee_config(const name& contract, const uint64_t& amount) {
		require_auth(contract);

		fee_config_table fee_config(contract, contract.value);
		auto it = fee_config.find(0);
		if(it == fee_config.end()) {
			fee_config.emplace(contract, [&](auto& row) {
				row.amount = amount;
			});
		} else {
			fee_config.modify(it, same_payer, [&](auto& row) {
				row.amount = amount;
			});
		}
	}

	uint64_t get_base_fee(const name& contract) {
		fee_config_table fee_config(contract, contract.value);
		auto it = fee_config.find(0);
		if(it == fee_config.end()) {
			// defaults to 100 A/EOS
			return 100'0000;
		} else {
			return it->amount;
		}
	}
}