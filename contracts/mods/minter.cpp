#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/transaction.hpp>
using namespace eosio;

CONTRACT minter : public contract {
   public:
      using contract::contract;

      ACTION mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const std::string& memo){
         check(get_sender() == "totemstotems"_n, "mint action can only be called by totemstotems contract");
         action(
			permission_level{get_self(), "active"_n},
			"totemstotems"_n,
			"transfer"_n,
			std::make_tuple(get_self(), minter, quantity, std::string("Test Mint"))
		 ).send();
      }

      [[eosio::on_notify("totemstotems::mint")]]
      void on_mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const std::string& memo){

	  }
};