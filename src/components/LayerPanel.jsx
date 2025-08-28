// src/components/LayerPanel.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { FaChevronRight, FaChevronLeft } from "react-icons/fa";
import { COLOR_SIN_ESTADO } from "../utils/ColorPalette";
import styles from "./LayerPanel.module.css";

const LayerPanel = ({
  layers = [],
  stateColors,
  onToggleVisibility,
  onCenterView,
  onRemoveLayer,
  onToggleStateVisibility,
  embedded = false,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [openDetails, setOpenDetails] = useState(null);
  const [hiddenStates, setHiddenStates] = useState({});
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

  // Función para alternar visibilidad de un estado
  const handleToggleState = useCallback((layerId, estado) => {
    const isHidden = !hiddenStates[layerId]?.[estado];

    // Actualizar estado local
    setHiddenStates(prev => {
      const newState = { ...prev };
      if (!newState[layerId]) newState[layerId] = {};
      newState[layerId][estado] = isHidden;
      return newState;
    });

    // Notificar al componente padre
    if (onToggleStateVisibility) {
      onToggleStateVisibility(layerId, estado, isHidden);
    }
  }, [hiddenStates, onToggleStateVisibility]);

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
  }, [layers, stateColors]);

  // Obtener estadísticas actuales
  const getCurrentStats = (layerId) => {
    return statsRef.current[layerId] || {
      estados: [],
      conteos: {},
      porcentajes: {},
      stateColors: {}
    };
  };

  const handleToggleDetails = (id) => {
    setOpenDetails((old) => (old === id ? null : id));
  };

 // clases del contenedor (embedded vs floating, abierto/cerrado)
  const containerClasses = [
    styles.container,
    embedded ? styles.containerEmbedded : styles.containerFloating,
    !isOpen && !embedded ? styles.containerClosed : "",
  ].join(" ");

  // content classes (oculto/embebido)
  const contentClasses = [
    styles.content,
    !isOpen ? styles.contentHidden : "",
    embedded ? styles.contentEmbedded : "",
  ].join(" ");

  // cálculo inline mínimo: bottom (Android offset) y left (const)
  const containerInlineStyle = embedded
    ? {}
    : { bottom: isAndroid ? 70 : 60, left: 16 };


  return (
    <div className={containerClasses} style={containerInlineStyle}>
      <div className={[styles.header, !isOpen ? styles.headerClosed : ""].join(" ")}>
        {isOpen && <strong>Capas</strong>}
        <button
          className={styles.toggleBtn}
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Contraer panel" : "Expandir panel"}
        >
          {isOpen ? <FaChevronLeft /> : <FaChevronRight />}
        </button>
      </div>

      <div className={contentClasses}>
        {layers.length === 0 && (
          <p className={styles.emptyText}>
            No hay capas cargadas
          </p>
        )}
        {/* CONTENEDOR CON SCROLL */}
        <div className={styles.scrollContainer}>
          {layers.map((entry) => {
            const isOpenLayer = openDetails === entry.id;
            const { estados, conteos, porcentajes } = getCurrentStats(entry.id);
            const estadosOrdenados = ["Sin estado"].concat(estados.filter(e => e !== "Sin estado"));

            return (
              <div key={entry.id} className={styles.layerItem}>
                <div className={styles.topRow}>
                  <input
                    type="checkbox"
                    checked={entry.visible}
                    onChange={() => onToggleVisibility(entry.id)}
                    className={styles.checkbox}
                  />
                  <span
                    className={styles.layerName}
                    onClick={() => handleToggleDetails(entry.id)}
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => onRemoveLayer(entry.id)}
                    title="Eliminar capa"
                  >
                    🗑️
                  </button>
                </div>

                {isOpenLayer && (
                  <div className={styles.statesBox}>
                    {estadosOrdenados.length === 0 ? (
                      <em style={{ color: "#888" }}>No hay estados detectados</em>
                    ) : (
                      estadosOrdenados.map((estado) => {

                        const key = estado.trim().toLowerCase();
                        const rgb = entry.stateColors[key] || COLOR_SIN_ESTADO;
                        const fill = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`;
                        const outline = key === "sin estado"
                          ? "#000"
                          : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`;
                          
                        const pct = porcentajes[estado] || 0;
                        const count = conteos[estado] || 0;
                        const isHidden = hiddenStates[entry.id]?.[estado];

                        return (
                          <div
                            key={estado}
                            className={[styles.stateRow, isHidden ? styles.stateHidden : ""].join(" ")}
                            title={`${estado}: ${pct}% (${count})`}
                            onClick={() => handleToggleState(entry.id, estado)}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e9e9e9"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isHidden ? "#f0f0f0" : "transparent"}
                          >
                            <span
                              className={styles.stateColor}
                              style={{
                                backgroundColor: fill,
                                border: `2px solid ${outline}`,
                              }}
                            />
                            <span className={styles.stateName}>{estado}</span>
                            <span className={styles.statePercent}>{pct}%</span>
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
            className={styles.centerBtn}
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