name: Procesar correo y actualizar SharePoint

on:
  schedule:
    # GitHub usa UTC. En Ecuador se ejecuta cada hora de 07:00 a 18:00,
    # de lunes a viernes. Si no hay archivos nuevos, no se llama a Claude.
    - cron: "0 12-23 * * 1-5"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: sharepoint-daily-sync
  cancel-in-progress: false

jobs:
  process:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Obtener repositorio
        uses: actions/checkout@v6

      - name: Procesar entradas pendientes
        env:
          MS_TENANT_ID: ${{ secrets.MS_TENANT_ID }}
          MS_WORKER_CLIENT_ID: ${{ secrets.MS_WORKER_CLIENT_ID }}
          MS_WORKER_CLIENT_SECRET: ${{ secrets.MS_WORKER_CLIENT_SECRET }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          ANTHROPIC_MODEL: ${{ vars.ANTHROPIC_MODEL }}
          SHAREPOINT_HOSTNAME: ${{ vars.SHAREPOINT_HOSTNAME }}
          SHAREPOINT_SITE_PATH: ${{ vars.SHAREPOINT_SITE_PATH }}
          SHAREPOINT_LIBRARY: ${{ vars.SHAREPOINT_LIBRARY }}
          SHAREPOINT_DATA_ROOT: ${{ vars.SHAREPOINT_DATA_ROOT }}
          DATA_MONTHS: ${{ vars.DATA_MONTHS }}
          ALLOWED_OUTLOOK_SENDER: ${{ vars.ALLOWED_OUTLOOK_SENDER }}
          ALLOWED_OUTLOOK_SUBJECT: ${{ vars.ALLOWED_OUTLOOK_SUBJECT }}
        run: node automation/process-sharepoint.mjs
