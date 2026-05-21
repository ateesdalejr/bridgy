#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./deploy/setup-server.sh

Options:
  --domain VALUE             Public hostname. Default: bridgy.chat
  --port VALUE               Local app port. Default: 3000
  --tunnel-name VALUE        Cloudflare tunnel name. Default: bridgy-dev
  --tunnel-id VALUE          Cloudflare tunnel UUID.
  --credentials-file VALUE   Path to the tunnel credentials JSON.
  --config VALUE             Path to write cloudflared config.
                             Default: deploy/cloudflared.local.yml
  --no-app                   Do not build/start Docker Compose.
  --no-tunnel                Do not write/start cloudflared.
  --help                     Show this help.

Environment:
  BRIDGY_DOMAIN
  BRIDGY_PORT
  BRIDGY_TUNNEL_NAME
  BRIDGY_TUNNEL_ID
  CLOUDFLARED_CREDENTIALS_FILE
  BRIDGY_CLOUDFLARED_CONFIG
  BRIDGY_CLOUDFLARED_LOG
  BRIDGY_CLOUDFLARED_PID

Before running on a new server:
  1. Install Docker, Docker Compose, and cloudflared.
  2. Get the tunnel id and credentials from Cloudflare:
       cloudflared tunnel login
       cloudflared tunnel create bridgy-dev
       cloudflared tunnel route dns bridgy-dev bridgy.chat
     The tunnel id is the UUID printed by create/list.
     The credentials JSON is created locally at:
       ~/.cloudflared/<tunnel-id>.json
  3. On another server, either create a new tunnel there or securely copy
     that JSON file to the same ~/.cloudflared path.
  4. Fill .env with Quo values if you want real SMS sends.

The script tries to find the tunnel UUID automatically from:
  1. an existing cloudflared config,
  2. `cloudflared tunnel list` by tunnel name,
  3. a single UUID-named JSON file in ~/.cloudflared.

Pass --tunnel-id only if auto-detection is ambiguous.
USAGE
}

log() {
  printf '[bridgy-setup] %s\n' "$*"
}

die() {
  printf '[bridgy-setup] ERROR: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp

  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      done = 1
      next
    }
    { print }
    END {
      if (!done) print key "=" value
    }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

env_value() {
  local file="$1"
  local key="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]
}

tunnel_id_from_config() {
  local config="$1"
  local value=""
  [[ -f "$config" ]] || return 0

  value="$(awk '/^tunnel:/ { print $2; exit }' "$config")"
  if is_uuid "$value"; then
    printf '%s\n' "$value"
  fi
}

tunnel_id_from_cloudflared_list() {
  local name="$1"
  local value=""

  value="$(
    cloudflared tunnel list 2>/dev/null |
      awk -v name="$name" '$2 == name && $1 ~ /^[0-9a-fA-F-]{36}$/ { print $1; exit }'
  )"

  if is_uuid "$value"; then
    printf '%s\n' "$value"
  fi
}

tunnel_id_from_single_credentials_file() {
  local dir="$HOME/.cloudflared"
  local files=()
  local file
  local base

  [[ -d "$dir" ]] || return 0

  while IFS= read -r file; do
    files+=("$file")
  done < <(find "$dir" -maxdepth 1 -type f -name '*.json' -print 2>/dev/null)

  [[ "${#files[@]}" -eq 1 ]] || return 0

  base="$(basename "${files[0]}" .json)"
  if is_uuid "$base"; then
    printf '%s\n' "$base"
  fi
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

domain="${BRIDGY_DOMAIN:-bridgy.chat}"
port="${BRIDGY_PORT:-3000}"
tunnel_name="${BRIDGY_TUNNEL_NAME:-bridgy-dev}"
tunnel_id="${BRIDGY_TUNNEL_ID:-}"
credentials_file="${CLOUDFLARED_CREDENTIALS_FILE:-}"
config_path="${BRIDGY_CLOUDFLARED_CONFIG:-$repo_root/deploy/cloudflared.local.yml}"
log_file="${BRIDGY_CLOUDFLARED_LOG:-/tmp/bridgy-cloudflared.log}"
pid_file="${BRIDGY_CLOUDFLARED_PID:-/tmp/bridgy-cloudflared.pid}"
start_app=1
start_tunnel=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      domain="${2:-}"
      shift 2
      ;;
    --port)
      port="${2:-}"
      shift 2
      ;;
    --tunnel-name)
      tunnel_name="${2:-}"
      shift 2
      ;;
    --tunnel-id)
      tunnel_id="${2:-}"
      shift 2
      ;;
    --credentials-file)
      credentials_file="${2:-}"
      shift 2
      ;;
    --config)
      config_path="${2:-}"
      shift 2
      ;;
    --no-app)
      start_app=0
      shift
      ;;
    --no-tunnel)
      start_tunnel=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$domain" ]] || die "Domain cannot be empty."
[[ -n "$port" ]] || die "Port cannot be empty."
[[ -n "$tunnel_name" ]] || die "Tunnel name cannot be empty."

cd "$repo_root"

[[ -f Dockerfile ]] || die "Run this from a Bridgy checkout with Dockerfile present."
[[ -f compose.yaml ]] || die "compose.yaml is missing."

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example"
  cp .env.example .env
fi

set_env_value .env PUBLIC_BASE_URL "https://$domain"
set_env_value .env PORT "$port"

if [[ -z "$(env_value .env QUO_API_KEY)" || -z "$(env_value .env QUO_FROM)" ]]; then
  log "Quo credentials are not fully set in .env. SMS will only work after QUO_API_KEY and QUO_FROM are filled."
fi

if [[ "$start_app" -eq 1 ]]; then
  need_command docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose is not available through 'docker compose'."

  log "Building and starting Bridgy with Docker Compose"
  docker compose up --build -d

  if command -v curl >/dev/null 2>&1; then
    log "Waiting for local health check"
    healthy=0
    for _ in {1..30}; do
      if curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
        healthy=1
        break
      fi
      sleep 1
    done
    [[ "$healthy" -eq 1 ]] || die "Local health check failed at http://127.0.0.1:$port/health"
    log "Local health check passed"
  else
    log "curl is not installed; skipping health check"
  fi
fi

if [[ "$start_tunnel" -eq 1 ]]; then
  need_command cloudflared

  if [[ -z "$tunnel_id" && -f "$config_path" ]]; then
    tunnel_id="$(tunnel_id_from_config "$config_path")"
    [[ -z "$tunnel_id" ]] || log "Detected tunnel id from $config_path"
  fi

  if [[ -z "$tunnel_id" ]]; then
    tunnel_id="$(tunnel_id_from_cloudflared_list "$tunnel_name")"
    [[ -z "$tunnel_id" ]] || log "Detected tunnel id for '$tunnel_name' from cloudflared tunnel list"
  fi

  if [[ -z "$tunnel_id" ]]; then
    tunnel_id="$(tunnel_id_from_single_credentials_file)"
    [[ -z "$tunnel_id" ]] || log "Detected tunnel id from the only credentials JSON in ~/.cloudflared"
  fi

  [[ -n "$tunnel_id" ]] || die "Could not auto-detect the tunnel id. Run 'cloudflared tunnel list' or pass --tunnel-id <uuid>."

  if [[ -z "$credentials_file" && -f "$config_path" ]]; then
    credentials_file="$(awk '/^credentials-file:/ { print $2; exit }' "$config_path")"
  fi

  if [[ -z "$credentials_file" ]]; then
    credentials_file="$HOME/.cloudflared/$tunnel_id.json"
  fi

  [[ -f "$credentials_file" ]] || die "Missing tunnel credentials: $credentials_file. Copy the Cloudflare tunnel JSON to this server first."

  mkdir -p "$(dirname "$config_path")"
  if [[ -f "$config_path" ]]; then
    cp "$config_path" "$config_path.bak.$(date +%Y%m%d%H%M%S)"
  fi

  log "Writing cloudflared config to $config_path"
  cat > "$config_path" <<EOF
tunnel: $tunnel_id
credentials-file: $credentials_file

ingress:
  - hostname: $domain
    service: http://127.0.0.1:$port
  - service: http_status:404
EOF

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
    log "cloudflared already appears to be running with PID $(cat "$pid_file")"
  else
    log "Starting cloudflared in the background"
    nohup cloudflared tunnel --config "$config_path" run "$tunnel_name" > "$log_file" 2>&1 &
    echo "$!" > "$pid_file"
    sleep 2

    if ! kill -0 "$(cat "$pid_file")" >/dev/null 2>&1; then
      tail -n 40 "$log_file" >&2 || true
      die "cloudflared exited after startup."
    fi
  fi

  if command -v curl >/dev/null 2>&1; then
    log "Waiting for public health check"
    public_healthy=0
    for _ in {1..30}; do
      if curl -fsS "https://$domain/health" >/dev/null 2>&1; then
        public_healthy=1
        break
      fi
      sleep 1
    done

    if [[ "$public_healthy" -eq 1 ]]; then
      log "Public health check passed: https://$domain/health"
    else
      log "Public health check did not pass yet. Check DNS route and logs:"
      log "  cloudflared tunnel route dns $tunnel_name $domain"
      log "  tail -f $log_file"
    fi
  fi
fi

log "Done"
log "App logs: docker compose logs -f bridgy"
log "Tunnel logs: tail -f $log_file"
log "Stop tunnel: kill \"\$(cat $pid_file)\""
