# WatchVault — watch-only wallets with an assigned amount

WatchVault keeps a list of **view-only** addresses across Ethereum and its L2s, plus the
**ERC-20 tokens** held at those addresses. Every asset — the native coin and each token — carries
**an amount you assign**, and the app reads the real balance from chain and tells you the moment it
no longer matches.

No private keys. No seed phrases. No signing. The app literally cannot move funds.

## Networks

| Mainnets | Native | | Testnets (free, valueless ETH) |
| --- | --- | --- | --- |
| Ethereum | ETH | | Sepolia |
| Base | ETH | | Base Sepolia |
| Arbitrum One | ETH | | |
| OP Mainnet | ETH | | |
| Polygon | POL | | |

**Want to see it working with non-zero balances?** Pick Sepolia or Base Sepolia in the network
dropdown, grab free ETH from the faucet link shown in the form, and set that as the assigned
amount. Real on-chain reads, zero cost, and nothing that could be mistaken for actual funds.

## The idea

| You set                             | WatchVault does                                                     |
| ----------------------------------- | ------------------------------------------------------------------- |
| An address + network (public only)  | Reads the real native balance via `eth_getBalance`                   |
| The amount it should hold           | Compares the live balance against it, within a tolerance you control |
| A token contract + assigned amount  | Reads `symbol`, `decimals` and `balanceOf` and does the same         |
| —                                   | Flags drift, logs it, optionally fires a desktop notification        |
| —                                   | Keeps native balance history and a per-wallet sparkline               |

On the card the **amount you assigned is the big figure** — it is the number you typed and the thing
you are tracking — and the live on-chain reading sits right beside it ("On-chain now", quieter, with
the red/amber/green flag and the exact gap). Both numbers are always visible: assigning 25 ETH to an
empty wallet does not create 25 ETH, it reads *Assigned 25 ETH / On-chain 0 ETH · short by 25 ETH,
nothing on-chain yet*, and the pill says **Not funded yet**. The chain value is always the truth; the
assigned value is your target, never faked.

## Features

- **Watch-only by construction** — the data model stores addresses, labels, notes and amounts.
  There is nowhere to put a key.
- **Mainnets + testnets** — the seven networks above; the native symbol and explorer follow the
  network, and the same address can be watched on several networks at once.
- **ERC-20 tracking per wallet** — paste a token contract, WatchVault detects symbol and decimals
  on chain, then tracks the balance against its own assigned amount.
- **Custom amount per asset** — native and each token independently; the assigned amount leads the
  card so the number you care about is the one you see first. Edit any time.
- **Drift detection** — "in line", "below assigned", "above assigned", with the exact gap and
  one-click `Assign current amount` to re-baseline after an expected move.
- **Live balances that always land** — every balance read races a per-network pool of verified
  keyless RPC endpoints *and* a **same-origin relay** (`/api/rpc`, a Vercel serverless function),
  and takes whichever answers first. CORS, firewalls, rate limits and dead providers can't make a
  read fail silently. Point any network at your own node instead if you prefer.
- **Self-explaining failures** — one quiet automatic retry, a per-wallet "couldn't read" flag, a
  banner that names every endpoint it tried with latency and error, a **Copy report** button that
  puts that text on your clipboard, and Settings → *Test connections* for a manual probe.
- **Same wallet on every device** — the share button on a card (or the header) produces a QR code
  and a link that carry the address, network, label, assigned amount and tokens. Open it on another
  phone or laptop and the wallet is there, already assigned — no retyping.
- **Trust Wallet hand-off** — the same sheet shows the bare address as a QR with the exact
  view-only (watch) import steps, so Trust Wallet on any phone can mirror the same address.
- **Connection test** — Settings → *Test connections* asks each network for its chain id the same
  way a balance read does and shows which endpoint answered, in milliseconds.
- **Activity log + desktop notifications** — one entry per real movement, tagged with network and
  asset.
- **Tolerances** — separate for native units and token units (defaults ±0.0005 and ±0.01).
- **Local-only storage** — `localStorage`, with JSON export/import. A v1 database migrates
  automatically.
- Polished dark UI, fully responsive.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run smoke      # headless jsdom test against a mocked RPC
npm run test:relay # unit test for the same-origin RPC relay
npm run test:transport # unit test for the racing JSON-RPC transport
npm run test:share     # unit test for share links: round-trip, rejection, de-duplication
```

## How a reading works

1. The address is validated and stored in EIP-55 checksummed form, alongside its network.
2. One JSON-RPC call per asset is made from your browser — `eth_getBalance` for the native coin,
   `eth_call` (`balanceOf`) for each tracked token. The call is **raced** across that network's
   endpoint pool (PublicNode, dRPC, 1RPC, Flashbots, merkle, official L2 gateways, Sepolia) and
   `/api/rpc` on this app's own origin, which relays server-side to the same pool; the first
   answer wins and the losers are ignored. If nothing answers, the app retries once quietly, then
   reports exactly what it tried.
3. Each balance is compared to its assigned amount with the matching tolerance applied, and the
   card shows the assigned figure large with the live reading next to it.
4. Status changes are written to the activity log (and notified, if enabled). Status is persisted,
   so you get one alert per real move, not one per refresh.

## Carrying a wallet to another device

Tap the share icon on a card (or in the header, to move the whole watchlist). Two things come out:

1. **A QR code of the address**, plus the numbered Trust Wallet path — *Settings → Wallets → + →
   Add existing wallet → View-only wallet*, pick the network, scan, name it, confirm. That mirrors
   the address on the phone. Trust Wallet then shows the *real* on-chain balance, because that is
   what a view-only wallet does; the amount you assigned lives in WatchVault only, so it never
   changes what the chain reports.
2. **A share link / QR for WatchVault itself** — `…/#i=wv1.<payload>`. Open it on another device
   and a prompt offers to add the wallet with its label, network, assigned amount and tokens.
   Addresses already on that watchlist are skipped, and every balance is read fresh afterwards.

The payload is public data only: address, network, label, amounts, token contracts. There is no key
material to leak, because the app never has any.

## Privacy

- Everything (addresses, labels, amounts, tokens, history) lives in your browser's `localStorage`.
- The only outbound traffic is the balance query to the endpoint you choose. Public endpoints see
  which address you look up; for full privacy set your own RPC under **Settings → RPC endpoints**
  (per network, e.g. `http://localhost:8545`).
- Export JSON and share links contain public addresses and amounts only — never secrets, because
  none are ever collected.

## Project layout

```
src/
  App.tsx                 state, multi-asset refresh, alerts, stats
  lib/networks.ts         per-network config: viem chain, RPC pool, explorer, faucet
  lib/rpcUpstreams.ts     re-export of the shared endpoint list
  lib/transport.ts        racing JSON-RPC transport + per-network diagnostics
  lib/eth.ts              clients, native + ERC-20 reads, validation, status logic
  lib/share.ts            wv1. share payloads: encode, validate, merge, Trust Wallet steps
  lib/storage.ts          versioned persistence, v1 -> v2 migration, import validation
  lib/format.ts           amount/address/time formatting
  components/
    WalletForm.tsx        add a watch-only wallet (network + assigned amount)
    WalletCard.tsx        native + token holdings, drift, edit, reconcile
    SettingsPanel.tsx     tolerances, auto-refresh, notifications, per-network RPC, backup
    AlertLog.tsx          activity feed
    SharePanel.tsx        QR + link sheet: Trust Wallet hand-off and cross-device import
    QrCode.tsx            inline-SVG QR, encoder loaded on demand
    Sparkline.tsx         native balance history with assigned-amount line
api/rpc.js                same-origin JSON-RPC relay (Vercel function)
shared/rpc-upstreams.js   one endpoint list for app, dev relay and serverless relay
scripts/smoke.mjs         end-to-end render test with a mocked RPC (69 checks)
scripts/test-relay.mjs    relay unit test: failover, validation, health probe (14 checks)
scripts/test-transport.mjs racing transport unit test: first-win, errors, custom RPC (14 checks)
scripts/test-share.mjs    share payloads: round-trip, hostile input, de-duplication (41 checks)
```

## Limits worth knowing

- ERC-20 only — no NFTs or DeFi positions yet.
- Seven networks; adding another is a single entry in `src/lib/networks.ts`.
- Token detection relies on `symbol()`/`decimals()`; rare contracts returning `bytes32` symbols
  fall back to a shortened contract address.
- Public RPCs are rate limited — heavy polling across many wallets may get throttled; use your own
  endpoint for larger lists. Keyless access churns: Ankr now demands a key, llamarpc answers 525
  and Cloudflare's gateway is mostly down, so those were removed in Nov 2026.
- The relay only works when the app is served (Vite dev server or Vercel). Opened as a bare static
  file, the app relies on direct endpoints alone.
- It is a monitor, not a wallet: to move funds you need the key, which this app never has.
- Share links are plain text: whoever holds one learns the address, its label and the amount you
  assigned. Nothing is spendable with that, but treat the label like a public note.
