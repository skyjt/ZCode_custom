#!/bin/sh
export OFFICECLI_SKIP_UPDATE=1 OFFICECLI_NO_AUTO_INSTALL=1 OFFICECLI_NO_AUTO_RESIDENT=1
plugin_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd) || exit 1
exec "$plugin_dir/bin/officecli" "$@"
