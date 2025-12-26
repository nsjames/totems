#include <market/market.hpp>



void market::publish(
	const name& seller,
	const name& contract,
	const std::set<name>& hooks,
	const uint64_t& price,
	const totems::ModDetails& details,
	const std::vector<totems::RequiredHook>& required_actions,
	const std::optional<name>& referrer
) {
	require_auth(seller);
	// TODO: Ideally, I would like this to check that this contract, prods.minor, prods.major, or eosio controls
	// the contract account, but there's no way to do that currently as you can't fetch the permissions of an account
	// from a contract, and require_auth only verifies that an account _signed_ the transaction, not that one of its
	// permissions did. The only other option I can think of to do this on-chain is to use the required_actions system to
	// enforce that the transaction has updateauth actions for owner/active to relinquish control of the contract.
	// Then do require_auth on the contract instead of the seller, and don't require the seller (since most wallets don't
	// support multi-account signing without an MSIG). For now, I'm just going to require the seller to auth it, and
	// solve that issue later. It's something to solve before production though as I don't want modders to be able to update
	// their mods after publishing, though perhaps that is acceptable as long as creators (or the totem contract) has a way
	// to blacklist mods that misbehave and would brick totems.

	check(price >= 0, "Price cannot be negative");
	check(is_account(contract), "Contract account does not exist");
	check(get_code_hash(contract) != checksum256(), "No contract deployed at the given account");

	mods_table mods(get_self(), get_self().value);
	auto mod = mods.find(contract.value);
	check(mod == mods.end(), "Mod already published");

	std::vector<shared::FeeDisbursement> disbursements;
	uint64_t network_fee = shared::MOD_PUBLISH_FEE;
    if(referrer.has_value()) {
        network_fee = shared::MOD_PUBLISH_FEE * 80 / 100;
        disbursements.push_back(shared::FeeDisbursement{
            .recipient = referrer.value(),
            .amount = shared::MOD_PUBLISH_FEE * 20 / 100
        });
    }

    disbursements.push_back(shared::FeeDisbursement{
        .recipient = "eosio.fees"_n,
        .amount = network_fee
    });

    shared::ensure_tokens_available(shared::MOD_PUBLISH_FEE, get_self());
    shared::dispense_tokens(get_self(), disbursements);

    check(!details.name.empty(), "Mod name cannot be empty");
    check(!details.summary.empty(), "Mod summary cannot be empty");
    check(details.name.size() <= 100, "Mod name too long");
    check(details.name.size() >= 3, "Mod name too short");
    check(details.summary.size() <= 150, "Mod summary too long");
    check(details.summary.size() >= 10, "Mod summary too short");
    check(details.image.size() > 0, "Mod image required");

	check(hooks.size() > 0, "At least one hook must be specified");
	for(const auto& hook : hooks){
	    check(std::find(shared::VALID_HOOKS.begin(), shared::VALID_HOOKS.end(), hook) != shared::VALID_HOOKS.end(),
	        "Unsupported hook: " + hook.to_string());
	}

	std::set<name> seen_required_hooks;
	for(const auto& hook : required_actions){
		check(seen_required_hooks.find(hook.hook) == seen_required_hooks.end(),
			"Duplicate required action hook: " + hook.hook.to_string());
		check(std::find(shared::VALID_HOOKS.begin(), shared::VALID_HOOKS.end(), hook.hook) != shared::VALID_HOOKS.end(),
			"Unsupported required action hook: " + hook.hook.to_string());

		for(const auto& action : hook.actions){
			validate_action(action);
		}

		seen_required_hooks.insert(hook.hook);
	}

    mods.emplace(seller, [&](auto& row) {
    	row.contract = contract;
		row.seller = seller;
		row.hooks = hooks;
		row.price = price;
		row.details = details;
		row.required_actions = required_actions;
		row.score = 0;
		row.published_at = time_point_sec(current_time_point());
		row.updated_at = time_point_sec(current_time_point());
	});

}

void market::update(const name& contract, const uint64_t& price, const totems::ModDetails& details) {
	// TODO: Not necessary for testnet launch, but will be needed for production
}


market::GetModsResult market::getmods(const std::vector<name>& contracts) {
	mods_table mods(get_self(), get_self().value);
	GetModsResult result;

	for (const auto& contract : contracts) {
		auto mod = mods.find(contract.value);
		if (mod != mods.end()) {
			result.mods.push_back(*mod);
		}
	}

	return result;
}

market::GetModsResult market::listmods(const uint32_t& per_page, const std::optional<name>& cursor) {
	mods_table mods(get_self(), get_self().value);
	GetModsResult result;

	// use lower bounds for cursor, or just beginning if not provided
	// (+1 if using cursor to avoid including the cursor item itself)
	auto mod_itr = mods.begin();
    if (cursor.has_value()) {
        mod_itr = mods.lower_bound(cursor->value);
        if (mod_itr != mods.end()) {
            ++mod_itr;
        }
    }

	uint32_t count = 0;
	while (mod_itr != mods.end() && count < per_page) {
		result.mods.push_back(*mod_itr);
		result.cursor = mod_itr->contract;
		++mod_itr;
		++count;
	}

	result.has_more = mod_itr != mods.end();

	return result;
}










std::vector RESTRICTED_CORE_ACTIONS = {
	"updateauth"_n,
	"linkauth"_n,
	"unlinkauth"_n,
	"deleteauth"_n
};
void market::validate_action(const totems::RequiredAction& action){
	if(action.contract == "eosio"_n || action.contract == "core.vaulta"_n){
		for(const auto& restricted : RESTRICTED_CORE_ACTIONS){
			check(action.action != restricted,
				"Usage of restricted action " + restricted.to_string() + " is not allowed in mods");
		}
	}

	// This one doesn't have good enough wallet support to showcase that it's
	// a transfer action, so I'm just banning it for now.
	if(action.contract == "core.vaulta"_n){
		check(action.action != "swapto"_n, "Usage of restricted action swapto is not allowed in mods");
	}

	check(is_account(action.contract),
		"Required action contract account does not exist: " + action.contract.to_string());
	check(get_code_hash(action.contract) != checksum256(),
		"Required action has no contract deployed at the given account: " + action.contract.to_string());

	// check that no field type > totems::FieldType max
	for(const auto& field : action.fields){
		check(field.type <= totems::FieldType::TOTEM,
			"Invalid field type in required action: " + std::to_string(field.type));

		// check that fields that are STATIC are filled
		if(field.type == totems::FieldType::STATIC){
			check(field.data.size() > 0,
				"STATIC field must have data filled in required action");
		} else {
			// ensures that non-static are empty
			check(field.data.size() == 0,
				"Non-STATIC field must not have data filled in required action");
		}
	}
}
