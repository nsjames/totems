# Totems Mod CLI

A CLI for building and testing [Totem Mods](https://totems.fun).

## Usage

You don't need to install this, just use `npx`:

```bash
npx @totems/mods create <mod-name> [path (defaults to mod-name)]
```

If you run that command against a non-existing directory, it will create a new Totems Mod project for you with the given name.

If you run it against an existing directory, it will create a new mod inside the `contracts` directory.

