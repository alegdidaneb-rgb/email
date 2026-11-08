import { arbitrum, base, baseSepolia, mainnet, optimism, polygon, sepolia } from 'viem/chains'
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
  /** Test networks: real balances, zero value, free coins from a faucet. */
  testnet: boolean
  faucet?: string
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
    testnet: false,
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
    testnet: false,
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
    testnet: false,
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
    testnet: false,
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
    testnet: false,
  },
  sepolia: {
    id: 'sepolia',
    name: 'Sepolia',
    short: 'Sepolia',
    nativeSymbol: 'ETH',
    chain: sepolia,
    rpcUrls: [
      'https://ethereum-sepolia-rpc.publicnode.com',
      'https://sepolia.drpc.org',
      'https://rpc.sepolia.org',
      'https://1rpc.io/sepolia',
    ],
    explorer: 'https://sepolia.etherscan.io',
    explorerName: 'Sepolia Etherscan',
    accent: '#c084fc',
    testnet: true,
    faucet: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
  },
  baseSepolia: {
    id: 'baseSepolia',
    name: 'Base Sepolia',
    short: 'Base Sepolia',
    nativeSymbol: 'ETH',
    chain: baseSepolia,
    rpcUrls: [
      'https://sepolia.base.org',
      'https://base-sepolia-rpc.publicnode.com',
      'https://base-sepolia.drpc.org',
      'https://1rpc.io/base-sepolia',
    ],
    explorer: 'https://sepolia.basescan.org',
    explorerName: 'Base Sepolia Explorer',
    accent: '#818cf8',
    testnet: true,
    faucet: 'https://www.alchemy.com/faucets/base-sepolia',
  },
}

export const NETWORK_LIST: NetworkConfig[] = [
  NETWORKS.ethereum,
  NETWORKS.base,
  NETWORKS.arbitrum,
  NETWORKS.optimism,
  NETWORKS.polygon,
  NETWORKS.sepolia,
  NETWORKS.baseSepolia,
]

export const MAINNETS: NetworkConfig[] = NETWORK_LIST.filter((network) => !network.testnet)
export const TESTNETS: NetworkConfig[] = NETWORK_LIST.filter((network) => network.testnet)

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === 'string' && value in NETWORKS
}

export function networkOf(id: NetworkId): NetworkConfig {
  return NETWORKS[id] ?? NETWORKS.ethereum
}
