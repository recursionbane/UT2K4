# Local Health Recovery

Authored standalone UT2004 mutator: `LocalRecovery.MutLocalRecovery`. Independent of Matrix and LocalAim. Tested in the Collection's **3369** browser engine; this does not establish 3374 compatibility.

Enabled by default when included in a standalone match. After **five gameplay seconds without damage**, a surviving local human regains **20 HP per gameplay second**, capped at the pawn's normal `HealthMax` (normally 100). Above-normal pickup health is retained. Dead or replaced pawns never heal. Armor, shields, inventory, damage calculation and global gore settings remain unchanged. Incoming damage absorbed by armor still restarts the delay. Pause stops the clock; Matrix slow time also slows recovery.

The five-second delay is inspired by [343 Industries' official Halo Infinite shield explanation](https://support.halowaypoint.com/hc/en-us/articles/24284987877524-Shields-in-Halo-Infinite), which describes shields returning after approximately five seconds without damage and shields/health replenishing. **20 HP per second and applying recovery to UT2004 normal health are this mod's adaptations**, not a claim about Halo's exact rate. This does not regenerate UT2004 armor or shields.

Console controls: `mutate mmRecovery on`, `mutate mmRecovery off`, `mutate mmRecovery status`. Native `MMRECOVERY_READY`, `MMRECOVERY_DAMAGE`, `MMRECOVERY_HEAL` and `MMRECOVERY_STATUS` markers report the gameplay clock and health changes.

The GameRules hook observes incoming damage and delegates the normal damage chain without changing its return value. A timer tracks the currently living local pawn, retains fractional healing between ticks and never revives a corpse. No game assets, external services or credentials are required by this package.

Build the authored packages using [tools/build-assist.py](../../tools/build-assist.py); see the [build instructions](../local-assist/README.md#build). LocalRecovery itself depends only on stock Engine. The combined build also needs the original Matrix dependency for LocalAim and GUI2K4/XInterface for the menu profile.
