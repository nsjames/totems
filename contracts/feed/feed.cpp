#include <feed/feed.hpp>

void feed::login( const name& user ) {
	require_auth(user);
}
