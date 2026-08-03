# deploying apps/web to vercel

the site is the only thing vercel hosts. the runtime, sqlite, identity data,
chromium process management, lifecycle scheduling, destruction, and the
loopback api execute only locally via mortal manager + mortal runtime. the
site never claims otherwise; any on-site demonstration is labeled a preview.

## project settings

- **root directory:** `apps/web`
- **framework preset:** next.js
- **install command:** `pnpm install --filter mortal-systems --filter web...` (root project included so the turbo binary installs)
- **build command:** `cd ../.. && pnpm turbo run build --filter=web` (turbo builds @mortal/schema first; a filtered install alone brings schema source but nothing would build its dist)

`apps/web` has zero native dependencies: no rust, tauri, chromium, or
better-sqlite3 anywhere in its graph. it imports `@mortal/schema` only
(types + the enforcement-table constants the guarantees page renders).
`pnpm build:web` at the repo root must succeed on a machine with none of the
native toolchain installed; that property is part of the poc's definition of
done.

## flow

push to github -> vercel builds apps/web -> preview deployments for
branches/prs -> production from the default branch. after the github repo
rename to the mortal-systems name (founder action), point the vercel project
at the renamed repo; github redirects the old name in the interim.
