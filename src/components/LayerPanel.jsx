// src/components/LayerPanel.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const statsRef = useRef({});
  const isAndroid = Capacitor.getPlatform() === "android";

  // Función para convertir colores a formato CSS
  const toCssColor = useCallback((color) => {
    if (!color) return 'transparent';
    if (Array.isArray(color)) {
      const [r, g, b, a] = color;
      return `rgba(${r}, ${g}, ${b}, ${a || 1})`;
    }
    return color;
  }, []);

  // Función para obtener el color del borde
  const getBorderColor = useCallback((color, estado) => {
    if (estado === "Sin estado") return "#000";
    if (Array.isArray(color)) {
      const [r, g, b] = color;
      return `rgba(${r}, ${g}, ${b}, 1)`;
    }
    return color || "#000";
  }, []);

  // Efecto para calcular y actualizar estadísticas
  useEffect(() => {
    const abortController = new AbortController();

    const updateLayerStats = async () => {
      const updates = {};

      await Promise.all(layers.map(async (entry) => {
        if (abortController.signal.aborted || !entry.layer) return;

        try {
          // Solo actualizar si la versión cambió
          const currentVersion = entry.version || 0;
          if (statsRef.current[entry.id]?.version === currentVersion) return;

          // Consulta optimizada solo para el campo necesario
          const query = entry.layer.createQuery();
          query.outFields = ["Estado"];
          query.returnGeometry = false;
          query.where = "1=1";

          const result = await entry.layer.queryFeatures(query);
          const features = result.features;
          const estados = entry.estados || ["Sin estado"];
          const conteos = {};
          const porcentajes = {};

          // Contar estados
          features.forEach(f => {
            const estado = f.attributes.Estado || "Sin estado";
            conteos[estado] = (conteos[estado] || 0) + 1;
          });

          // Calcular porcentajes
          const total = features.length;
          estados.forEach(e => {
            const count = conteos[e] || 0;
            porcentajes[e] = total > 0 ? Math.round((count / total) * 100) : 0;
          });

          updates[entry.id] = {
            version: currentVersion,
            estados,
            conteos,
            porcentajes,
            stateColors: entry.stateColors || {}
          };
        } catch (error) {
          console.error(`Error procesando capa ${entry.id}:`, error);
        }
      }));

      if (!abortController.signal.aborted) {
        statsRef.current = { ...statsRef.current, ...updates };
      }
    };

    updateLayerStats();
    
    return () => abortController.abort();
  }, [layers]);

  // Obtener estadísticas actuales
  const getCurrentStats = (layerId) => {
    return statsRef.current[layerId] || {
      estados: [],
      conteos: {},
      porcentajes: {},
      stateColors: {}
    };
  };

  // Estilos del componente
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
    backgroundColor: "#f8f9fa",
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
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
    ":hover": {
      backgroundColor: "#019875",
    },
  };

  const handleToggleDetails = (id) => {
    setOpenDetails((old) => (old === id ? null : id));
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
            const { estados, conteos, porcentajes, stateColors } = getCurrentStats(entry.id);
            const estadosOrdenados = ["Sin estado"].concat(estados.filter(e => e !== "Sin estado"));

            return (
              <div key={entry.id} style={layerItemStyle}>
                <div style={topRowStyle}>
                  <input
                    type="checkbox"
                    checked={entry.visible}
                    onChange={() => onToggleVisibility(entry.id)}
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
                  <div style={{
                    backgroundColor: "#f9f9f9",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    padding: "6px 8px",
                    marginTop: 6,
                  }}>
                    {estadosOrdenados.length === 0 ? (
                      <em style={{ color: "#888" }}>No hay estados detectados</em>
                    ) : (
                      estadosOrdenados.map((estado) => {
                        const color = stateColors[estado];
                        const borderColor = getBorderColor(color, estado);
                        const pct = porcentajes[estado] || 0;
                        const count = conteos[estado] || 0;

                        return (
                          <div
                            key={estado}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "2px 0",
                              overflow: "hidden",
                            }}
                            title={`${estado}: ${pct}% (${count})`}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                marginRight: 6,
                                backgroundColor: toCssColor(color),
                                border: `3px solid ${borderColor}`,
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
                                fontSize: 13,
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
                                fontSize: 13,
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
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#019875")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#00b894")}
          >
            Centrar vista
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(LayerPanel);