import { dnsJsonOverHttps } from './dns-json-over-https.ts'
import type { DNSResolver } from './index.ts'

export function defaultResolver (): DNSResolver[] {
  return [
    dnsJsonOverHttps('https://cloudflare-dns.com/dns-query'),
    dnsJsonOverHttps('https://dns.google/resolve')
  ]
}
