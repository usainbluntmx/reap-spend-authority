import { ethers, network } from "hardhat";
import { readFileSync } from "node:fs";
import path from "node:path";

// El DUEÑO revoca la politica activa: desde ese momento el agente ya no puede reservar presupuesto.
// Las reservas que ya existian se pueden seguir confirmando o liberando.
async function main() {
  const frontend = path.resolve(__dirname, "../../frontend");
  const deployed = JSON.parse(readFileSync(path.join(frontend, "config/spend-authority.json"), "utf8"));
  const policy = JSON.parse(readFileSync(path.join(frontend, "config/policy.json"), "utf8"));

  const [owner] = await ethers.getSigners();
  if (owner.address.toLowerCase() !== String(policy.owner).toLowerCase()) {
    throw new Error(`Esta wallet (${owner.address}) no es el dueño de la politica (${policy.owner}).`);
  }

  const sa = await ethers.getContractAt("SpendAuthority", deployed.address, owner);
  console.log(`Revocando la politica #${policy.policyId} en ${network.name} ...`);
  const receipt = await (await sa.revokePolicy(BigInt(policy.policyId))).wait();
  console.log("Politica revocada. Tx:", receipt?.hash);
  if (Number((await ethers.provider.getNetwork()).chainId) === 763373) {
    console.log("Explorer: https://explorer-sepolia.inkonchain.com/tx/" + receipt?.hash);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});