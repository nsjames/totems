#pragma once
#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/transaction.hpp>
#include <cstring>
#include "totems.hpp"

using namespace eosio;

namespace action_verifier {

	struct required_entry {
	    name contract;
	    name action;
	    uint32_t index;
	};

    /*
     * Verifies that all required actions exist in the current transaction
     * Reverts if any required action is missing or invalid
     */
    void verify(
        const name& sender,
        const symbol_code& ticker,
        const std::vector<totems::RequiredAction>& required
    ) {
        std::vector<bool> validated(required.size(), false);
        uint32_t validated_count = 0;

        // Flatten required actions for faster iteration
        std::vector<required_entry> required_entries;
        required_entries.reserve(required.size());

        for (uint32_t i = 0; i < required.size(); i++) {
            required_entries.push_back({
                required[i].contract,
                required[i].action,
                i
            });
        }

        // Cache raw bytes once
        const char* sender_bytes = reinterpret_cast<const char*>(&sender);
        const char* ticker_bytes = reinterpret_cast<const char*>(&ticker);

        // Iterate transaction actions exactly once
        for (uint32_t i = 0; ; i++) {
            if (validated_count == required.size()) break;
            action act = get_action(1, i);

            for (const auto& entry : required_entries) {
                if (validated[entry.index]) continue;
                if (act.account != entry.contract) continue;
                if (act.name != entry.action) continue;

                const auto& req  = required[entry.index];
                const auto& data = act.data;

                for (const auto& field : req.fields) {
                    check(field.offset + field.size <= data.size(),
                          "Action data too small");

                    const char* actual = data.data() + field.offset;

                    switch (field.type) {

                        case totems::STATIC:
                            check(field.data.size() == field.size,
                                  "STATIC size mismatch");
                            check(
                                std::memcmp(
                                    actual,
                                    field.data.data(),
                                    field.size
                                ) == 0,
                                "STATIC mismatch"
                            );
                            break;

                        case totems::SENDER:
                            check(field.size == sizeof(name),
                                  "SENDER size invalid");
                            check(
                                std::memcmp(
                                    actual,
                                    sender_bytes,
                                    sizeof(name)
                                ) == 0,
                                "SENDER mismatch"
                            );
                            break;

                        case totems::TOTEM:
                            check(field.size == sizeof(symbol_code),
                                  "TOTEM size invalid");
                            check(
                                std::memcmp(
                                    actual,
                                    ticker_bytes,
                                    sizeof(symbol_code)
                                ) == 0,
                                "TOTEM mismatch"
                            );
                            break;

                        case totems::DYNAMIC:
                            break;

                        default:
                            check(false, "Unknown field type");
                    }
                }

                validated[entry.index] = true;
                validated_count++;
                break;
            }
        }

        check(
            validated_count == required.size(),
            "Missing one or more required actions"
        );
    }



} // namespace action_verifier
