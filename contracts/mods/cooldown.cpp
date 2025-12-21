#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT cooldown : public contract {
   public:
      using contract::contract;

      static constexpr uint64_t COOLDOWN_SECONDS = 5;

      // This has obvious RAM cost implications, but it's just an example of functionality.
      struct [[eosio::table]] Cooldown {
         uint32_t last_transfer;
      };

      using cooldown_table = eosio::singleton<"cooldowns"_n, Cooldown>;

      [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
      void ontransfer(name from, name to, asset quantity, std::string memo){
         cooldown_table cooldowns(get_self(), from.value);
         Cooldown cooldown = cooldowns.get_or_default(Cooldown{0});
         uint32_t current_time = current_time_point().sec_since_epoch();
         check(
            current_time - cooldown.last_transfer >= COOLDOWN_SECONDS,
            "Must wait " + std::to_string(COOLDOWN_SECONDS) + " seconds between transfers"
         );
         cooldown.last_transfer = current_time;
         // this is the RAM problem, since you can only bill to self on_notify
         // there could be a 'setup' action to pre-create these with the totem creator as the payer,
         // and then a global 5 second transfer cooldown for all transfers for instance,
         // or, you could make a required_action to sponsor buyrambytes to the contract
         cooldowns.set(cooldown, get_self());
      }
};