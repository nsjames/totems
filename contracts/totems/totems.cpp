#include <totems/totems.hpp>

void totemtoken::create(
	const name& creator,
	const symbol& ticker,
	const std::vector<totems::MintAllocation>& allocations,
	const totems::TotemMods& mods,
	const totems::TotemDetails& details,
	const std::optional<name>& referrer
) {
    require_auth(creator);

    check(ticker.is_valid(), "Invalid ticker");
    check(details.name.size() <= 32, "Totem name too long");
    check(details.name.size() >= 3, "Totem name too short");
    check(details.image.size() > 0, "Image required");
    check(details.description.size() <= 500, "Description too long");
    check(details.seed != checksum256(), "invalid seed");

    // TODO: Check global registry instead
    totems_table totems(get_self(), get_self().value);
    check(totems.find(ticker.code().raw()) == totems.end(), "A totem with this symbol already exists");

    uint64_t mod_fees = 0;

	std::vector<shared::FeeDisbursement> disbursements;
	uint64_t network_fee = shared::TOTEM_CREATION_BASE_FEE;
	if(referrer.has_value()) {
		network_fee = shared::TOTEM_CREATION_BASE_FEE * 80 / 100;
		disbursements.push_back(shared::FeeDisbursement{
			.recipient = referrer.value(),
			.amount = shared::TOTEM_CREATION_BASE_FEE * 20 / 100
		});
	}
	disbursements.push_back(shared::FeeDisbursement{
		.recipient = "eosio.fees"_n,
		.amount = network_fee
	});

	std::vector<std::pair<name, totems::Mod>> mod_cache;
    auto get_cached = [&](const name& mod_name) -> std::optional<totems::Mod> {
        for (const auto& [k, v] : mod_cache) if (k == mod_name) return v;
        return std::nullopt;
    };

    auto cache_mod = [&](const name& mod_name, const totems::Mod& mod) {
        mod_cache.emplace_back(mod_name, mod);
    };

    auto get_mod = [&](const name& mod_name) -> std::optional<totems::Mod> {
        if (auto cached = get_cached(mod_name)) return cached;

        auto mod = totems::get_mod(mod_name);
        if (mod.has_value()) cache_mod(mod_name, mod.value());
        return mod;
    };

	auto iterate_mods = [&](const std::vector<name>& mod_list, const name& hook_name) {
		for (const auto& mod_name : mod_list) {
            auto mod = get_mod(mod_name);
            check(mod.has_value(), "Mod is not published in market");
            check(mod.value().has_hook(hook_name), "Mod does not support required hook: " + hook_name.to_string());
            auto price = mod.value().price;
            if(price > 0){
	            mod_fees += mod.value().price;
	            disbursements.push_back(shared::FeeDisbursement{
	                .recipient = mod.value().seller,
	                .amount = mod.value().price
	            });
            }
        }
	};

	iterate_mods(mods.transfer, "transfer"_n);
	iterate_mods(mods.mint, "mint"_n);
	iterate_mods(mods.burn, "burn"_n);
	iterate_mods(mods.open, "open"_n);
	iterate_mods(mods.close, "close"_n);
	iterate_mods(mods.created, "created"_n);

	shared::ensure_tokens_available(shared::TOTEM_CREATION_BASE_FEE + mod_fees, get_self());
	shared::dispense_tokens(get_self(), disbursements);

	totemstats_table totemstats(get_self(), get_self().value);
	totems::TotemStats stats {
		.ticker = ticker,
		.mints = 0,
		.burns = 0,
		.transfers = 0,
		.holders = 0
	};

	// tally up max supply from allocations, and send tokens to recipients
    asset max_supply = asset(0, ticker);
    for (const auto& alloc : allocations) {
        check(alloc.quantity.is_valid(), "invalid supply in allocation");
        check(alloc.quantity.amount > 0, "allocation quantity must be positive");
        check(alloc.quantity.symbol == ticker, "allocation symbol mismatch");
        max_supply += alloc.quantity;

		// chain up allocation transfers
		add_balance(alloc.recipient, alloc.quantity, creator, true);

		if(alloc.is_minter.has_value() && alloc.is_minter.value()) {
			auto mod = get_mod(alloc.recipient);
			check(mod.has_value(), "Allocation recipient mod is not published in market: " + alloc.recipient.to_string());
			check(mod.value().details.is_minter, "Allocation recipient mod is not a minter: " + alloc.recipient.to_string());
		} else {
			stats.mints += 1;
			stats.holders += 1;
		}
    }

    check(max_supply.amount > 0, "Totem initial allocation must be greater than 0");

    totems.emplace(creator, [&](auto& row) {
    	row.supply = max_supply;
    	row.max_supply = max_supply;
        row.creator = creator;
        row.allocations = allocations;
        row.mods = mods;
        row.details = details;
        row.created_at = time_point_sec(current_time_point());
        row.updated_at = time_point_sec(current_time_point());
    });

    totemstats.emplace(creator, [&](auto& row) {
    	row = stats;
	});

	// purely used for backwards compatibility with wallets and
	// other tools that expect standard token tables
	stat_table statstable(get_self(), ticker.code().raw());
	statstable.emplace(creator, [&](auto& s) {
	   s.supply     = max_supply;
	   s.max_supply = max_supply;
	   s.issuer     = creator;
	});

	action(
		permission_level{get_self(), "active"_n},
		get_self(),
		"created"_n,
		std::make_tuple(creator, ticker)
	).send();
}

void totemtoken::created(const name& creator, const symbol& ticker) {
	require_auth(get_self());

	totems_table totems(get_self(), get_self().value);
	auto totem = totems.find(ticker.code().raw());
	check(totem != totems.end(), "Totem not found");

	action_verifier::verify(
		creator,
		ticker.code(),
		totems::get_required_actions("created"_n, totem->mods.created)
	);

	notify_mods(totem->mods.created);
}

void totemtoken::mint(const name& mod, const name& minter, const asset& quantity, const asset& payment, const string& memo) {
	require_auth(minter);

    check(payment.is_valid(), "Invalid payment");
    check(payment.symbol.is_valid(), "invalid symbol name");
	check(payment.symbol == shared::EOS_SYMBOL || payment.symbol == shared::VAULTA_SYMBOL, "payment must be in EOS or VAULTA");

	// Sending the payment for this mint from the contract to the Mod
	if(payment.amount > 0){
		shared::ensure_tokens_available(payment.amount, get_self());
	    shared::dispense_tokens(get_self(), {
	        shared::FeeDisbursement{
	            .recipient = mod,
	            .amount = static_cast<uint64_t>(payment.amount)
	        }
	    });
    }

    totems_table totems(get_self(), get_self().value);
    auto totem = totems.find(quantity.symbol.code().raw());
    check(totem != totems.end(), "Totem not found");

	check(quantity.is_valid(), "invalid quantity");
	check(quantity.amount > 0, "must mint positive quantity");
	// TODO: superfluous?
	check(quantity.symbol == totem->supply.symbol, "symbol precision mismatch");

	auto found_mod = std::find_if(
        totem->allocations.begin(),
        totem->allocations.end(),
        [&](const totems::MintAllocation& alloc) {
            return alloc.recipient == mod;
        }
    );

	check(found_mod != totem->allocations.end(), "Mod not authorized to mint for this totem");
	check(found_mod->is_minter.has_value() && found_mod->is_minter.value(), "Mod is not authorized to mint");

	auto modDetails = totems::get_mod(mod);
	check(modDetails.has_value(), "Mod is not published in market");
	check(modDetails.value().details.is_minter, "Mod is not a minter");

	action(
        permission_level{get_self(), "active"_n},
        mod,
        "mint"_n,
        std::make_tuple(mod, minter, quantity, asset(payment.amount, shared::VAULTA_SYMBOL), std::move(memo))
    ).send();

	// TODO: If this is enabled, then you need to make the supply not count minter mods.
	// That introduced a bunch of complexity on the modder side though, as there's not way to
	// get back a result about how many tokens the user would have gotten.
	// Also, it breaks the expectation that supply == sum(balances), and considers minter mods as
	// "outside" the supply, which doesn't seem sensible.
// 	totems.modify(totem, same_payer, [&](auto& row) {
// 		row.supply += quantity;
// 	});
// 	add_balance(minter, quantity, mod);


	totemstats_table totemstats(get_self(), get_self().value);
	auto stats = totemstats.find(totem->supply.symbol.code().raw());
	check(stats != totemstats.end(), "Totem stats not found");
	totemstats.modify(stats, same_payer, [&](auto& row) {
		row.mints += 1;
	});

	action_verifier::verify(
        minter,
        quantity.symbol.code(),
        totems::get_required_actions("mint"_n, totem->mods.mint)
    );


    notify_mods(totem->mods.mint);
}

void totemtoken::burn(const name& owner, const asset& quantity, const string& memo) {
    require_auth(owner);
    check(quantity.is_valid(), "invalid quantity");
    check(quantity.amount > 0, "must burn positive quantity");
    check(quantity.symbol.is_valid(), "invalid ticker");

    totems_table totems(get_self(), get_self().value);
    auto totem = totems.find(quantity.symbol.code().raw());
    check(totem != totems.end(), "token with symbol does not exist");

    check(quantity.symbol == totem->supply.symbol, "symbol precision mismatch");

    totems.modify(totem, same_payer, [&](auto& row) {
        row.supply -= quantity;
        // TODO: Should burn reduce max supply?
//         row.max_supply -= quantity;
    });

    // backwards compat
    stat_table statstable(get_self(), quantity.symbol.code().raw());
    statstable.modify(statstable.get(quantity.symbol.code().raw()), same_payer, [&](auto& s) {
	   s.supply -= quantity;
	});

    totemstats_table totemstats(get_self(), get_self().value);
    auto stats = totemstats.find(totem->supply.symbol.code().raw());
    check(stats != totemstats.end(), "Totem stats not found");
    totemstats.modify(stats, same_payer, [&](auto& row) {
        row.burns += 1;
    });

    sub_balance(owner, quantity);

    action_verifier::verify(
        owner,
        quantity.symbol.code(),
        totems::get_required_actions("burn"_n, totem->mods.burn)
    );

    notify_mods(totem->mods.burn);
}

void totemtoken::transfer(const name& from, const name& to, const asset& quantity, const string& memo) {
    require_auth(from);
    check(from != to, "cannot transfer to self");
    check(is_account(to), "to account does not exist");
    check(quantity.is_valid(), "invalid quantity");
    check(quantity.amount > 0, "must transfer positive quantity of " + quantity.symbol.code().to_string());

    totems_table totems(get_self(), get_self().value);
    const auto& totem = totems.get(quantity.symbol.code().raw());
    check(quantity.symbol == totem.supply.symbol, "symbol precision mismatch");

    require_recipient(from);
    require_recipient(to);

    auto payer = has_auth(to) ? to : from;

    sub_balance(from, quantity);
    add_balance(to, quantity, payer);

    totemstats_table totemstats(get_self(), get_self().value);
    auto stats = totemstats.find(quantity.symbol.code().raw());
    check(stats != totemstats.end(), "Totem stats not found");
    totemstats.modify(stats, same_payer, [&](auto& row) {
        row.transfers += 1;
    });

    action_verifier::verify(
        from,
        quantity.symbol.code(),
        totems::get_required_actions("transfer"_n, totem.mods.transfer)
    );

    notify_mods(totem.mods.transfer);
}

void totemtoken::sub_balance(const name& owner, const asset& value) {
    balances_table balances(get_self(), owner.value);

    const auto& from = balances.get(value.symbol.code().raw(), "no balance object found");
    check(from.balance.amount >= value.amount, "overdrawn balance");

    balances.modify(from, owner, [&](auto& a) { a.balance -= value; });
}

void totemtoken::add_balance(const name& owner, const asset& value, const name& ram_payer, const bool& skip_stats) {
    balances_table balances(get_self(), owner.value);
    auto to = balances.find(value.symbol.code().raw());
    if (to == balances.end()) {
        balances.emplace(ram_payer, [&](auto& a) { a.balance = value; });

		if(!skip_stats){
            totemstats_table totemstats(get_self(), get_self().value);
	        auto stats = totemstats.find(value.symbol.code().raw());
	        check(stats != totemstats.end(), "Totem stats not found");
	        totemstats.modify(stats, same_payer, [&](auto& row) {
	            row.holders += 1;
	        });
        }
    } else {
        balances.modify(to, same_payer, [&](auto& a) { a.balance += value; });
    }
}

void totemtoken::open(const name& owner, const symbol& ticker, const name& ram_payer) {
    require_auth(ram_payer);

    check(is_account(owner), "owner account does not exist");

    auto sym_code_raw = ticker.code().raw();
    totems_table totems(get_self(), get_self().value);
    const auto& totem = totems.get(sym_code_raw, "ticker does not exist");
    check(totem.supply.symbol == ticker, "ticker precision mismatch");

    balances_table balances(get_self(), owner.value);
    auto it = balances.find(sym_code_raw);
    if (it == balances.end()) {
        balances.emplace(ram_payer, [&](auto& a) { a.balance = asset{0, ticker}; });
    }

    action_verifier::verify(
        owner,
        ticker.code(),
        totems::get_required_actions("open"_n, totem.mods.open)
    );

    notify_mods(totem.mods.open);
}

void totemtoken::close(const name& owner, const symbol& ticker) {
    require_auth(owner);

    totems_table totems(get_self(), get_self().value);
    const auto& totem = totems.get(ticker.code().raw(), "ticker does not exist");

    balances_table balances(get_self(), owner.value);
    auto it = balances.find(ticker.code().raw());
    check(it != balances.end(), "This account doesn't have any " + ticker.code().to_string());
    check(it->balance.amount == 0, "Cannot close because the balance is not zero.");
    balances.erase(it);

    totemstats_table totemstats(get_self(), get_self().value);
    auto stats = totemstats.find(ticker.code().raw());
    check(stats != totemstats.end(), "Totem stats not found");
    totemstats.modify(stats, same_payer, [&](auto& row) {
        row.holders -= 1;
    });

    action_verifier::verify(
        owner,
        ticker.code(),
        totems::get_required_actions("close"_n, totem.mods.close)
    );

    notify_mods(totem.mods.close);
}

void totemtoken::notify_mods(const std::vector<name>& mods) {
    for (const auto& mod : mods) {
        require_recipient(mod);
    }
}


// READ ONLY
uint64_t totemtoken::getfee(const std::vector<name> mods){
	uint64_t mod_fees = 0;
	for (const auto& mod_name : mods) {
        auto mod = totems::get_mod(mod_name);
        check(mod.has_value(), "Mod is not published in market");
        mod_fees += mod.value().price;
    }

    return mod_fees + shared::TOTEM_CREATION_BASE_FEE;
}

totemtoken::GetTotemsResult totemtoken::gettotems(const std::vector<symbol_code>& tickers){
	totems_table totems(get_self(), get_self().value);
	GetTotemsResult result;

	totemstats_table totemstats(get_self(), get_self().value);
	for(const auto& code : tickers){
		auto totem_itr = totems.find(code.raw());
		if(totem_itr != totems.end()){
			auto stats = totemstats.find(totem_itr->max_supply.symbol.code().raw());
            result.results.push_back(TotemAndStats{
                .totem = *totem_itr,
                .stats = *stats
            });
		}
	}
	return result;
}

totemtoken::GetTotemsResult totemtoken::listtotems(const uint32_t& per_page, const std::optional<uint64_t>& cursor){
	totems_table totems(get_self(), get_self().value);
	GetTotemsResult result;

	auto totem_itr = totems.begin();
	if(cursor.has_value()){
		totem_itr = totems.find(cursor.value());
		if(totem_itr != totems.end()){
			++totem_itr;
		}
	}

	uint32_t count = 0;
	totemstats_table totemstats(get_self(), get_self().value);
	while(totem_itr != totems.end() && count < per_page){
		auto stats = totemstats.find(totem_itr->max_supply.symbol.code().raw());
		result.results.push_back(TotemAndStats{
			.totem = *totem_itr,
			.stats = *stats
		});
		result.cursor = totem_itr->max_supply.symbol.code().raw();
		++totem_itr;
		++count;
	}

	result.has_more = totem_itr != totems.end();
	return result;
}

totemtoken::GetBalancesResult totemtoken::getbalances(const std::vector<name>& accounts, const std::vector<symbol_code>& tickers){
	GetBalancesResult result;

	for(const auto& account : accounts){
		balances_table balances(get_self(), account.value);
		if(tickers.size() == 0){
            auto bal_iter = balances.begin();
            while(bal_iter != balances.end()){
                result.balances.push_back(AccountBalance{
                    .account = account,
                    .balance = bal_iter->balance
                });
                ++bal_iter;
            }
        } else {
            for(const auto& code : tickers){
                auto it = balances.find(code.raw());
                if(it != balances.end()){
                    result.balances.push_back(AccountBalance{
                        .account = account,
                        .balance = it->balance
                    });
                }
            }
        }
	}

	return result;
}