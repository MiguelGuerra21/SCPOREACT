// src/components/LayerPanel.jsx
import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FaChevronRight, FaChevronLeft } from "react-icons/fa";

const LayerPanel = ({
  layers = [],
  onToggleVisibility,
  onCenterView,
  onRemoveLayer,
  embedded = false,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [openDetails, setOpenDetails] = useState(null);
  const [etapasPorCapa, setEtapasPorCapa] = useState({});
  const isAndroid = Capacitor.getPlatform() === "android";

  const getEtapasUnicas = async (layer) => {
  try {
    const query = layer.createQuery();
    query.returnGeometry = false;
    query.outFields = ["*"];
    query.where = "1=1";
    query.num = 10000;

    const result = await layer.queryFeatures(query);
    const features = result.features;

    const valoresUnicos = new Set();

    for (const feat of features) {
      const attrs = feat.attributes;
      for (const key in attrs) {
        if (key.toLowerCase().startsWith("etapa")) {
          const valor = attrs[key];
          if (valor !== null && valor !== undefined && valor !== "") {
            valoresUnicos.add(String(valor).trim());
          }
        }
      }
    }

    return Array.from(valoresUnicos);
  } catch (err) {
    console.error("Error extrayendo etapas:", err);
    return [];
  }
};

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
    alignItems: "center",
    marginBottom: 8,
    cursor: "pointer",
    transition: "background 0.2s",
    borderRadius: 4,
    padding: "4px",
    flexDirection: "column",
    alignItems: "flex-start",
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

const getUniqueStageValues = async (entry) => {
    if (!entry?.layerView?.queryFeatures) return [];

    try {
      const res = await entry.layerView.queryFeatures({
        outFields: ["*"],
        returnGeometry: false,
      });

      const etapaValues = new Set();

      res.features.forEach((feature) => {
        const attrs = feature.attributes || {};
        Object.entries(attrs).forEach(([key, value]) => {
          if (
            key.toLowerCase().startsWith("etapa") &&
            value !== null &&
            value !== ""
          ) {
            etapaValues.add(String(value));
          }
        });
      });

      return Array.from(etapaValues);
    } catch (err) {
      console.warn("Error consultando features:", err);
      return [];
    }
  };

  const handleToggleDetails = async (id, entry) => {
    if (openDetails === id) {
      setOpenDetails(null);
    } else {
      // solo cargar si aún no está cacheado
      if (!etapasPorCapa[id]) {
        const values = await getUniqueStageValues(entry);
        setEtapasPorCapa((prev) => ({ ...prev, [id]: values }));
      }
      setOpenDetails(id);
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

        {layers.map((entry) => {
          const isOpenLayer = openDetails === entry.id;
          const stageValues = etapasPorCapa[entry.id] || [];

          return (
            <div
              key={entry.id}
              style={layerItemStyle}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f0f0f0")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div style={topRowStyle}>
                <input
                  type="checkbox"
                  checked={entry.visible}
                  readOnly
                  onClick={() => onToggleVisibility(entry.id)}
                  style={{ marginRight: 8 }}
                />
                <span
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: Array.isArray(entry.color)
                      ? `rgba(${entry.color[0]},${entry.color[1]},${entry.color[2]},0.7)`
                      : entry.color || "#999",
                    borderRadius: 2,
                    marginRight: 8,
                  }}
                />
                <span
  style={textStyle}
  onClick={async () => {
    if (openDetails === entry.id) {
      setOpenDetails(null);
    } else {
      if (!etapasPorCapa[entry.id]) {
        const valores = await getEtapasUnicas(entry.layer);
        setEtapasPorCapa((prev) => ({
          ...prev,
          [entry.id]: valores,
        }));
      }
      setOpenDetails(entry.id);
    }
  }}
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
      alignSelf: "stretch",
      maxHeight: 120,
      overflowY: "auto",
      backgroundColor: "#f9f9f9",
      border: "1px solid #ddd",
      borderRadius: 4,
      padding: "6px 8px",
      marginTop: 6,
      width: "100%",
      boxSizing: "border-box",
    }}
  >
    {stageValues.length === 0 ? (
      <em style={{ color: "#888" }}>No hay valores de etapa</em>
                  ) : (
                    stageValues.map((val, i) => (
                      <div
          key={i}
          style={{
            padding: "2px 0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          • {val}
        </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

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
