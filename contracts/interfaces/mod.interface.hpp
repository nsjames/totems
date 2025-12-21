#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <string>

using namespace eosio;
using std::string;

class [[eosio::contract("mod")]] mod : public contract {
   public:
    using contract::contract;

    
    [[eosio::on_notify(TOTEMS_CREATED_NOTIFY)]]
    void on_created(const name& creator, const symbol& ticker);

    [[eosio::on_notify(TOTEMS_MINT_NOTIFY)]]
    void on_mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo);
    
    [[eosio::action]]
    void mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo);

    [[eosio::on_notify(TOTEMS_BURN_NOTIFY)]]
    void on_burn(const name& owner, const asset& quantity, const string& memo);

    [[eosio::on_notify(TOTEMS_TRANSFER_NOTIFY)]]
    void on_transfer(const name& from, const name& to, const asset& quantity, const string& memo);

    [[eosio::on_notify(TOTEMS_OPEN_NOTIFY)]]
    void on_open(const name& owner, const symbol& ticker, const name& ram_payer);

    [[eosio::on_notify(TOTEMS_CLOSE_NOTIFY)]]
    void on_close(const name& owner, const symbol& ticker);
};
