import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, network } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    log("----------------------------------------------------");
    log(`Network: ${network.name}`);
    log(`Deploying Counter contract with account: ${deployer}`);

    const counter = await deploy("Counter", {
        from: deployer,
        args: [],
        log: true,
        waitConfirmations: network.name === "hardhat" ? 1 : 5,
    });

    log(`Counter deployed at: ${counter.address}`);
    log("----------------------------------------------------");

    if (network.name !== "hardhat" && network.name !== "localhost") {
        await hre.run("verify:verify", {
            address: counter.address,
            constructorArguments: [],
        });
    }
};

export default func;
func.tags = ["Counter"];