import { ethers, deployments, getNamedAccounts, network, run } from "hardhat";

async function main() {
    const { deployer } = await getNamedAccounts();
    const { deploy, log } = deployments;

    log("----------------------------------------------------");
    log(`Network: ${network.name}`);
    log(`Deployer: ${deployer}`);
    log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer))} ETH`);
    log("----------------------------------------------------");

    const counter = await deploy("Counter", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.name === "hardhat" ? 1 : 5,
    });

    log(`Counter deployed at: ${counter.address}`);

    if (network.name !== "hardhat" && network.name !== "localhost") {
        log("Waiting for verification...");
        await new Promise((resolve) => setTimeout(resolve, 30000));

        try {
            await run("verify:verify", {
                address: counter.address,
                constructorArguments: [],
            });
            log("Contract verified successfully");
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                log("Contract already verified");
            } else {
                log(`Verification failed: ${error.message}`);
            }
        }
    }

    log("----------------------------------------------------");
    log("Done!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});