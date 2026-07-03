#!/bin/sh
set -eu

skill_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
online=${1:-}

required_files="
$skill_dir/SKILL.md
$skill_dir/references/source-policy.md
$skill_dir/references/onboarding-files.md
$skill_dir/references/capability-matrix.md
$skill_dir/references/framework-api.md
$skill_dir/references/project-bootstrap.md
$skill_dir/references/configuration.md
$skill_dir/references/service-lifecycle.md
$skill_dir/references/testing.md
$skill_dir/references/source-map.md
$skill_dir/assets/api-doc-template.md
$skill_dir/assets/module-readme-template.md
$skill_dir/scripts/detect-gorig-context.sh
$skill_dir/scripts/verify-basic-project.sh
"

for file in $required_files; do
  if [ ! -f "$file" ]; then
    echo "missing=$file" >&2
    exit 1
  fi
done

echo "local_sources=ok"

if [ "$online" != "--online" ]; then
  echo "online_sources=skipped"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "error=curl is required for --online" >&2
  exit 1
fi

urls=$(sed -n 's/.*`\(https:\/\/github\.com\/[^`]*\)`.*/\1/p' "$skill_dir/references/source-map.md")
printf '%s\n' "$urls" | xargs -n 1 -P 4 sh -c '
  url=$1
  curl --fail --silent --show-error --location --range 0-0 --connect-timeout 10 --max-time 20 "$url" >/dev/null
  echo "online_source=ok $url"
' _
