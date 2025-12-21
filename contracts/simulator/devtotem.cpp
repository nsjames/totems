#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <vector>
#include <string>

using namespace eosio;
using std::string;

CONTRACT devtotem : public contract {
public:
    using contract::contract;

    ACTION created(const name& creator, const symbol& ticker, const std::vector<name>& mods) {
        notify_mods(mods);
    }

    ACTION mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo, const std::vector<name>& minters, const std::vector<name>& mods) {
        for (const auto& minter : minters) {
            action(
                permission_level{get_self(), "active"_n},
                minter,
                "mint"_n,
                std::make_tuple(mod, minter, quantity, payment, memo)
            ).send();
        }
        notify_mods(mods);
    }

    ACTION burn(const name& owner, const asset& quantity, const string& memo, const std::vector<name>& mods) {
        notify_mods(mods);
    }

    ACTION transfer(const name& from, const name& to, const asset& quantity, const string& memo, const std::vector<name>& mods) {
        notify_mods(mods);
    }

    ACTION open(const name& owner, const symbol& ticker, const name& ram_payer, const std::vector<name>& mods) {
        notify_mods(mods);
    }

    ACTION close(const name& owner, const symbol& ticker, const std::vector<name>& mods) {
        notify_mods(mods);
    }

private:
    void notify_mods(const std::vector<name>& mods) {
        for (const auto& mod : mods) {
            require_recipient(mod);
        }
    }
};
