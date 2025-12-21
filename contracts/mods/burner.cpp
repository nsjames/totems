#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT burner : public contract {
   public:
      using contract::contract;

	  ACTION noop(){}

      [[eosio::on_notify(TOTEMS_BURN_NOTIFY)]]
      void on_burn(const name& owner, const asset& quantity, const std::string& memo){
        if(owner == get_self()){
			// ignore burns initiated by self to prevent recursion
			return;
		}

         // burn an equal amount of tokens
         action(
            permission_level{get_self(), "active"_n},
			totems::TOTEMS_CONTRACT,
			"burn"_n,
			std::make_tuple(get_self(), quantity, std::string("Burn matched!"))
         ).send();
      }
};