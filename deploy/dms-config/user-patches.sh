#!/bin/bash
# docker-mailserver user-patches hook (official mechanism, runs on EVERY container
# start, before daemons launch): installs the REST bridge into supervisor so it
# survives container recreates — no manual copy step, unlike the original NAS setup.
set -e

cp /tmp/docker-mailserver/dms-gui/rest-api.conf /etc/supervisor/conf.d/rest-api.conf
chmod 600 /etc/supervisor/conf.d/rest-api.conf

# If supervisord is already up (restart inside a running container), reload it;
# during first boot supervisord starts after this hook and picks the conf up itself.
supervisorctl reread >/dev/null 2>&1 || true
supervisorctl update >/dev/null 2>&1 || true

echo "user-patches: rest-api bridge installed"
