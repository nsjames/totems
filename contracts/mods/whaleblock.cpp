#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/system.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT whaleblock : public contract {
   public:
      using contract::contract;

      [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
      void ontransfer(name from, name to, asset quantity, std::string memo){
         auto totem = totems::get_totem(quantity.symbol.code());
         check(totem.has_value(), "Totem does not exist");

         auto balance = totems::get_totem_balance(to, quantity.symbol);
         int64_t max_holdings = totem->max_supply.amount*0.05;
         // This notification comes AFTER the transfer, so the whale is already holding the new balance
         // and will have exceeded the limit if this check fails.
         check(balance.amount <= max_holdings,
            "Cannot hold more than 5% of the total supply"
         );
      }
};