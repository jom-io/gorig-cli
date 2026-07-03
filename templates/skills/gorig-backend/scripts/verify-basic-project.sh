#!/bin/sh
set -eu

project_root=${1:-.}
mode=${2:-local}

case "$mode" in
  local|dev|prod) ;;
  *)
    echo "error=mode must be local, dev, or prod" >&2
    exit 1
    ;;
esac

project_root=$(cd "$project_root" && pwd)
config="$project_root/_bin/$mode.yaml"

if [ ! -f "$project_root/go.mod" ] || [ ! -f "$config" ]; then
  echo "error=not a generated Gorig project or configuration missing" >&2
  exit 1
fi

port=$(sed -n 's/^[[:space:]]*addr:[[:space:]]*":\([0-9][0-9]*\)"[[:space:]]*$/\1/p' "$config" | head -n 1)
if [ -z "$port" ]; then
  echo "error=unable to read api.rest.addr from $config" >&2
  exit 1
fi

cache_root=${GOCACHE:-/tmp/gorig-skill-go-cache}
binary="$project_root/.cache/verify-basic-project"
log_file="$project_root/.cache/verify-basic-project-$mode.log"
pid=

cleanup() {
  status=$?
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -INT "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  return "$status"
}
trap cleanup EXIT INT TERM

mkdir -p "$project_root/.cache"

unformatted=$(cd "$project_root" && gofmt -l .)
if [ -n "$unformatted" ]; then
  echo "error=unformatted Go files" >&2
  echo "$unformatted" >&2
  exit 1
fi

(cd "$project_root" && GOCACHE="$cache_root" go vet ./...)
(cd "$project_root" && GOCACHE="$cache_root" go build -o "$binary" ./_cmd)
(cd "$project_root" && GOCACHE="$cache_root" go test ./... -v)

previous_dir=$(pwd)
cd "$project_root"
GORIG_SYS_MODE="$mode" "$binary" >"$log_file" 2>&1 &
pid=$!
cd "$previous_dir"

base_url="http://127.0.0.1:$port"
ready=false
ping_response=
attempt=0
while [ "$attempt" -lt 40 ]; do
  if ping_response=$(curl --fail --silent --max-time 2 "$base_url/ping" 2>/dev/null); then
    ready=true
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "error=project exited before becoming ready" >&2
    cat "$log_file" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 0.25
done

if [ "$ready" != true ]; then
  echo "error=project did not become ready on $base_url" >&2
  cat "$log_file" >&2
  exit 1
fi

hello_response=$(curl --fail --silent --max-time 5 "$base_url/hello?name=Gorig")

echo "$ping_response" | grep '"code":200' > /dev/null
echo "$hello_response" | grep '"code":200' > /dev/null
echo "$hello_response" | grep "\"mode\":\"$mode\"" > /dev/null
echo "$hello_response" | grep '"message":"hello Gorig"' > /dev/null

kill -INT "$pid"
if ! wait "$pid"; then
  echo "error=project did not shut down cleanly" >&2
  cat "$log_file" >&2
  exit 1
fi
pid=

grep 'Shutting down the system \[OK\]' "$log_file" > /dev/null

echo "mode=$mode"
echo "base_url=$base_url"
echo "ping=$ping_response"
echo "hello=$hello_response"
echo "graceful_shutdown=ok"
