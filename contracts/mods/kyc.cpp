#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/system.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT kyc : public contract {
   public:
      using contract::contract;

      struct [[eosio::table]] KYC {
         name account;

         uint64_t primary_key() const { return account.value; }
      };

      using kyc_table = eosio::multi_index<"kyc"_n, KYC>;

      ACTION manage(name account, bool has_kyc){
         require_auth(get_self());
         kyc_table kyc(get_self(), get_self().value);
         auto itr = kyc.find(account.value);

         if(has_kyc){
            kyc.emplace(get_self(), [&](auto& row){
               row.account = account;
            });
         } else {
            kyc.erase(itr);
         }
      }

      [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
      void ontransfer(name from, name to, asset quantity, std::string memo){
         kyc_table kyc(get_self(), get_self().value);
         auto check_kyc = [&](name user){
            auto itr = kyc.find(user.value);
            check(itr != kyc.end(), "KYC not completed for this account");
         };

         check_kyc(from);
         check_kyc(to);
      }
};