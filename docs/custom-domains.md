# Custom Domains

CtrlPoint custom domains have two parts:

1. The app verifies ownership with a TXT record and stores the domain against a live site.
2. The provider routes custom-domain traffic to the matching DeWeb MNS host.

## Required Backend Env

```bash
MNS_PUBLIC_DOMAIN=ctrlpoint.app
DEWEB_PROVIDER_HEALTH_URL=https://ctrlpoint.app/__deweb_info
CUSTOM_DOMAIN_CNAME_TARGET=ctrlpoint.app
CUSTOM_DOMAIN_A_RECORDS=194.146.13.53
```

`CUSTOM_DOMAIN_A_RECORDS` is used when a user connects an apex/root domain that cannot use a normal CNAME.

## User DNS Records

For `www.example.com`, the UI shows:

```txt
TXT    _ctrlpoint.www.example.com    ctrlpoint-verify=<token>
CNAME  www.example.com               <site>.ctrlpoint.app
```

For `example.com`, use the TXT record plus the provider A record shown by the UI.

## Provider Router

Run the router on the provider VPS:

```bash
CTRLPOINT_API_URL=https://ctrlpoint-api.fly.dev \
DEWEB_LOCAL_URL=http://127.0.0.1:8080 \
CUSTOM_DOMAIN_ROUTER_PORT=8090 \
CUSTOM_DOMAIN_ROUTER_HOST=127.0.0.1 \
node /opt/ctrlpoint/custom-domain-router.cjs
```

The router asks the CtrlPoint API which MNS host owns the custom domain, then proxies to the local DeWeb provider with `Host: <site>.ctrlpoint.app`.

## Caddy Shape

Keep the existing `ctrlpoint.app, *.ctrlpoint.app` provider block. Add a separate on-demand TLS block for user custom domains:

```caddy
{
    on_demand_tls {
        ask https://ctrlpoint-api.fly.dev/api/custom-domains/allow
    }
}

ctrlpoint.app, *.ctrlpoint.app {
    reverse_proxy 127.0.0.1:8080
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
}

https:// {
    tls {
        on_demand
    }
    reverse_proxy 127.0.0.1:8090
}
```

Do not enable on-demand TLS without the `ask` endpoint. The ask endpoint prevents random public domains from causing certificate issuance through your provider.
