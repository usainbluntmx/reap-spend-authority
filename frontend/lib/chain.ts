import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    type Abi,
    type Hex,
  } from "viem";
  import { privateKeyToAccount } from "viem/accounts";
  import deployed from "../config/spend-authority.json";
  
  export const CONTRACT = {
    address: deployed.address as Hex,
    abi: deployed.abi as unknown as Abi,
  } as const;
  
  const EXPLORER = "https://explorer-sepolia.inkonchain.com";
  
  // Todo se lee de forma perezosa: los scripts cargan .env.local DESPUES de importar este modulo.
  let _chain: ReturnType<typeof makeChain> | null = null;
  function makeChain() {
    const rpc = process.env.GATEWAY_RPC_URL ?? "https://rpc-gel-sepolia.inkonchain.com";
    return defineChain({
      id: deployed.chainId,
      name: deployed.network,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
      blockExplorers: { default: { name: "Ink Explorer", url: EXPLORER } },
    });
  }
  export const getChain = () => (_chain ??= makeChain());
  
  let _public: ReturnType<typeof makePublic> | null = null;
  function makePublic() {
    return createPublicClient({ chain: getChain(), transport: http() });
  }
  export const getPublicClient = () => (_public ??= makePublic());
  
  export function getAgent() {
    const pk = process.env.GATEWAY_PRIVATE_KEY;
    if (!pk) throw new Error("Falta GATEWAY_PRIVATE_KEY en frontend/.env.local");
    const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
    const client = createWalletClient({ account, chain: getChain(), transport: http() });
    return { account, client };
  }
  
  export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
  export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;