# Reportes automáticos a clientes (semanal y mensual)

Cada IFI recibe solo sus propios datos: un correo HTML con el resumen y un PDF
A4 vertical con el detalle diario. El envío sale de un buzón Microsoft 365
mediante Microsoft Graph, usando la misma aplicación Worker que procesa los
correos.

## Cómo funciona

1. `.github/workflows/client-reports.yml` se ejecuta de lunes a viernes a las
   10:35 de Ecuador.
2. `automation/send-client-reports.mjs` lee de SharePoint:
   - `publicado/dashboard.json` (datos diarios consolidados),
   - `config/destinatarios.json` (a quién se envía cada IFI),
   - `estado/reportes-enviados.json` (qué ya se envió).
3. Calcula la semana anterior (lunes a domingo) y el mes anterior.
4. Solo envía un periodo cuando está **completo**: existe información desde su
   último día hábil en adelante. Si el reporte del viernes aún no llega, espera
   a la siguiente ejecución; si fue feriado, basta con que llegue el siguiente
   reporte.
5. Envía un correo por IFI, guarda el PDF en
   `reportes/semanal|mensual/<periodo>/` y registra el envío. Una IFI nunca
   recibe dos veces el mismo periodo aunque el workflow se repita.
6. Si pasan más de `REPORT_MAX_DELAY_DAYS` (10 por defecto) desde el cierre
   sin poder enviar, ese periodo se omite para no mandar reportes viejos.
7. Si alguna IFI falla (sin destinatarios, nombre que no coincide, error de
   Graph), las demás se envían igual y el workflow termina en rojo para que
   GitHub notifique.

## 1. Permiso de envío (administrador de Microsoft 365)

Crea un buzón dedicado, por ejemplo `reportes@TU_EMPRESA.com` (puede ser un
buzón compartido).

**No** agregues `Mail.Send` como permiso de aplicación en Entra ID: ese permiso
permite enviar como cualquier usuario del tenant, y los permisos de Entra y de
Exchange se suman, así que una restricción en Exchange no lo anula. En su lugar
asigna el rol de Exchange limitado a ese buzón (RBAC for Applications), desde
Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline

# AppId = client ID del Worker; ObjectId = Object ID de su Enterprise
# application (service principal) en Entra, no el de la App registration.
New-ServicePrincipal -AppId <WORKER_CLIENT_ID> -ObjectId <SP_OBJECT_ID> `
  -DisplayName "Tikee Adoption 360 Worker"

New-ManagementScope -Name "Tikee Reportes - buzón" `
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'reportes@TU_EMPRESA.com'"

New-ManagementRoleAssignment -App <SP_OBJECT_ID> `
  -Role "Application Mail.Send" -CustomResourceScope "Tikee Reportes - buzón"

# Verificación: debe ser True para el buzón de reportes y False para otro.
Test-ServicePrincipalAuthorization -Identity <SP_OBJECT_ID> `
  -Resource reportes@TU_EMPRESA.com
```

Los cambios de RBAC pueden tardar en propagarse; si el primer envío responde
403, espera y vuelve a intentar.

## 2. Destinatarios en SharePoint

Copia `sharepoint-seed/Tikee Adoption 360/config/destinatarios.json` a
`Tikee Adoption 360/config/` en SharePoint y complétalo. Los correos de los
clientes viven solo en SharePoint, no en GitHub.

| Campo | Uso |
|---|---|
| `ifi` | Nombre de la IFI tal como aparece en el reporte diario (no distingue mayúsculas ni espacios). |
| `alias` | Otros nombres con los que la misma IFI ha llegado en el correo diario. |
| `nombre_visible` | Opcional: nombre a mostrar en el correo y el PDF. |
| `para`, `cc` | Destinatarios del cliente. |
| `semanal`, `mensual` | `false` para excluir ese tipo de reporte. |
| `activo` | `false` para pausar el cliente. |
| `responder_a` | Dirección a la que llegan las respuestas del cliente. |
| `contacto` | Texto de contacto al pie del correo. |
| `copia_oculta_interna` | Copia oculta interna de cada envío. |

El log del workflow lista las IFI con datos recientes que no tienen
destinatarios configurados.

## 3. Variables de GitHub

En **Settings → Secrets and variables → Actions → Variables**:

| Variable | Ejemplo |
|---|---|
| `REPORT_SENDER_MAILBOX` | `reportes@TU_EMPRESA.com` |
| `REPORT_BRAND` | `Tikee Adoption 360` |
| `REPORT_CURRENCY` | prefijo de montos, p. ej. `USD`; vacío = sin prefijo |
| `REPORT_MAX_DELAY_DAYS` | `10` |

Reutiliza los secretos `MS_TENANT_ID`, `MS_WORKER_CLIENT_ID`,
`MS_WORKER_CLIENT_SECRET` y las variables `SHAREPOINT_*` existentes.

## 4. Puesta en marcha

1. **Actions → Enviar reportes a clientes → Run workflow** con `dry_run`
   activado: revisa en el log qué se enviaría y a quién.
2. Ejecuta con `test_recipient` = tu correo: recibirás todos los reportes con
   `[PRUEBA]` en el asunto. No se marcan como enviados.
3. Activa los clientes (`"activo": true`). Desde ahí el envío es automático.

Para reenviar un periodo a una IFI, elimina su entrada en
`estado/reportes-enviados.json` y ejecuta el workflow.

## Prueba local sin SharePoint

```bash
REPORT_DRY_RUN=true \
REPORT_DASHBOARD_FILE=ruta/dashboard.json \
REPORT_RECIPIENTS_FILE=ruta/destinatarios.json \
REPORT_TODAY=2026-10-05 \
node automation/send-client-reports.mjs
```

Genera los PDF y HTML en `report-preview/`.

## Contenido del reporte

- Usuarios activos y total de usuarios al último día con información del
  periodo, tasa de adopción y promedio diario de usuarios activos del día.
- Número y monto de transferencias y pagos de servicios del periodo, total y
  por canal (web / móvil).
- Variación frente al periodo anterior.
- PDF con el detalle diario.
