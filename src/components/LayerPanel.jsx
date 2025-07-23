// src/components/LayerPanel.jsx
import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { FaChevronRight, FaChevronLeft } from "react-icons/fa";

const LayerPanel = ({
  layers = [],
  onToggleVisibility,
  onCenterView,
  onRemoveLayer,
  embedded = false,
  stateColors = {},
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [openDetails, setOpenDetails] = useState(null);
  const [layerStates, setLayerStates] = useState({}); // Para guardar estados y porcentajes por capa
  const isAndroid = Capacitor.getPlatform() === "android";

  // Cada vez que cambian las capas, calculamos estados y porcentajes
  useEffect(() => {
    const processLayers = async () => {
      const newLayerStates = {};

      for (const entry of layers) {
        const layer = entry.layer;
        if (!layer) continue;

        try {
          // Hacemos query para obtener features con atributos
          const query = layer.createQuery();
          query.returnGeometry = false;
          query.outFields = ["*"];
          query.where = "1=1";
          query.num = 10000;

          const result = await layer.queryFeatures(query);
          const features = result.features;

          // Recoger los nombres de los campos de etapas que contengan fecha (ej: "Fecha ET01", "Fecha ET02", etc)
          const attrKeys = features.length > 0 ? Object.keys(features[0].attributes) : [];
          const fechaFields = attrKeys.filter(
            (k) => k.toLowerCase().startsWith("fecha")
          );

          // Obtenemos también los campos "Etapa XX" para obtener valores reales
          const etapaFields = attrKeys.filter((k) =>
            k.toLowerCase().startsWith("etapa")
          );

          // Calcular estado actual para cada feature: la última etapa con fecha no vacía
          // Y tomar el valor real del campo "Etapa XX" asociado a esa etapa
          const estadoCounts = {}; // Conteo por estado real
          let total = features.length;

          for (const feat of features) {
            let ultimaEtapaIndex = -1;
            for (let i = 0; i < fechaFields.length; i++) {
              const val = feat.attributes[fechaFields[i]];
              if (val !== null && val !== undefined && val !== "") {
                ultimaEtapaIndex = i;
              }
            }

            // Obtenemos el valor real de la etapa desde el campo Etapa XX correspondiente
            // Suponemos que el índice de fechaFields corresponde a etapaFields (mismo orden)
            // Si no hay campo Etapa XX, fallback a "Sin estado"
            let estadoReal = "Sin estado";
            if (etapaFields.length > ultimaEtapaIndex) {
              const campoEtapa = etapaFields[ultimaEtapaIndex];
              const valEtapa = feat.attributes[campoEtapa];
              if (valEtapa !== null && valEtapa !== undefined && valEtapa !== "") {
                estadoReal = valEtapa.toString();
              }
            }
            // Si no tiene fecha en ninguna etapa, se puede asignar un estado 'Sin estado' o ignorar
            if (ultimaEtapaIndex === -1) {
              estadoCounts[estadoReal] = (estadoCounts[estadoReal] || 0) + 1;
              continue;
            }
            estadoCounts[estadoReal] = (estadoCounts[estadoReal] || 0) + 1;
          }

          // Obtener lista ordenada de estados para mostrar (incluso con 0)
          // Combinamos con los valores únicos que haya en todas features en los campos etapaFields
          const valoresUnicos = new Set(["Sin estado"]);
          for (const feat of features) {
            etapaFields.forEach((campo) => {
              const val = feat.attributes[campo];
              if (val !== null && val !== undefined && val !== "") {
                valoresUnicos.add(val.toString());
              }
            });
          }
          const estadosTodos = Array.from(valoresUnicos);
          // Mover "Sin estado" al final
          const idxSinEstado = estadosTodos.indexOf("Sin estado");
          if (idxSinEstado !== -1) {
            estadosTodos.splice(idxSinEstado, 1);
            estadosTodos.push("Sin estado");
          }
          // Para estados sin conteo asignar 0
          estadosTodos.forEach((e) => {
            if (!(e in estadoCounts)) estadoCounts[e] = 0;
          });

          const porcentajes = {};
          let totalPorcentajes = 0;
          const estadosConFeatures = estadosTodos.filter(e => estadoCounts[e] > 0);

          // Paso 1: Calcular porcentajes base (redondeando hacia abajo)
          estadosTodos.forEach((e) => {
            if (estadoCounts[e] > 0) {
              porcentajes[e] = Math.floor((estadoCounts[e] * 100) / total);
              totalPorcentajes += porcentajes[e];
            } else {
              porcentajes[e] = 0;
            }
          });

          // Paso 2: Repartir el sobrante entre los estados con features
          let sobrante = 100 - totalPorcentajes;
          let i = 0;
          while (sobrante > 0 && estadosConFeatures.length > 0) {
            const estado = estadosConFeatures[i % estadosConFeatures.length];
            porcentajes[estado] += 1;
            sobrante--;
            i++;
          }

          // Guardamos todo para esta capa
          newLayerStates[entry.id] = {
            estados: estadosTodos,
            conteos: estadoCounts,
            porcentajes,
          };
        } catch (error) {
          console.error("Error procesando capa para LayerPanel:", error);
        }
      }

      setLayerStates(newLayerStates);
    };

    processLayers();
  }, [layers]);

  const containerStyle = embedded
    ? {
        position: "relative",
        width: "100%",
        backgroundColor: "#fff",
        borderRadius: 8,
        boxShadow: "none",
        overflow: "visible",
        marginTop: 8,
        transition: "none",
        zIndex: "auto",
      }
    : {
        position: "absolute",
        bottom: isAndroid ? 70 : 60,
        left: 16,
        width: isOpen ? 260 : 40,
        backgroundColor: "#fff",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        overflow: "hidden",
        transition: "width 0.3s",
        zIndex: 1000,
      };

  const headerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: isOpen ? "space-between" : "center",
    padding: "8px 12px",
    background: "linear-gradient(90deg, #4facfe, #00f2fe)",
    color: "#fff",
  };

  const toggleBtnStyle = {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    transition: "transform 0.3s",
  };

  const contentStyle = {
    display: isOpen ? "block" : "none",
    padding: "8px 12px",
    maxHeight: embedded ? "none" : "60vh",
    overflowY: embedded ? "visible" : "auto",
  };

  const layerItemStyle = {
    display: "flex",
    flexDirection: "column",
    marginBottom: 8,
    cursor: "default",
    borderRadius: 4,
    padding: "4px",
  };

  const topRowStyle = {
    display: "flex",
    alignItems: "center",
    width: "100%",
  };

  const textStyle = {
    flex: 1,
    fontSize: 14,
    userSelect: "none",
    cursor: "pointer",
  };

  const removeBtnStyle = {
    background: "none",
    border: "none",
    padding: 4,
    marginLeft: 8,
    cursor: "pointer",
    color: "#000",
    fontSize: 16,
    lineHeight: 1,
  };

  const centerBtnStyle = {
    width: "100%",
    padding: "8px",
    marginTop: 8,
    backgroundColor: "#00b894",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    transition: "background 0.2s",
  };

  const handleToggleDetails = (id) => {
    setOpenDetails((old) => (old === id ? null : id));
  };

const getColorForState = (state, index) => {
  if (stateColors && stateColors.hasOwnProperty(state) && stateColors[state] != null) {
    return stateColors[state];
  }
};

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {isOpen && <strong>Capas</strong>}
        <button
          style={toggleBtnStyle}
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Contraer panel" : "Expandir panel"}
        >
          {isOpen ? <FaChevronLeft /> : <FaChevronRight />}
        </button>
      </div>

      <div style={contentStyle}>
        {layers.length === 0 && (
          <p style={{ fontStyle: "italic", margin: "8px 0" }}>
            No hay capas cargadas
          </p>
        )}
 {/* CONTENEDOR CON SCROLL */}
  <div
    style={{
      maxHeight: "300px",      
      overflowY: "auto",        
      paddingRight: "6px",     
      marginBottom: "8px",      
    }}
  >
        {layers.map((entry) => {
          const isOpenLayer = openDetails === entry.id;
          const estadosRaw = layerStates[entry.id]?.estados || [];
          const estados = estadosRaw.filter(e => e !== "Sin estado").concat("Sin estado");
          const conteos = layerStates[entry.id]?.conteos || {};
          const porcentajes = layerStates[entry.id]?.porcentajes || {};
          const total = Object.values(conteos).reduce((a, b) => a + b, 0);

          return (
            <div key={entry.id} style={layerItemStyle}>
              <div style={topRowStyle}>
                <input
                  type="checkbox"
                  checked={entry.visible}
                  readOnly
                  onClick={() => onToggleVisibility(entry.id)}
                  style={{ marginRight: 8 }}
                />
                <span
                  style={textStyle}
                  onClick={() => handleToggleDetails(entry.id)}
                  title={entry.name}
                >
                  {entry.name}
                </span>
                <button
                  style={removeBtnStyle}
                  onClick={() => onRemoveLayer(entry.id)}
                  title="Eliminar capa"
                >
                  🗑️
                </button>
              </div>

              {isOpenLayer && (
                <div
                  style={{
                    backgroundColor: "#f9f9f9",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    padding: "6px 8px",
                    marginTop: 6,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
{estados.length === 0 ? (
  <em style={{ color: "#888" }}>No hay estados detectados</em>
) : (
  estadosRaw
    .filter(e => e !== "Sin estado")
    .concat("Sin estado")
    .map((estado, i) => {
      const pct = porcentajes[estado] || 0;
      const toCssColor = (color) => {
         if (Array.isArray(color)) {
          const [r, g, b, a] = color;
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        return color || "transparent"; // Si ya es string (#ffffff) o undefined
      };
      const color = getColorForState(estado, i);
                      return (
                        <div
                          key={estado}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "2px 0",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "default",
                          }}
                          title={`${estado}: ${pct}% (${conteos[estado] || 0})`}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              width: 12,
                              height: 12,
                              marginRight: 6,
                              backgroundColor: toCssColor(color),
                              border: "1px solid #ccc",
                              borderRadius: 2,
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flexGrow: 1,
                            }}
                          >
                            {estado}
                          </span>
                          <span
                            style={{
                              marginLeft: 8,
                              flexShrink: 0,
                              fontWeight: "bold",
                              color: "#555",
                              minWidth: 40,
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {pct}%
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
</div>
        {layers.length > 0 && (
          <button
            style={centerBtnStyle}
            onClick={onCenterView}
            onMouseEnter={(e) =>
               (e.currentTarget.style.background = "#019875")
              }
            onMouseLeave={(e) => 
              (e.currentTarget.style.background = "#00b894")
            }
          >
            Centrar vista
          </button>
        )}
      </div>
    </div>
  );
};

export default LayerPanel;
