# Guion del demo grabado (~2:00)

Idea central a transmitir: **el agente puede comprar de verdad, pero una politica onchain puesta por el dueño decide cuanto, donde y cuantas veces.**

## A. Preparacion (antes de grabar, nada de esto sale en el video)

1. Politica fresca (la actual solo permite 1 cargo mas):
   `cd backend && MAX_CHARGES=10 TOTAL_USD=300 PER_PURCHASE_USD=40 npx hardhat run scripts/create-policy.ts --network inkSepolia`
2. En `frontend/.env.local` agrega `REAP_RETURN_URL=http://localhost:3000/agent` (si Reap lo rechaza, quitala y recorta ese segundo en edicion).
3. Historial limpio (opcional): `cp frontend/.data/purchases.json /tmp/purchases.bak && echo '{}' > frontend/.data/purchases.json`
4. `cd frontend && npm run dev`; abre `http://localhost:3000` y recarga: debe decir **Spending policy #2**, $0.00 de $300.00, 0 / 10.
5. Pestañas listas: (a) `/agent`, (b) explorer del contrato https://explorer-sepolia.inkonchain.com/address/0xcE9A8305391747f8bF34B18Ae37a434c59060Ce2
6. Terminal lista en `backend/` con el comando de revoke (paso 7) **sin ejecutar**.
7. Producto distinto en cada toma: Reap repite el quote ~15 min para el mismo producto (`QUOTE_REUSED`). Para la compra aprobada usa uno que no hayas cotizado en los ultimos 15 min.
8. Haz una toma de prueba completa antes. Resolucion 1080p, zoom del navegador 110-125 % para que se lea.

## B. Toma, paso por paso

**1. Contexto (0:00–0:15) — pantalla: `/agent`, sin tocar nada.**
Muestra el titulo y la tarjeta de politica.
> "AI agents can now pay with a real card. But who decides how much they can spend? Here, the owner set the rules onchain, on Ink Sepolia. The agent cannot spend outside them."

**2. La politica (0:15–0:30) — señala con el mouse.**
Presupuesto $300, tope por compra $40, 0 / 10 compras, expira en 48 h, comerciante permitido, link del contrato.
> "300 dollars total, 40 per purchase, ten charges, 48 hours, and one allowed merchant. This is a smart contract, not a setting in my backend."

**3. Compra bloqueada (0:30–0:50) — busca `kona french roast`, Get quote.**
Muestra el desglose (~$78.16) y el mensaje rojo `OverPerPurchaseCap`. Resalta que no hay boton de comprar.
> "The agent asks for a 78 dollar coffee. The policy is checked against the full order total, shipping included. It's over the 40 dollar cap, so it's denied. No budget was reserved and no checkout was opened."

**4. Compra permitida (0:50–1:05) — escribe `badass coffee` (o el producto elegido), Get quote.**
Muestra el cuadro verde "Approved by the onchain policy".
> "This one is 27 dollars and fits the policy. Before opening Reap's checkout, the gateway reserves the budget onchain."

**5. Reserva onchain (1:05–1:20) — click en "Reserve budget & open checkout".**
Cuando aparezca el paso 2 en verde, abre el link del tx (explorer) y enseña el evento con el quoteId. Vuelve a la app.
> "Here is the reservation transaction on Ink Sepolia, tied to the Reap quote id. The money isn't spent yet, it's reserved."

**6. Aprobacion humana en Reap (1:20–1:40) — "Open approval page".**
Muestra la pagina de Prava: comercio, total $27.67, tarjeta VISA 1985, Verify with passkey (o OTP 456789). Aprueba.
> "A human still approves the charge on Reap's hosted page. The agent never sees the card."

**7. Procesando (1:40–1:50) — vuelve a `/agent`.**
El stepper pasa a "Reap processing the payment" (~30 s: **acelera o corta en edicion**).

**8. Confirmacion (1:50–2:10) — stepper todo verde.**
Enseña el orderId y el link del confirm tx, luego "Done. Reap charged $27.67", y abajo la tarjeta de politica: gastado $27.67, 1 / 10. Abre el confirm tx en el explorer.
> "Reap completed the order. The contract confirmed the real charged amount and stored the order id. If the checkout had failed, the budget would have been released automatically."

**9. (Opcional, +15 s) Revocacion.**
En la terminal: `npx hardhat run scripts/revoke-policy.ts --network inkSepolia`. Luego en `/agent` cotiza algo: sale `Revoked`.
> "And the owner can cut the agent's authority at any moment with one transaction."

**10. Cierre (+10 s) — pantalla: tarjeta de politica o README.**
> "Honest limit: Reap mandates aren't available yet, so today this is an owner-set budget ledger and audit trail enforced by our gateway, not a guarantee over Reap itself. Next step: an MCP wrapper so any LLM agent can use it, and mirroring the policy into Reap mandates. Thanks."

## C. Consejos de grabacion

- Graba por escenas (3, 4-8, 9) y une en edicion; asi si falla la red repites solo una.
- Lo que si o si debe verse: denegacion, reserva con tx, aprobacion Reap, confirmacion con orderId, y el explorer.
- Evita mostrar `.env`, llaves o la terminal con claves.
- Duracion objetivo 2:00–2:30; sube con link publico.

## D. Si algo sale mal

- `QUOTE_REUSED`: elige otro producto o espera 15 min.
- Compra en `NEEDS_REVIEW`: revisa `error` con `npm run agent-status`.
- Politica agotada o revocada: crea otra (paso A1); `policy.json` se actualiza solo; recarga `/agent`.
- RPC lento: espera unos segundos y reintenta la cotizacion; las escrituras no se reintentan solas.

## E. Checklist de entrega

- [ ] `cd frontend && npm run build` sin errores
- [ ] `.env`, `.env.local`, `.data/` ignorados por git
- [ ] README con `<VIDEO_URL>`, `<REPO_URL>`, `<TX_RESERVE_2>`, `<TX_CONFIRM_2>` reemplazados
- [ ] Video subido con link publico
- [ ] Repo publico, sin llaves en el historial
- [ ] Revisar en Telegram fecha limite y campos requeridos
- [ ] Enviar en https://gavel-65labs.vercel.app/submit/74oz5tv1cfzllzh392gy1rqzvx4m1vop