/**
 * Keyless JSON-RPC endpoints, ordered by recent reliability.
 *
 * Plain ESM (no TypeScript, no dependencies) so the browser app, the Vite dev
 * relay and the Vercel /api/rpc function all share one list.
 *
 * Checked Nov 2026: Ankr's keyless endpoint now returns "Unauthorized",
 * eth.llamarpc.com answers 525 and Cloudflare's gateway answers about 1 call in
 * 18 — all three were removed rather than left to slow every lookup down.
 */
export const RPC_UPSTREAMS = {
  ethereum: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
    'https://1rpc.io/eth',
    'https://rpc.flashbots.net',
    'https://eth.merkle.io',
  ],
  base: [
    'https://mainnet.base.org',
    'https://base-rpc.publicnode.com',
    'https://base.drpc.org',
    'https://1rpc.io/base',
  ],
  arbitrum: [
    'https://arb1.arbitrum.io/rpc',
    'https://arbitrum-one-rpc.publicnode.com',
    'https://arbitrum.drpc.org',
    'https://1rpc.io/arb',
  ],
  optimism: [
    'https://mainnet.optimism.io',
    'https://optimism-rpc.publicnode.com',
    'https://optimism.drpc.org',
    'https://1rpc.io/op',
  ],
  polygon: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://polygon.drpc.org',
    'https://1rpc.io/polygon',
  ],
  sepolia: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://1rpc.io/sepolia',
    'https://rpc.sepolia.org',
  ],
  baseSepolia: [
    'https://sepolia.base.org',
    'https://base-sepolia-rpc.publicnode.com',
    'https://base-sepolia.drpc.org',
    'https://1rpc.io/base-sepolia',
  ],
}

/** Same-origin relay used when every direct endpoint is blocked (CORS, firewall, DNS). */
export function proxyUrl(network) {
  return `/api/rpc?network=${encodeURIComponent(network)}`
}
