#!/bin/sh
# the wall service entrypoint. chromium's sandbox refuses to start under
# uid 0, and tier-1 open-web browsing refuses to start without the
# sandbox, so this script's whole job is to stop being root: make the
# volume belong to the node user, then drop to it before node starts.
#
# every step announces itself. an earlier incident came up with an empty
# wall and one scrolled-away line; the rule now is that anything which
# can leave the wall empty says so at the top of the log, loudly, with
# the state it saw.
set -e

ROOT="${MORTAL_ROOT:-/data}"
USER_NAME=node

say() { echo "entrypoint: $*"; }

if [ "$(id -u)" != "0" ]; then
  say "already unprivileged (uid $(id -u)); starting the service directly"
  exec "$@"
fi

say "root at start; state root is $ROOT"

if ! mkdir -p "$ROOT" 2>/dev/null; then
  say "FATAL: cannot create $ROOT. is the volume mounted, and writable?"
  exit 1
fi

# idempotent and safe on every boot: chown only what is not already
# ours, so a large volume costs one stat pass rather than a full rewrite,
# and a volume left root-owned by a pre-entrypoint boot is repaired here.
# this is the exact case that follows a privilege-drop deploy.
OWNED_BY_OTHERS=$(find "$ROOT" ! -user "$USER_NAME" -print -quit 2>/dev/null || true)
if [ -n "$OWNED_BY_OTHERS" ]; then
  say "state root has paths not owned by $USER_NAME (e.g. $OWNED_BY_OTHERS); repairing ownership"
  if chown -R "$USER_NAME:$USER_NAME" "$ROOT"; then
    say "ownership repaired"
  else
    say "FATAL: chown of $ROOT failed. if the volume is read-only the wall cannot keep its record; refusing to start a wall that cannot remember."
    exit 1
  fi
else
  say "state root already owned by $USER_NAME; nothing to repair"
fi

# prove it rather than trust it: the service opening its stores is the
# next thing that happens, and a failure there is fatal and confusing.
# a real write, not test -w, because a read-only mount passes the mode
# check and fails the write.
if ! su -s /bin/sh -c "touch '$ROOT/.write-probe' && rm -f '$ROOT/.write-probe'" "$USER_NAME" 2>/dev/null; then
  say "FATAL: $USER_NAME still cannot write inside $ROOT after the chown."
  say "       $ROOT itself: $(ls -ld "$ROOT")"
  # the mode on $ROOT is usually fine and the block is somewhere above it:
  # every ancestor needs +x for $USER_NAME to even reach the mount. print
  # the whole chain so the offending directory is visible rather than
  # guessed at, and say which one it is.
  say "       path from the root down:"
  DIR="$ROOT"
  CHAIN=""
  while [ "$DIR" != "/" ] && [ -n "$DIR" ]; do
    CHAIN="$DIR
$CHAIN"
    DIR=$(dirname "$DIR")
  done
  echo "$CHAIN" | while IFS= read -r p; do
    [ -n "$p" ] && say "         $(ls -ld "$p" 2>/dev/null || echo "$p (cannot stat)")"
  done
  BLOCKED=$(echo "$CHAIN" | while IFS= read -r p; do
    [ -n "$p" ] || continue
    su -s /bin/sh -c "test -x '$p'" "$USER_NAME" 2>/dev/null || { echo "$p"; break; }
  done)
  if [ -n "$BLOCKED" ]; then
    say "       cause: $USER_NAME cannot traverse $BLOCKED, so it never reaches $ROOT."
    say "              that directory needs o+x (or $USER_NAME ownership); chowning $ROOT alone cannot fix it."
  else
    say "       cause: the volume is most likely mounted read-only."
  fi
  exit 1
fi
say "$ROOT is writable by $USER_NAME"

# chromium wants a home it can write; setpriv keeps the environment, so
# without this HOME stays /root and the browser's caches land nowhere
HOME_DIR=$(getent passwd "$USER_NAME" | cut -d: -f6)
[ -n "$HOME_DIR" ] || HOME_DIR=/home/$USER_NAME
mkdir -p "$HOME_DIR" && chown "$USER_NAME:$USER_NAME" "$HOME_DIR"
export HOME="$HOME_DIR"
say "dropping to $USER_NAME (home $HOME) and starting the service"

exec setpriv --reuid="$USER_NAME" --regid="$USER_NAME" --init-groups "$@"
