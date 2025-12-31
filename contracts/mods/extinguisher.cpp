#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT extinguisher : public contract {
   public:
      using contract::contract;

	  ACTION noop(){}

      [[eosio::on_notify(TOTEMS_BURN_NOTIFY)]]
      void on_burn(const name& owner, const asset& quantity, const std::string& memo){
        check(false, "Totem burning is disabled by the extinguisher mod.");
      }
};