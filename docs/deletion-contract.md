# the deletion contract

ordered, journaled, idempotent, resumable. implemented in
`packages/runtime/src/destroy/destroy.ts`; verified by unit tests
(idempotency, failure-retention, crash-resume) and the lifecycle suite
(G12 completeness, G13 non-contagion, G14 crash-resume across a real
process boundary).

```text
D0 capture   resolve absolute paths (profile, files, downloads, companion instance); write destroy_journal row
D1 fence     state -> destroying; cancel lifecycle jobs; refuse launch/resume
D2 halt      sigterm the identity's process tree; sigkill stragglers after 5s; verify exit
D3 profile   rm -rf profile dir (retry loop for os file locks)
D4 files     rm -rf files root + downloads + companion instance dir
D5 rows      delete ai_messages, notes, bookmarks for the identity
D6 record    identities row: state=destroyed, destroyed_at set, manifest_json replaced with tombstone {id, name, destroyedAt}
D7 finalize  activity_log destroyed event containing the DestructionReport; delete destroy_journal row
```

- the journal is written at D0 with the captured paths; deletion never
  re-derives paths afterwards.
- the first failing step aborts the run and leaves the journal in place; the
  destruction resumes from that step on the next runtime start. every step is
  safe to repeat.
- D7 is deliberately not journaled — it is the step that clears the journal;
  its completion is observable as the finalized destroyed event plus the
  missing journal row.
- every destruction report carries a fixed caveats array (server-side data,
  exported files, os artifacts, storage-hardware recoverability). it is never
  trimmed.

## what "destroyed" means, printed verbatim in the ui

mortal systems removed the identity's browser profile, files, downloads,
notes, memory, and ai history from this machine, and recorded the
destruction. mortal systems cannot remove: data websites stored server-side
while you were logged in, anything you exported or moved outside the
identity's folders, os-level artifacts (search indexes, thumbnails, backups
you configured), or data recoverable by forensic tools on some storage
hardware. destroyed means removed, not forensically shredded.

## windows caveat (risk r6)

file-lock behavior on windows makes D3 retries slower and can require
reboot-time deletion for stragglers. the contract handles it (journal +
resume), but windows is untested in this build; the marketing claim
"destroys itself" must not ship for windows until D3 behavior is tested and
the copy carries this caveat.
