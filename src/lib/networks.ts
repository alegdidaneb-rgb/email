import { arbitrum, base, mainnet, optimism, polygon } from 'viem/chains'
import type { Chain } from 'viem'
import type { NetworkId } from './types'

export interface NetworkConfig {
  id: NetworkId
  name: string
  short: string
  nativeSymbol: string
  chain: Chain
  /** Keyless endpoints that send permissive CORS headers, tried in order. */
  rpcUrls: string[]
  explorer: string
  explorerName: string
  accent: string
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    short: 'ETH',
    nativeSymbol: 'ETH',
    chain: mainnet,
    rpcUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://cloudflare-eth.com',
      'https://eth.llamarpc.com',
      'https://eth.drpc.org',
      'https://1rpc.io/eth',
      'https://rpc.ankr.com/eth',
    ],
    explorer: 'https://etherscan.io',
    explorerName: 'Etherscan',
    accent: '#8b9dfa',
  },
  base: {
    id: 'base',
    name: 'Base',
    short: 'Base',
    nativeSymbol: 'ETH',
    chain: base,
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base-rpc.publicnode.com',
      'https://base.llamarpc.com',
      'https://base.drpc.org',
      'https://1rpc.io/base',
    ],
    explorer: 'https://basescan.org',
    explorerName: 'Basescan',
    accent: '#4f7cff',
  },
  arbitrum: {
    id: 'arbitrum',
    name: 'Arbitrum One',
    short: 'Arbitrum',
    nativeSymbol: 'ETH',
    chain: arbitrum,
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arbitrum.llamarpc.com',
      'https://arbitrum.drpc.org',
      'https://1rpc.io/arb',
    ],
    explorer: 'https://arbiscan.io',
    explorerName: 'Arbiscan',
    accent: '#3fb0e8',
  },
  optimism: {
    id: 'optimism',
    name: 'OP Mainnet',
    short: 'Optimism',
    nativeSymbol: 'ETH',
    chain: optimism,
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism-rpc.publicnode.com',
      'https://optimism.llamarpc.com',
      'https://optimism.drpc.org',
      'https://1rpc.io/op',
    ],
    explorer: 'https://optimistic.etherscan.io',
    explorerName: 'OP Explorer',
    accent: '#ff5a5a',
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    short: 'Polygon',
    nativeSymbol: 'POL',
    chain: polygon,
    rpcUrls: [
      'https://polygon-rpc.com',
      'https://polygon-bor-rpc.publicnode.com',
      'https://polygon.llamarpc.com',
      'https://polygon.drpc.org',
      'https://1rpc.io/matic',
    ],
    explorer: 'https://polygonscan.com',
    explorerName: 'Polygonscan',
    accent: '#a97bff',
  },
}

export const NETWORK_LIST: NetworkConfig[] = [
  NETWORKS.ethereum,
  NETWORKS.base,
  NETWORKS.arbitrum,
  NETWORKS.optimism,
  NETWORKS.polygon,
]

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && value in NETWORKS
}

export function networkOf(id: NetworkId): NetworkConfig {
  return NETWORKS[id] ?? NETWORKS.ethereum
}
