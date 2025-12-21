# Totem & Mods

Totems are an experimental new chain-agnostic token standard and marketplace that allows developers to modify the behavior of tokens without having to modify the underlying code or compromise security.

## How do they work?

When you create a Totem you specify an array of contract names. Those contracts are mods that are deployed to the market. Those Mods can listen for a variety of hooks and additively modify the behavior of the token.

Hooks for on_notify are provided for the following actions:
- `created`: when the token is created
- `mint`: when tokens are minted
  - You can also register a `mint` action in your Mod to become a `minter` mod.
- `transfer`: when tokens are transferred
- `burn`: when tokens are burned
- `open`: when an account opens a balance for the token
- `close`: when an account closes a balance for the token

Whenever one of these actions is called on the Totem, all mods that have registered for that action will be notified in the order they were added by the creator.

## Totem allocations

When creating a Totem, the creator must specify how to allocate the initial supply of tokens. The creator can allocate tokens to any number of accounts, including mods.

If a mod is meant to be able to mint tokens, it can be allocated some initial supply, and then register itself as a `minter` mod. When users call the `mint` action on the Totem it will do three things:
1. Call the `mint` action on the specified mod, allowing them to enforce their own minting logic.
2. Notify all mods that have registered for the `mint` on_notify hook.
3. Transfer any payment sent along to the mod that minted the tokens (always in A/Vaulta tokens, even if payment was made in EOS)

## Required Actions

Modders are able to register a list of required actions that must be packed into the transaction when calling an action on the Totem. This allows mods to enforce that certain actions are always called together. 

For example, a mod can require a `buyrambytes` action to be included along with a `transfer` hook so that users will pay for some row storage that is needed for the mod to function. Or, a mod can require a `setup` action to be included along with the `created` action to ensure that users set up their mod correctly when creating the Totem.

Required actions can also have parameters that are predefined, and must match what the modder specified when first publishing the tokens. For instance you can require that a `buyrambytes` action is included with a specific number of bytes, and your mod as the recipient. You can also require that field be the creator/sender, or even the ticker of the totem itself.

```cpp
enum FieldType : uint8_t {
    // A field that will always be the executing account
    SENDER = 0,
    // A user provided field (requires input)
    DYNAMIC = 1,
    // A field that is always the same value (mod-specified)
    STATIC = 2,
    // A field that will always be the ticker itself
    TOTEM = 3
    // To ignore a property, simply do not specify it here.
    // Any ignored property should be able to be empty (like `memo` on a transfer action)
};
```

All of these things are enforced at the smart contract level, and if any of the actions that are required are not included in the transaction with the exact specifications, the transaction will revert.

## Use the library and interface!

There are two very useful parts of this repository for Mod developers:
- `/contracts/interface/mod.interface.hpp` - This is a smart contract example file you can use to build your own mods and comes with the basic boilerplate. It is auto-generated from the totems contract, so it'll always be up to date. 
- `/contracts/library/totems.hpp` - Just `#include "totems.hpp"` this in your mod and you'll get a lot of useful functions and types to make your mod development easier. See the `/contracts/mods/whaleblock.cpp` for an example of using it for some basic stuff.

## Interface/signature changes from standard tokens

Totems have some changes from the standard `eosio.token`:
- There is no longer a `retire` action, instead there is a `burn` action which can be called by anyone.
- The `issue` action is now named `mint` and can be called by anyone.
- The `create` action's signature is very different.
- The `stat` table exists for backwards compatibility with tooling, BUT, it is only used to register the totem and its maximum supply. The actual Totem information is tracked in the `totems` table. That table is also scoped to `get_self()` instead of the token symbol, so that it's easier to iterate the Totems that have been created.

## Build

You need docker to build the contracts.

```shell
bun build.ts
```

## Test

You'll need to have a Jungle account for some tests, copy the `.env.example` to `.env` and fill in your account/key details.

> Note: It will put contracts onto that account!

```shell
bun test
```

