import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { inkSepolia, networks } from "./chains";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

if (!projectId) {
    console.warn("NEXT_PUBLIC_REOWN_PROJECT_ID is not set");
}

export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks,
});

export const appKitConfig = {
    projectId,
    networks,
    defaultNetwork: inkSepolia,
    adapters: [wagmiAdapter],
    metadata: {
        name: "Spend Authority",
        description: "Onchain spending policy for AI agent purchases with Reap",
        url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        icons: [],
    },
};