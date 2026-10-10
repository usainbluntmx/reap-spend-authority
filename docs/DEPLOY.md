# Despliegue en Dokploy

Una sola app (contenedor) con el frontend + gateway. **Una sola replica** (el lock de `finalize` esta en memoria).

## 1. Antes de subir (local)

1. Crea la politica que se usara en la evaluacion (generosa, los jueces gastan presupuesto):
   `cd backend && MAX_CHARGES=50 TOTAL_USD=1000 PER_PURCHASE_USD=40 npx hardhat run scripts/create-policy.ts --network inkSepolia`
2. `frontend/config/spend-authority.json` y `frontend/config/policy.json` **deben ir en el repo** (no tienen secretos: direccion, ABI, ids). Verifica que NO esten ignorados:
   `git check-ignore -v frontend/config/policy.json frontend/config/spend-authority.json` → no debe imprimir nada.
   Si los ignora, quita esas lineas del `.gitignore`.
3. `.env`, `.env.local` y `.data/` siguen ignorados (nunca al repo).
4. Saca tu enrollment id: `cat frontend/.data/enrollment.json` (campo `enrollmentId`).
5. Prueba local: `cd frontend && npm run build` sin errores. Commit y push.

## 2. En Dokploy

1. **Create Application** → Provider: GitHub/Git, tu repo, rama `main`.
2. **Build Type: Dockerfile**, Docker File: `Dockerfile`, Docker Context Path: `frontend`.
3. **Environment** (pestaña Environment), una por linea:

```
REAP_API_KEY=...
REAP_BASE_URL=...            # el mismo de tu .env.local
REAP_VERSION=2025-02-14
DEMO_USER_ID=...
DEMO_USER_EMAIL=...
REAP_ENROLLMENT_ID=<enrollmentId de .data/enrollment.json>
GATEWAY_PRIVATE_KEY=0x...    # llave del AGENTE (la de create-policy), nunca la del dueño
DEMO_ACCESS_KEY=<clave larga que inventes>
REAP_RETURN_URL=https://TU-DOMINIO/agent
```

   Copia tambien `DEMO_SHIP_*` si los tienes en `.env.local`. Si usas `NEXT_PUBLIC_REOWN_PROJECT_ID`, ponla en **Build-time Arguments** (se hornea al compilar), no solo en Environment.
4. **Advanced → Volumes**: Volume Mount, nombre `spend-data`, mount path `/app/.data`. Sin esto, cada redeploy borra el historial de compras.
5. **Domains**: host `spend.zerotwolabs.xyz` (o el que uses), path `/`, **container port 3000**, HTTPS on. Como con tus otros sitios: si sales por Cloudflare Tunnel, apunta el hostname del tunel al servicio de Dokploy y crea el DNS en Cloudflare.
6. **Deploy**. Mira los logs: debe terminar con `Ready` de Next en el puerto 3000.

## 3. Verificar (desde la URL publica)

- `https://TU-DOMINIO/api/policy` devuelve JSON con `accessRequired: true` y tu politica.
- En `/agent`: cotiza "kona french roast" → denegado (sin pedir clave).
- Cotiza "badass coffee" → aparece el campo **Demo access key**; sin clave, al comprar sale 401; con la clave, flujo completo hasta COMPLETED.
- Reinicia el contenedor y comprueba que el historial sigue ahi (volumen OK).
- `cd frontend && npm run reap-check` en local: el enrollment sigue ACTIVE.

## 4. Para el jurado

- En el formulario de envio pon la URL y la clave: "Demo key: `<DEMO_ACCESS_KEY>` (sandbox only; quoting and policy checks work without it)".
- Pon `<LIVE_URL>` en el README.
- Cuando la politica se agote o cambie: crea otra con `create-policy.ts`, commit de `policy.json` y redeploy.

## 5. Problemas comunes

| Sintoma | Causa |
|---|---|
| `MISSING_CONFIG: Falta config/policy.json` | el JSON esta ignorado por git o no esta en el repo |
| `MISSING_CONFIG ... enrollment` | falta `REAP_ENROLLMENT_ID` |
| 401 `UNAUTHORIZED` al comprar | falta o es incorrecta la clave en el campo |
| Historial vacio tras redeploy | falta el volumen en `/app/.data` |
| Reap rechaza el checkout | `REAP_RETURN_URL` no aceptada: quita la variable (usa example.com) |
| Revert `Revoked` / `Expired` | la politica ya no sirve: crea una nueva y redeploy |