import type { NetworkId } from '../src/lib/types'

export declare const RPC_UPSTREAMS: Record<NetworkId, string[]>
export declare function proxyUrl(network: NetworkId): string
