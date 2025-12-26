#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include "../library/totems.hpp"
using namespace eosio;

CONTRACT remover : public contract {
   public:
      using contract::contract;

	  typedef eosio::multi_index<"mods"_n, totems::Mod> mods_table;

	  ACTION run(){
	      mods_table mods(get_self(), get_self().value);
	      auto mod_itr = mods.begin();
	      while(mod_itr != mods.end()){
	          mod_itr = mods.erase(mod_itr);
	      }
	  }
};