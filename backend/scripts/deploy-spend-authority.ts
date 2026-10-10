import { ethers, network, artifacts } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Red:      ", network.name);
  console.log("Deployer: ", deployer.address);
  console.log("Balance:  ", ethers.formatEther(balance), "ETH");
  if (balance === 0n) throw new Error("El deployer no tiene ETH. Pide fondos en el faucet de Ink Sepolia.");

  const factory = await ethers.getContractFactory("SpendAuthority");
  const sa = await factory.deploy();
  await sa.waitForDeployment();
  const address = await sa.getAddress();
  const receipt = await sa.deploymentTransaction()!.wait();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log("\nSpendAuthority desplegado en:", address);

  const artifact = await artifacts.readArtifact("SpendAuthority");
  const out = path.resolve(__dirname, "../../frontend/config");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, "spend-authority.json"),
    JSON.stringify(
      {
        network: network.name,
        chainId,
        address,
        deployBlock: receipt?.blockNumber ?? null,
        deployer: deployer.address,
        abi: artifact.abi,
      },
      null,
      2,
    ),
  );
  console.log("Guardado en frontend/config/spend-authority.json");
  if (chainId === 763373) {
    console.log("Explorer: https://explorer-sepolia.inkonchain.com/address/" + address);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});