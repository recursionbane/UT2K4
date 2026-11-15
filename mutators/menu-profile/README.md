# Menu profile

`MenuProfile.MenuProfileBootstrap` is a tiny authored bootstrap for the standalone `NoIntro` cinematic menu. It makes Deathmatch the first native Instant Action game type, preserving the other game types. The profile also stores `DM-Rankin` in the native User.ini `LastSelectedMap` field.

Enable this bootstrap only on the menu URL. The gameplay preset remains LocalAim, LocalRecovery, the original Matrix mutator, and MatrixModern. No UCL registration is shipped for the bootstrap, so it is not offered as a gameplay mutator. A bounded menu-startup timer waits for the local GUI controller, sets its transient initial selection once, then stops. It has no per-frame gameplay hook and ignores multiplayer and non-cinematic worlds.

The original Matrix mod excludes Assault and Onslaught. Native `LastGameType` is transient and `GamePos` is not a config property, so an INI-only game-type setting is ineffective. This package uses ordinary UnrealScript class-default access, checked by the compiler, instead of modifying the original GUI package.

Build with `tools/build-assist.py` and a matching 3369 compiler/data installation including GUI2K4 and XInterface. No original game or GUI package is redistributed here.
