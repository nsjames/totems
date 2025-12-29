#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/transaction.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT minter : public contract {
   public:
      using contract::contract;

      ACTION mint(
         const name& mod,
         const name& minter,
         const asset& quantity,
         const asset& payment,
         const std::string& memo
      ){
         check(get_sender() == totems::TOTEMS_CONTRACT, "mint action can only be called by the totems contract");
         action(
			permission_level{get_self(), "active"_n},
			totems::TOTEMS_CONTRACT,
			"transfer"_n,
			std::make_tuple(get_self(), minter, quantity, std::string("Test Mint"))
		 ).send();
      }

      [[eosio::on_notify(TOTEMS_MINT_NOTIFY)]]
      void on_mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const std::string& memo){

	  }
};