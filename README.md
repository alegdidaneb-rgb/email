# WatchVault — watch-only Ethereum wallets with an assigned amount

WatchVault keeps a list of **view-only** Ethereum addresses. Each one gets an **amount you
assign**, and the app reads the wallet's real balance from Ethereum mainnet and tells you the
moment it no longer matches.

No private keys. No seed phrases. No signing. The app literally cannot move funds.

## The idea

| You set                         | WatchVault does                                              |
| ------------------------------- | ------------------------------------------------------------ |
| An address (public only)        | Reads the real balance via `eth_getBalance` on mainnet        |
| The amount it should hold (ETH) | Compares the live balance against that amount, within a tolerance you control |
| —                               | Flags drift, logs it, optionally fires a browser notification |
| —                               | Keeps a small balance history and a per-wallet sparkline      |

The assigned amount is a **reference target**, not a display override: the balance shown is
always the real on-chain value, so the numbers on screen can be trusted. (If you need a
screenshot-friendly fake balance, this app deliberately will not do that.)

## Features

- **Watch-only by construction** — the data model stores an address, a label, a note and an
  amount. There is nowhere to put a key.
- **Custom amount per wallet** — assign any ETH value; edit it any time.
- **Live mainnet balances** — read in the browser from a pool of public keyless RPC endpoints
  with automatic failover, or point it at your own node.
- **Drift detection** — "in line", "below assigned", "above assigned", with the exact ETH gap and
  one-click `Assign current amount` to re-baseline after an expected move.
- **Activity log + desktop notifications** — recorded when a balance stops matching.
- **Tolerance setting** — ignore gas dust and rounding (default ±0.0005 ETH).
- **Auto-refresh** — off / 30 s / 1 min / 5 min.
- **Local-only storage** — `localStorage`, with JSON export/import for backup.
- Polished dark UI, fully responsive.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run smoke      # headless jsdom test (mocked RPC)
```

## How a reading works

1. The address is validated and stored in its EIP-55 checksummed form.
2. A JSON-RPC `eth_getBalance` call is made from your browser — via
   `ethereum-rpc.publicnode.com`, `cloudflare-eth.com`, `eth.llamarpc.com`, `eth.drpc.org`,
   `1rpc.io/eth`, `rpc.ankr.com/eth`, in that order, until one answers.
3. The balance is compared to the assigned amount with your tolerance applied.
4. If the status changed from what was stored, an entry is written to the activity log (and a
   notification is fired, if enabled). Status is persisted, so you get one alert per real move,
   not one per refresh.

## Privacy

- Everything (addresses, labels, amounts, history) lives in your browser's `localStorage`.
- The only outbound traffic is the balance query to the RPC endpoint you choose. A public
  endpoint sees which address you look up; if that matters to you, run your own node and set it
  under **Settings → RPC endpoint** (works with e.g. `http://localhost:8545`).
- Export JSON contains public addresses only — never secrets, because none are ever collected.

## Project layout

```
src/
  App.tsx                 state, refresh loop, alerts, totals
  lib/eth.ts              RPC client, address/amount validation, status logic
  lib/storage.ts          versioned localStorage persistence + import validation
  lib/format.ts           ETH/address/time formatting
  components/
    WalletForm.tsx        add a watch-only wallet + assigned amount
    WalletCard.tsx        balance vs assigned, drift, edit, reconcile
    SettingsPanel.tsx     tolerance, auto-refresh, notifications, RPC, backup
    AlertLog.tsx          activity feed
    Sparkline.tsx         balance history with assigned-amount line
scripts/smoke.mjs         end-to-end render test with a mocked RPC
```

## Limits worth knowing

- ETH only (ERC-20 token balances are not read yet).
- Single network: Ethereum mainnet.
- Public RPCs are rate limited — heavy polling across many wallets may get throttled; use your
  own endpoint for larger lists.
- It is a monitor, not a wallet: to actually move funds you need the key, which this app never
  has.
