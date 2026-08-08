#!/bin/sh
# the wall service entrypoint. chromium's sandbox refuses to start under
# uid 0, and tier-1 open-web browsing refuses to start without the
# sandbox — so this script's whole job is to stop being root: fix the
# volume's ownership, then drop to the node user before node starts.
# whether the sandbox then actually works depends on the host kernel
# allowing unprivileged user namespaces; the boot-time probe measures
# that and gates external navigation off honestly when it cannot.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p "${MORTAL_ROOT:-/data}"
  chown -R node:node "${MORTAL_ROOT:-/data}"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
