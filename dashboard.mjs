name: Publicar Tikee Adoption 360

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Obtener repositorio
        uses: actions/checkout@v6

      - name: Preparar sitio
        env:
          MS_TENANT_ID: ${{ vars.MS_TENANT_ID }}
          MS_SPA_CLIENT_ID: ${{ vars.MS_SPA_CLIENT_ID }}
          SHAREPOINT_HOSTNAME: ${{ vars.SHAREPOINT_HOSTNAME }}
          SHAREPOINT_SITE_PATH: ${{ vars.SHAREPOINT_SITE_PATH }}
          SHAREPOINT_LIBRARY: ${{ vars.SHAREPOINT_LIBRARY }}
          SHAREPOINT_DATA_ROOT: ${{ vars.SHAREPOINT_DATA_ROOT }}
          SHAREPOINT_DASHBOARD_FILE: ${{ vars.SHAREPOINT_DASHBOARD_FILE }}
          DATA_MONTHS: ${{ vars.DATA_MONTHS }}
          OUTPUT_DIRECTORY: dist
        run: |
          mkdir -p dist/css dist/js dist/vendor
          cp index.html dist/index.html
          cp css/backend.css dist/css/backend.css
          cp js/sharepoint.js dist/js/sharepoint.js
          cp vendor/msal-browser.min.js dist/vendor/msal-browser.min.js
          node scripts/build-config.mjs

      - name: Validar fuente
        run: npm run validate

      - name: Configurar GitHub Pages
        uses: actions/configure-pages@v5

      - name: Empaquetar página
        uses: actions/upload-pages-artifact@v4
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Publicar
        id: deployment
        uses: actions/deploy-pages@v4
