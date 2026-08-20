#! /bin/bash

ssh my-websites << EOF
  cd /root/meditations
  git pull --rebase
  systemctl restart meditations-admin.service
EOF
