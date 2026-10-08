# Self-hosting implementation status

Public source inventory reviewed on 2026-10-04; actual private-backend platform verified on 2026-10-08. This is an engineering inventory, not public VPS acceptance. The historical inventory counts below came from `17247d9d`; current Pro/self-host code is pushed on `feat/cloud-subscriptions` at `fb792a53`, including main `4e225c31`.

## Verified now

| Item | Evidence | Limit |
| --- | --- | --- |
| Software license | Root `LICENSE`, MIT | Other dependencies retain their own licenses |
| Public backend source | `git ls-tree -r --name-only origin/main dashboard/edge-patches` contains 23 `.ts` entry files | Repository inventory is not deployed-source parity |
| Public SQL | `git ls-tree -r --name-only origin/main migrations` contains 33 `.sql` files | Incremental history, not a fresh-install baseline |
| Frontend target configuration | `dashboard/src/lib/insforge-config.ts` reads `VITE_INSFORGE_BASE_URL` and `VITE_INSFORGE_ANON_KEY` before the official fallback | Build-time configuration; published binaries do not change |
| CLI target configuration | `src/lib/runtime-config.js`, `src/commands/init.js`, `src/commands/device-login.js` | Persistence/env resolution differs across paths |
| InsForge platform self-hosting | Official Docker Compose, setup script and README | Platform support does not bootstrap the TokenTracker application |

The core `tokentracker_devices`, `tokentracker_device_tokens`, `tokentracker_hourly`, `tokentracker_device_machine`, profile and device-code tables have no matching complete creation baseline in the public migration directory. The first migration directly alters an existing badges table. `20260821060000_ban-confirmed-leaderboard-manipulation.sql` additionally requires a precise production evidence cohort and aborts if it is absent. These are concrete reasons not to run `db migrations up --all` for a fresh install.

The branch adds a clean private-backend installer, explicit free instance policy and 14-function deployment manifest. It does not install public profile/leaderboard services or enable archival. The official v2.3.3 Linux stack now passes actual auth/RLS, all 13 install steps, unchanged reinstall, 14 HTTP flows, source parity and two-user private access. Database/storage recovery and standard browser session restore are closing; public VPS HTTPS and native-client routing still need their own acceptance. [Backend installation and evidence](self-hosting-backend.md)

## Required before supported release

- [x] Produce a clean private schema/RPC/trigger/RLS baseline, free of production users, credentials, transaction records and operator-specific data repairs. Keep platform auth separate. Record installation steps and checksums; unchanged reinstall preserves data and altered steps fail explicitly. A future upgrade still requires its own reviewed manifest.
- [x] Pin and validate official InsForge v2.3.3 images, actual PostgreSQL15.18/Deno2.0.6 and SDK1.4.5. Actual signup/signin, `auth.uid()`, ownership RLS, foreign keys and anon/authenticated/project_admin privilege checks pass. CommonJS and locked dependency compatibility are verified by all14 HTTP200, not only deployment status.
- [x] Add explicit free `self_hosted` access behavior under instance-owner control. Private reads/uploads remain authenticated; client-role RPC/table access stays denied. Device quotas and hosted history windows do not apply, and no fake payment or preview entitlement is required.
- [x] Make the self-hosted device-authorize build use the selected dashboard origin and verify its grant/poll/upload flow locally.
- [ ] Align CLI persistent config, local API auth/account proxy, dashboard SDK/functions URLs and native callback targets. Verify that all requests stay on the chosen instance.
- [ ] Define an instance-switch flow that preserves local data, clears old account/token caches and prevents replaying credentials against another instance. Test both directions independently.
- [x] Provide a deployment manifest for the private backend's 14 required functions, including device-flow authorization and rename. Bundle local imports and pin InsForge SDK 1.4.5. This is a separate manifest from `scripts/build-cloud-functions.cjs`; public-community and payment webhook deployment are excluded.
- [ ] Configure private storage policies, optional OAuth/email, HTTPS/cookies/CORS and SPA callback routes. Disable official-community publishing on self-hosted clients by default.
- [ ] Document and verify bounded schedules, backups, restore and upgrades. Run archive activation checks separately before moving any history.
- [ ] Execute fresh-install, two-device sync, account isolation, duplicate/correction, timezone, backup/restore and upgrade tests on a real isolated VPS. Test supported native clients against that instance.

Application installation and actual private functions are verified in an isolated official local Linux stack. Two fresh platform instances reject each other's JWT, anonymous key and refresh cookie. Backup recovery is being verified separately after making the second instance a restore target. The original paid InsForge project remains unchanged by this local lab. Public VPS HTTPS, standard browser restore, native routing and recovery gates remain distinct.

## Reproduce the source checks

Run from the TokenTracker repository. These commands only inspect tracked source and counts:

```sh
git rev-parse origin/main
git show origin/main:LICENSE
git ls-tree -r --name-only origin/main dashboard/edge-patches
git ls-tree -r --name-only origin/main migrations
rg -n 'VITE_INSFORGE_BASE_URL|VITE_INSFORGE_ANON_KEY' dashboard/src/lib/insforge-config.ts
rg -n 'verification_uri' dashboard/edge-patches/tokentracker-device-flow-authorize.ts
rg -n 'resolveRuntimeConfig' src/lib/local-api.js src/commands/device-login.js
```

## Official source references

- [InsForge self-hosting and supported interfaces](https://github.com/InsForge/InsForge)
- [Image-based Compose stack](https://github.com/InsForge/InsForge/blob/main/deploy/docker-compose/docker-compose.yml)
- [Setup script](https://github.com/InsForge/InsForge/blob/main/deploy/setup.sh)
- [Platform environment template](https://github.com/InsForge/InsForge/blob/main/.env.example)

Recheck these sources at implementation time. Tracking the latest upstream branch does not pin a deployable release.
