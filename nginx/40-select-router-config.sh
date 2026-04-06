#!/bin/sh
set -eu

NORMAL_ROUTER_VALUE="${NORMAL_ROUTER:-false}"

case "$NORMAL_ROUTER_VALUE" in
  true|TRUE|True|1|yes|YES|on|ON)
    cp /etc/nginx/conf.d/default.browser.conf /etc/nginx/conf.d/default.conf
    ;;
  *)
    cp /etc/nginx/conf.d/default.hash.conf /etc/nginx/conf.d/default.conf
    ;;
esac
