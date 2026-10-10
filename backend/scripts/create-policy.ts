import { ethers, network } from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as dotenv from "dotenv";

// Crea la politica de gasto (la firma el DUEÑO = deployer) y deja lista la wallet del agente.
// Parametros por variables de entorno (todos opcionales):
//   TOTAL_USD=100  PER_PURCHASE_USD=40  MAX_CHARGES=3  HOURS=48
//   MERCHANTS="Bad Ass Coffee of Hawaii,Otro Comercio"   (nombres tal como los devuelve Reap)
//   AGENT_ADDRESS=0x...   (si no se da, se deriva de GATEWAY_PRIVATE_KEY en frontend/.env.local)
async function main() {
  const frontend = path.resolve(__dirname, "../../frontend");
  const deployedFile = path.join(frontend, "config/spend-authority.json");
  if (!existsSync(deployedFile)) throw new Error("Falta frontend/config/spend-authority.json. Despliega primero.");
  const deployed = JSON.parse(readFileSync(deployedFile, "utf8"));

  const [owner] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== deployed.chainId) {
    throw new Error(`La red actual (${chainId}) no coincide con la del deploy (${deployed.chainId}).`);
  }

  let agent = process.env.AGENT_ADDRESS;
  if (!agent) {
    const envFile = path.join(frontend, ".env.local");
    const key = existsSync(envFile) ? dotenv.parse(readFileSync(envFile)).GATEWAY_PRIVATE_KEY : undefined;
    if (!key) throw new Error("Define AGENT_ADDRESS o GATEWAY_PRIVATE_KEY en frontend/.env.local.");
    agent = new ethers.Wallet(key.startsWith("0x") ? key : `0x${key}`).address;
  }
  if (agent.toLowerCase() === owner.address.toLowerCase()) {
    throw new Error("El agente debe ser una wallet distinta del dueño.");
  }

  const cents = (v: string) => BigInt(Math.round(Number(v) * 100));
  const totalCap = cents(process.env.TOTAL_USD ?? "100");
  const perPurchaseCap = cents(process.env.PER_PURCHASE_USD ?? "40");
  const maxCharges = Number(process.env.MAX_CHARGES ?? 3);
  const hours = Number(process.env.HOURS ?? 48);
  const merchants = (process.env.MERCHANTS ?? "Bad Ass Coffee of Hawaii")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const merchantHashes = merchants.map((m) => ethers.keccak256(ethers.toUtf8Bytes(m.toLowerCase())));
  const latest = (await ethers.provider.getBlock("latest"))!.timestamp;
  const expiresAt = latest + hours * 3600;

  console.log("Red:       ", network.name);
  console.log("Dueño:     ", owner.address);
  console.log("Agente:    ", agent);
  console.log("Comercios: ", merchants.join(", "));
  console.log(`Tope total ${Number(totalCap) / 100} USD | por compra ${Number(perPurchaseCap) / 100} USD | max ${maxCharges} compras | ${hours} h`);

  // El agente necesita un poco de ETH para pagar el gas de reserve/confirm/release.
  const minGas = ethers.parseEther(process.env.AGENT_MIN_ETH ?? "0.0005");
  if ((await ethers.provider.getBalance(agent)) < minGas) {
    const amount = ethers.parseEther(process.env.AGENT_FUND_ETH ?? "0.001");
    console.log(`\nFondeando al agente con ${ethers.formatEther(amount)} ETH ...`);
    await (await owner.sendTransaction({ to: agent, value: amount })).wait();
  }

  const sa = await ethers.getContractAt("SpendAuthority", deployed.address, owner);
  const tx = await sa.createPolicy(agent, totalCap, perPurchaseCap, expiresAt, maxCharges, merchantHashes);
  const receipt = await tx.wait();
  const policyId = receipt!.logs.map((l: any) => { try { return sa.interface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === "PolicyCreated")!.args.policyId.toString();

  writeFileSync(
    path.join(frontend, "config/policy.json"),
    JSON.stringify(
      {
        policyId,
        network: network.name,
        chainId,
        contract: deployed.address,
        owner: owner.address,
        agent,
        merchants,
        totalCapCents: totalCap.toString(),
        perPurchaseCapCents: perPurchaseCap.toString(),
        maxCharges,
        expiresAt,
        createTx: receipt?.hash,
      },
      null,
      2,
    ),
  );
  console.log(`\nPolitica #${policyId} creada. Tx: ${receipt?.hash}`);
  console.log("Guardada en frontend/config/policy.json");
  if (chainId === 763373) console.log("Explorer: https://explorer-sepolia.inkonchain.com/tx/" + receipt?.hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});