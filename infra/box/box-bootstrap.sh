#!/usr/bin/env bash
# take a fresh ubuntu 26.04 box to a host that can run the wall.
#
# idempotent by construction: every step checks for the state it wants
# before creating it, so running this twice is a no-op and running it
# again after a partial failure resumes rather than duplicates.
#
# it does NOT start the wall, touch railway, or move any data. it leaves
# a box with docker, a firewall, a non-root user and the repo checked
# out. docs/box-bringup.md is what you run after this.
#
#   sudo bash box-bootstrap.sh --user mortal --repo https://github.com/keycho/mortal-systems.git
#
set -euo pipefail

USER_NAME="mortal"
REPO_URL="https://github.com/keycho/mortal-systems.git"
REPO_BRANCH="main"
REPO_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --user) USER_NAME="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --branch) REPO_BRANCH="$2"; shift 2 ;;
    --dir) REPO_DIR="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$REPO_DIR" ] || REPO_DIR="/home/${USER_NAME}/mortal-systems"

say() { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "run as root (sudo bash $0)" >&2; exit 1; }

. /etc/os-release
say "host: ${PRETTY_NAME:-unknown} (${VERSION_CODENAME:-no codename}), kernel $(uname -r)"
if [ "${VERSION_ID:-}" != "26.04" ]; then
  note "expected ubuntu 26.04; continuing, but the notes below assume it"
fi

# ---------------------------------------------------------------- packages
say "base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
  apt-listchanges jq

# ---------------------------------------------------------------- sudo user
say "user ${USER_NAME}"
if id "$USER_NAME" >/dev/null 2>&1; then
  note "already exists"
else
  adduser --disabled-password --gecos "" "$USER_NAME"
  note "created (no password; use your ssh key)"
fi
usermod -aG sudo "$USER_NAME"

# an admin who cannot log in is a locked-out box: carry root's authorized
# keys over the first time, so the key that opened this session still works
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$USER_NAME" -g "$USER_NAME" "/home/${USER_NAME}/.ssh"
  if [ ! -s "/home/${USER_NAME}/.ssh/authorized_keys" ]; then
    install -m 600 -o "$USER_NAME" -g "$USER_NAME" \
      /root/.ssh/authorized_keys "/home/${USER_NAME}/.ssh/authorized_keys"
    note "copied root's authorized_keys to ${USER_NAME}"
  else
    note "authorized_keys already present; left alone"
  fi
else
  note "WARNING: /root/.ssh/authorized_keys is missing. add a key for"
  note "         ${USER_NAME} before you close this session."
fi

# ---------------------------------------------------------------- firewall
say "ufw (22, 80, 443)"
ufw allow 22/tcp   >/dev/null
ufw allow 80/tcp   >/dev/null
ufw allow 443/tcp  >/dev/null
ufw --force enable >/dev/null
ufw status verbose | sed 's/^/   /'
note "docker publishes ports by writing its own iptables rules, which ufw"
note "does not filter. the compose file binds the wall to 127.0.0.1 for"
note "exactly that reason; only caddy is public."

# ---------------------------------------------------------------- fail2ban
say "fail2ban"
if [ ! -f /etc/fail2ban/jail.local ]; then
  cat > /etc/fail2ban/jail.local <<'JAIL'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
JAIL
  note "wrote /etc/fail2ban/jail.local"
else
  note "jail.local already present; left alone"
fi
systemctl enable --now fail2ban >/dev/null

# ------------------------------------------------------- unattended upgrades
say "unattended-upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUTO'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
AUTO
# security updates only, and never a surprise reboot in the middle of a
# life: the wall is a show with a clock, and a box that reboots itself
# mid-heartbeat kills identities the record cannot explain
if ! grep -q 'Unattended-Upgrade::Automatic-Reboot "false"' /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null; then
  cat > /etc/apt/apt.conf.d/51mortal-no-reboot <<'NOREBOOT'
Unattended-Upgrade::Automatic-Reboot "false";
NOREBOOT
fi
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ------------------------------------------------------------ user namespaces
say "unprivileged user namespaces"
# chromium's sandbox is built from user namespaces, and tier-1 open-web
# reading refuses to run without the sandbox. two different knobs govern
# this and which one exists depends on the kernel:
#
#   kernel.unprivileged_userns_clone      debian/older ubuntu patch, and
#                                         gone from recent mainline kernels
#   kernel.apparmor_restrict_unprivileged_userns
#                                         ubuntu 23.10+ apparmor gate; on
#                                         24.04+ THIS is the one that bites
#
# setting a sysctl that does not exist makes sysctl --system fail, taking
# the ones that do exist with it. so each is written only if the kernel
# actually exposes it.
SYSCTL_FILE=/etc/sysctl.d/99-mortal-userns.conf
: > "$SYSCTL_FILE"
if [ -e /proc/sys/kernel/unprivileged_userns_clone ]; then
  echo 'kernel.unprivileged_userns_clone=1' >> "$SYSCTL_FILE"
  note "kernel.unprivileged_userns_clone=1 persisted"
else
  note "kernel.unprivileged_userns_clone does not exist on this kernel"
  note "  (expected on 26.04: the knob was dropped upstream)"
fi
if [ -e /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]; then
  echo 'kernel.apparmor_restrict_unprivileged_userns=0' >> "$SYSCTL_FILE"
  note "kernel.apparmor_restrict_unprivileged_userns=0 persisted"
  note "  (this is the knob that matters on ubuntu 24.04 and later)"
fi
echo 'user.max_user_namespaces=63359' >> "$SYSCTL_FILE"
sysctl --system >/dev/null
note "max_user_namespaces = $(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo '?')"

# ---------------------------------------------------------------- docker
say "docker + compose plugin"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  note "already installed: $(docker --version), $(docker compose version --short)"
else
  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # 26.04 is new enough that download.docker.com may not have a pool for
  # its codename on day one. check, and fall back to the newest suite
  # docker does publish rather than writing a source that 404s on every
  # apt update from here on.
  CODENAME="${VERSION_CODENAME:-}"
  DOCKER_SUITE="$CODENAME"
  if [ -z "$CODENAME" ] || ! curl -fsI "https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release" >/dev/null 2>&1; then
    note "docker has no apt suite for '${CODENAME:-unknown}' yet"
    for FALLBACK in questing noble jammy; do
      if curl -fsI "https://download.docker.com/linux/ubuntu/dists/${FALLBACK}/Release" >/dev/null 2>&1; then
        DOCKER_SUITE="$FALLBACK"
        note "falling back to the '${FALLBACK}' suite (packages are compatible)"
        break
      fi
    done
  fi

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${DOCKER_SUITE} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  if ! apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin; then
    note "docker's repo failed; falling back to ubuntu's own docker.io"
    note "  (docker compose v2 then comes from docker-compose-v2)"
    rm -f /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker.io docker-compose-v2
  fi
fi
systemctl enable --now docker >/dev/null
usermod -aG docker "$USER_NAME"
note "added ${USER_NAME} to the docker group (log out and back in to use it)"

# ---------------------------------------------------------------- the repo
say "repository"
if [ -d "$REPO_DIR/.git" ]; then
  note "already cloned at $REPO_DIR; fetching"
  sudo -u "$USER_NAME" git -C "$REPO_DIR" fetch --all --quiet
else
  sudo -u "$USER_NAME" git clone --quiet --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
  note "cloned $REPO_URL ($REPO_BRANCH) to $REPO_DIR"
fi

# ---------------------------------------------------------------- report
say "ready"
cat <<REPORT
   user:        ${USER_NAME} (sudo, docker)
   repo:        ${REPO_DIR}
   firewall:    22, 80, 443
   docker:      $(docker --version 2>/dev/null || echo 'not reporting')
   compose:     $(docker compose version --short 2>/dev/null || echo 'not reporting')
   userns:      max_user_namespaces=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo '?')$(
     [ -e /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] &&
     printf ', apparmor_restrict=%s' "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)"
   )

   nothing is running yet, and nothing on railway was touched.
   next: docs/box-bringup.md
REPORT
