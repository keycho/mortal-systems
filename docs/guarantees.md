# guarantees — enforced, advisory, roadmap

the user-facing source of truth. this table is generated from the same
constants (`@mortal/schema` ENFORCEMENT_TABLE) that the runtime capabilities
api, the manager, the companion, and the public site all read. every
"enforced" row must map to at least one automated test in
`tests/guarantees.map.ts` or the build fails (`pnpm check:guarantees`).

| control | value | label | tests |
|---|---|---|---|
| browser state isolation | separate chromium user-data-dir per identity | **enforced** | G1-G7, G16 |
| filesystem partition | identity-partition-only | **enforced** | G8 |
| memory scope | identity-only | **enforced** | G9, G18 |
| history retention | true / false | **enforced** | G15 |
| lifecycle expiry | finite lifetimes fire on schedule | **enforced** | G10, G11 |
| destruction | journaled deletion contract D0-D7 | **enforced** | G12, G13, G14 |
| wallet | none / read-intent / declared | advisory | BADGE-1 |
| network | standard | advisory | BADGE-1 |
| email | none / temporary / dedicated | roadmap | BADGE-1 |
| redaction | false | roadmap | BADGE-1 |

advisory means a declaration shown in the ui, not a technical control (the
wallet row says so in the ui wherever a non-none value appears). roadmap
means not built; the field exists so blueprints can declare intent, and it
enforces nothing today. the schema constrains which labels each field may
carry, so an over-claiming manifest is unrepresentable.

## non-guarantees, printed in the ui

- identities on the same machine share your ip address
- identities on the same machine share your device fingerprint
- websites can correlate identities via behavior, reused accounts, or reused wallets
- clipboard contents you carry between identities are not separated
- data a website already holds server-side is outside witness.run's reach

witness.run separates state and context; it does not make identities
anonymous in version one.
