# Microsoft Entra y permisos de SharePoint

## Aplicación 1: Tikee Adoption 360 Web

1. En **Microsoft Entra admin center → App registrations**, crea una aplicación
   de un solo tenant.
2. En **Authentication → Add a platform → Single-page application**, registra la
   URL exacta de GitHub Pages:

```text
https://TU_USUARIO.github.io/TU_REPOSITORIO/
```

3. En **API permissions → Microsoft Graph → Delegated permissions**, agrega
   `Sites.Selected`.
4. Conserva:
   - Directory (tenant) ID → `MS_TENANT_ID`.
   - Application (client) ID → `MS_SPA_CLIENT_ID`.
5. No crees ni publiques un secreto para la SPA.

## Aplicación 2: Tikee Adoption 360 Worker

1. Crea otra aplicación de un solo tenant.
2. En **API permissions → Microsoft Graph → Application permissions**, agrega
   `Sites.Selected`.
3. Un administrador debe conceder el consentimiento del tenant.
4. En **Certificates & secrets**, crea un secreto con vencimiento controlado.
5. Conserva el client ID y el valor del secreto como GitHub Actions Secrets.

## Asignar el sitio seleccionado

`Sites.Selected` no entrega acceso a ningún sitio por sí solo. Un administrador
debe asignar explícitamente el sitio a cada aplicación:

- Aplicación Web: rol `read`.
- Aplicación Worker: rol `write`.

La asignación se hace mediante Microsoft Graph:

```http
POST https://graph.microsoft.com/v1.0/sites/SITE_ID/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "SPA_CLIENT_ID",
        "displayName": "Tikee Adoption 360 Web"
      }
    }
  ]
}
```

Repite con el client ID del Worker y `"roles": ["write"]`.

Para obtener `SITE_ID`, un administrador puede consultar:

```http
GET https://graph.microsoft.com/v1.0/sites/TU_EMPRESA.sharepoint.com:/sites/TikeeAdoption360
```

La cuenta que abre la plataforma también debe tener acceso normal de SharePoint
al sitio o biblioteca. El permiso delegado no reemplaza los permisos del usuario.

## Comprobaciones

- La SPA solo tiene URI de redirección tipo **Single-page application**.
- La URL incluye exactamente el subdirectorio del repositorio y `/` final.
- El Worker no usa la URI de GitHub Pages.
- El secreto Worker existe solo en GitHub Actions Secrets.
- Ambas aplicaciones tienen asignado únicamente el sitio de Tikee.
- Los usuarios no autorizados en SharePoint no pueden descargar
  `publicado/dashboard.json`.
