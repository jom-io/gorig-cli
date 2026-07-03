#!/bin/sh
set -eu

project_root=${1:-.}

if [ ! -d "$project_root" ]; then
  echo "error=project directory not found: $project_root" >&2
  exit 1
fi

project_root=$(cd "$project_root" && pwd)
go_mod="$project_root/go.mod"

if [ ! -f "$go_mod" ]; then
  printf 'project_root=%s\n' "$project_root"
  echo "go_mod=missing"
  exit 2
fi

module_name=$(awk '$1 == "module" { print $2; exit }' "$go_mod")
go_version=$(awk '$1 == "go" { print $2; exit }' "$go_mod")
gorig_version=$(awk '$1 == "github.com/jom-io/gorig" { print $2; exit }' "$go_mod")
replace_target=$(awk '
  $1 == "replace" && $2 == "github.com/jom-io/gorig" && $3 == "=>" { print $4; exit }
  in_replace && $1 == "github.com/jom-io/gorig" && $2 == "=>" { print $3; exit }
  $1 == "replace" && $2 == "(" { in_replace = 1; next }
  in_replace && $1 == ")" { in_replace = 0 }
' "$go_mod")

source_kind=unresolved
source_dir=

case "$replace_target" in
  ./*|../*|/*)
    if [ "${replace_target#/}" != "$replace_target" ]; then
      candidate=$replace_target
    else
      candidate="$project_root/$replace_target"
    fi
    if [ -d "$candidate" ]; then
      source_kind=replace
      source_dir=$(cd "$candidate" && pwd)
    fi
    ;;
esac

if [ -z "$source_dir" ] && [ -n "$gorig_version" ] && command -v go >/dev/null 2>&1; then
  module_cache=$(cd "$project_root" && go env GOMODCACHE 2>/dev/null || true)
  candidate="$module_cache/github.com/jom-io/gorig@$gorig_version"
  if [ -d "$candidate" ]; then
    source_kind=module_cache
    source_dir=$candidate
  fi
fi

if [ -z "$source_dir" ] && [ -d "$project_root/../gorig" ]; then
  source_kind=sibling
  source_dir=$(cd "$project_root/../gorig" && pwd)
fi

printf 'project_root=%s\n' "$project_root"
printf 'module=%s\n' "${module_name:-unknown}"
printf 'go_version=%s\n' "${go_version:-unknown}"
printf 'gorig_version=%s\n' "${gorig_version:-not_required}"
printf 'replace=%s\n' "${replace_target:-none}"
printf 'source_kind=%s\n' "$source_kind"
printf 'source_dir=%s\n' "${source_dir:-not_found}"
