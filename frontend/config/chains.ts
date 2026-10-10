import type { AppKitNetwork } from "@reown/appkit/networks";

export const inkSepolia = {
    id: 763373,
    name: "Ink Sepolia",
    nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: ["https://rpc-gel-sepolia.inkonchain.com"],
        },
    },
    blockExplorers: {
        default: {
            name: "Ink Explorer",
            url: "https://explorer-sepolia.inkonchain.com",
        },
    },
    testnet: true,
} as const satisfies AppKitNetwork;

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [inkSepolia];