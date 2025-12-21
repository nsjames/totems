#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT delayed : public contract {
   public:
      using contract::contract;

      struct [[eosio::table]] Delay {
         uint32_t time_available;
      };

      using delay_table = eosio::singleton<"delay"_n, Delay>;

	  // setup action for required_actions
      ACTION setdelay(const symbol_code& ticker, uint32_t timestamp_in_sec) {
         auto totem = totems::get_totem(ticker);
         check(totem.has_value(), "Totem does not exist");
         require_auth(totem.value().creator);

         delay_table delays(get_self(), get_self().value);
         delays.set(Delay{.time_available = timestamp_in_sec}, get_self());
      }

      [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
      void ontransfer(name from, name to, asset quantity, std::string memo){
         delay_table delays(get_self(), get_self().value);
         check(delays.exists(), "Delay not set");
         Delay delay = delays.get();

         uint32_t current_time = current_time_point().sec_since_epoch();
         check(current_time >= delay.time_available, "Transfer is delayed until " + std::to_string(delay.time_available));
      }
};