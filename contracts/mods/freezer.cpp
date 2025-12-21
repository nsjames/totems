#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT freezer : public contract {
   public:
      using contract::contract;

      struct [[eosio::table]] Frozen {
         symbol ticker;

         uint64_t primary_key() const { return ticker.code().raw(); }
      };

      using frozen_table = eosio::multi_index<"frozen"_n, Frozen>;

      ACTION toggle(symbol ticker) {
         require_auth(totems::get_totem_creator(ticker.code()));

         frozen_table frozen(get_self(), get_self().value);
         auto itr = frozen.find(ticker.code().raw());
         if (itr == frozen.end()) {
			frozen.emplace(get_self(), [&](auto& row) {
                row.ticker = ticker;
			});
		 } else {
			frozen.erase(itr);
		 }
      }

      [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
      void ontransfer(name from, name to, asset quantity, std::string memo){
         frozen_table frozen(get_self(), get_self().value);
		 auto itr = frozen.find(quantity.symbol.code().raw());
		 check(itr == frozen.end(), "Transfers for this token are currently frozen");
      }
};