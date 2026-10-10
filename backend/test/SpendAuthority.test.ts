import assert from "node:assert/strict";
import { ethers } from "hardhat";

const usd = (d: number) => BigInt(Math.round(d * 100));
const merchantId = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name.trim().toLowerCase()));

const COFFEE = merchantId("Bad Ass Coffee of Hawaii");
const OTHER = merchantId("Some Other Store");

const R = {
  Ok: 0,
  PolicyNotFound: 1,
  Revoked: 2,
  Expired: 3,
  MerchantNotAllowed: 4,
  OverPerPurchaseCap: 5,
  MaxChargesReached: 6,
  OverTotalCap: 7,
};

async function expectRevert(p: Promise<unknown>, needle: string) {
  let msg: string | null = null;
  try {
    await p;
  } catch (e: any) {
    msg = `${e?.message ?? ""} ${e?.shortMessage ?? ""} ${e?.data ?? ""}`;
  }
  assert.ok(msg !== null, `no revirtio; se esperaba ${needle}`);
  assert.ok(msg!.includes(needle), `se esperaba "${needle}" y llego: ${msg}`);
}

async function setup(opts: { total?: number; perPurchase?: number; maxCharges?: number } = {}) {
  const [owner, agent, stranger] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("SpendAuthority");
  const sa: any = await factory.deploy();
  await sa.waitForDeployment();
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await (
    await sa
      .connect(owner)
      .createPolicy(
        agent.address,
        usd(opts.total ?? 100),
        usd(opts.perPurchase ?? 50),
        now + 3600,
        opts.maxCharges ?? 2,
        [COFFEE],
      )
  ).wait();
  return { sa, owner, agent, stranger, now };
}

describe("SpendAuthority", () => {
  it("flujo feliz: reserve -> confirm con los IDs de Reap", async () => {
    const { sa, agent } = await setup();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(43.67), "quote-0e1a4361")).wait();

    let p = await sa.getPolicy(1);
    assert.equal(p.spent, usd(43.67));
    assert.equal(p.charges, 1n);
    assert.equal(await sa.remaining(1), usd(100) - usd(43.67));

    await (
      await sa.connect(agent).confirm(1, usd(43.67), "checkout-adea14e9", "ord_01M4HN0F1CF2E1GWD1CNRE4W1G")
    ).wait();

    assert.equal((await sa.getReservation(1)).status, 2n);
    const logs = await sa.queryFilter("PurchaseConfirmed");
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.orderId, "ord_01M4HN0F1CF2E1GWD1CNRE4W1G");
    assert.equal(logs[0].args.checkoutId, "checkout-adea14e9");
  });

  it("evalua el total con envio: 34.99 pasaria el tope de 40, 43.67 no", async () => {
    const { sa, agent } = await setup({ perPurchase: 40 });
    assert.equal(await sa.check(1, COFFEE, usd(34.99)), BigInt(R.Ok));
    assert.equal(await sa.check(1, COFFEE, usd(43.67)), BigInt(R.OverPerPurchaseCap));
    await expectRevert(sa.connect(agent).reserve(1, COFFEE, usd(43.67), "q"), "PolicyRejected(5)");
  });

  it("solo el agente puede reservar, confirmar o liberar", async () => {
    const { sa, owner, agent, stranger } = await setup();
    await expectRevert(sa.connect(stranger).reserve(1, COFFEE, usd(10), "q"), "NotAgent");
    await expectRevert(sa.connect(owner).reserve(1, COFFEE, usd(10), "q"), "NotAgent");
    await (await sa.connect(agent).reserve(1, COFFEE, usd(10), "q")).wait();
    await expectRevert(sa.connect(stranger).confirm(1, usd(10), "c", "o"), "NotAgent");
    await expectRevert(sa.connect(stranger).release(1, "x"), "NotAgent");
  });

  it("rechaza comercios fuera de la lista", async () => {
    const { sa, agent } = await setup();
    await expectRevert(sa.connect(agent).reserve(1, OTHER, usd(10), "q"), "PolicyRejected(4)");
  });

  it("respeta maxCharges", async () => {
    const { sa, agent } = await setup({ maxCharges: 2 });
    await (await sa.connect(agent).reserve(1, COFFEE, usd(10), "q1")).wait();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(10), "q2")).wait();
    await expectRevert(sa.connect(agent).reserve(1, COFFEE, usd(10), "q3"), "PolicyRejected(6)");
  });

  it("respeta el tope total acumulado", async () => {
    const { sa, agent } = await setup({ total: 100, perPurchase: 60, maxCharges: 10 });
    await (await sa.connect(agent).reserve(1, COFFEE, usd(60), "q1")).wait();
    await expectRevert(sa.connect(agent).reserve(1, COFFEE, usd(50), "q2"), "PolicyRejected(7)");
    await (await sa.connect(agent).reserve(1, COFFEE, usd(40), "q3")).wait();
    assert.equal(await sa.remaining(1), 0n);
  });

  it("release devuelve el presupuesto y la cuenta de cargos", async () => {
    const { sa, agent } = await setup({ maxCharges: 1 });
    await (await sa.connect(agent).reserve(1, COFFEE, usd(50), "q1")).wait();
    await (await sa.connect(agent).release(1, "checkout FAILED")).wait();
    const p = await sa.getPolicy(1);
    assert.equal(p.spent, 0n);
    assert.equal(p.charges, 0n);
    await (await sa.connect(agent).reserve(1, COFFEE, usd(50), "q2")).wait();
  });

  it("confirm con un cobro menor libera la diferencia", async () => {
    const { sa, agent } = await setup();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(43.67), "q")).wait();
    await (await sa.connect(agent).confirm(1, usd(40), "c", "o")).wait();
    assert.equal((await sa.getPolicy(1)).spent, usd(40));
  });

  it("confirm no acepta un cobro mayor a lo reservado", async () => {
    const { sa, agent } = await setup();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(20), "q")).wait();
    await expectRevert(sa.connect(agent).confirm(1, usd(21), "c", "o"), "ChargeExceedsReservation");
  });

  it("una reserva solo se cierra una vez", async () => {
    const { sa, agent } = await setup();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(20), "q")).wait();
    await (await sa.connect(agent).confirm(1, usd(20), "c", "o")).wait();
    await expectRevert(sa.connect(agent).confirm(1, usd(20), "c", "o"), "BadReservationState");
    await expectRevert(sa.connect(agent).release(1, "x"), "BadReservationState");
  });

  it("revokePolicy: solo el dueño y bloquea nuevas reservas", async () => {
    const { sa, owner, agent, stranger } = await setup();
    await expectRevert(sa.connect(stranger).revokePolicy(1), "NotOwner");
    await (await sa.connect(owner).revokePolicy(1)).wait();
    assert.equal(await sa.check(1, COFFEE, usd(10)), BigInt(R.Revoked));
    await expectRevert(sa.connect(agent).reserve(1, COFFEE, usd(10), "q"), "PolicyRejected(2)");
  });

  it("una reserva previa se puede confirmar aunque se revoque la politica", async () => {
    const { sa, owner, agent } = await setup();
    await (await sa.connect(agent).reserve(1, COFFEE, usd(10), "q")).wait();
    await (await sa.connect(owner).revokePolicy(1)).wait();
    await (await sa.connect(agent).confirm(1, usd(10), "c", "o")).wait();
  });

  it("la politica expira", async () => {
    const { sa, agent } = await setup();
    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);
    assert.equal(await sa.check(1, COFFEE, usd(10)), BigInt(R.Expired));
    await expectRevert(sa.connect(agent).reserve(1, COFFEE, usd(10), "q"), "PolicyRejected(3)");
  });

  it("valida los parametros al crear la politica", async () => {
    const [owner, agent] = await ethers.getSigners();
    const sa: any = await (await ethers.getContractFactory("SpendAuthority")).deploy();
    await sa.waitForDeployment();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await expectRevert(
      sa.connect(owner).createPolicy(agent.address, usd(10), usd(20), now + 100, 1, [COFFEE]),
      "InvalidPolicy",
    );
    await expectRevert(
      sa.connect(owner).createPolicy(agent.address, usd(10), usd(5), now + 100, 1, []),
      "NoMerchants",
    );
    await expectRevert(
      sa.connect(owner).createPolicy(agent.address, usd(10), usd(5), now - 1, 1, [COFFEE]),
      "InvalidPolicy",
    );
  });

  it("check() sobre una politica inexistente", async () => {
    const { sa } = await setup();
    assert.equal(await sa.check(99, COFFEE, usd(1)), BigInt(R.PolicyNotFound));
  });
});