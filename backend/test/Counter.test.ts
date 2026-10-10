import { expect } from "chai";
import { ethers } from "hardhat";
import { Counter } from "../typechain-types";

describe("Counter", function () {
    let counter: Counter;

    beforeEach(async function () {
        const CounterFactory = await ethers.getContractFactory("Counter");
        counter = (await CounterFactory.deploy()) as unknown as Counter;
        await counter.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should start with counter at 0", async function () {
            expect(await counter.getCounter()).to.equal(0);
        });

        it("Should set the deployer as owner", async function () {
            const [owner] = await ethers.getSigners();
            expect(await counter.owner()).to.equal(owner.address);
        });
    });

    describe("increment", function () {
        it("Should increment the counter by 1", async function () {
            await counter.increment();
            expect(await counter.getCounter()).to.equal(1);
        });

        it("Should emit CounterIncremented event", async function () {
            const [owner] = await ethers.getSigners();
            await expect(counter.increment())
                .to.emit(counter, "CounterIncremented")
                .withArgs(owner.address, 1);
        });
    });

    describe("reset", function () {
        it("Should reset the counter to 0", async function () {
            await counter.increment();
            await counter.reset();
            expect(await counter.getCounter()).to.equal(0);
        });

        it("Should revert if called by non-owner", async function () {
            const [, nonOwner] = await ethers.getSigners();
            await expect(
                counter.connect(nonOwner).reset()
            ).to.be.revertedWithCustomError(counter, "OwnableUnauthorizedAccount");
        });

        it("Should emit CounterReset event", async function () {
            const [owner] = await ethers.getSigners();
            await expect(counter.reset())
                .to.emit(counter, "CounterReset")
                .withArgs(owner.address);
        });
    });
});