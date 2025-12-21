#include <eosio/eosio.hpp>
#include "../library/verifier.hpp"
using namespace eosio;

CONTRACT validator : public contract {
   public:
      using contract::contract;

	  ACTION validate(
	     const name& sender,
	     const symbol_code& ticker,
	     const std::vector<totems::RequiredAction>& required
	  ){
	     action_verifier::verify(sender, ticker, required);
	  }
};