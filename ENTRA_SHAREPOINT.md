export const reportSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fecha_emision: {
      type: "string",
      description: "Fecha del reporte en formato YYYY-MM-DD."
    },
    usuarios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombre_ifi: { type: "string" },
          usuarios_activos: { type: "integer" },
          usuarios_activos_dia: { type: "integer" },
          total_usuarios: { type: "integer" }
        },
        required: [
          "nombre_ifi",
          "usuarios_activos",
          "usuarios_activos_dia",
          "total_usuarios"
        ]
      }
    },
    transferencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombre_ifi: { type: "string" },
          internas_numero_web: { type: "integer" },
          internas_monto_web: { type: "number" },
          internas_numero_movil: { type: "integer" },
          internas_monto_movil: { type: "number" },
          externas_numero_web: { type: "integer" },
          externas_monto_web: { type: "number" },
          externas_numero_movil: { type: "integer" },
          externas_monto_movil: { type: "number" },
          tarjetas_numero_web: { type: "integer" },
          tarjetas_monto_web: { type: "number" },
          tarjetas_numero_movil: { type: "integer" },
          tarjetas_monto_movil: { type: "number" },
          numero_web: { type: "integer" },
          monto_web: { type: "number" },
          numero_movil: { type: "integer" },
          monto_movil: { type: "number" },
          total_numero_canales: { type: "integer" },
          total_monto_canales: { type: "number" }
        },
        required: [
          "nombre_ifi",
          "internas_numero_web",
          "internas_monto_web",
          "internas_numero_movil",
          "internas_monto_movil",
          "externas_numero_web",
          "externas_monto_web",
          "externas_numero_movil",
          "externas_monto_movil",
          "tarjetas_numero_web",
          "tarjetas_monto_web",
          "tarjetas_numero_movil",
          "tarjetas_monto_movil",
          "numero_web",
          "monto_web",
          "numero_movil",
          "monto_movil",
          "total_numero_canales",
          "total_monto_canales"
        ]
      }
    },
    pagos_servicios: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nombre_ifi: { type: "string" },
          numero_web: { type: "integer" },
          monto_web: { type: "number" },
          numero_movil: { type: "integer" },
          monto_movil: { type: "number" },
          total_numero_canales: { type: "integer" },
          total_monto_canales: { type: "number" }
        },
        required: [
          "nombre_ifi",
          "numero_web",
          "monto_web",
          "numero_movil",
          "monto_movil",
          "total_numero_canales",
          "total_monto_canales"
        ]
      }
    },
    advertencias: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "fecha_emision",
    "usuarios",
    "transferencias",
    "pagos_servicios",
    "advertencias"
  ]
};
