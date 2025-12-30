#pragma once

#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/system.hpp>
#include "../library/totems.hpp"

using namespace eosio;

class [[eosio::contract("feed")]] feed : public contract {
   public:
    using contract::contract;

    [[eosio::action]]
    void login( const name& user );
};