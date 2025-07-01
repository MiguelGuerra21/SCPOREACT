// src/components/LayerPanel.jsx
import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";

const LayerPanel = ({
  layers,
  onToggleVisibility,
  onCenterView,
  onRemoveLayer,        // ← new prop
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isAndroid = Capacitor.getPlatform() === "android";

  const containerStyle = {
    position: "absolute",
    bottom: isAndroid ? 40 : 60,
    left: 16,
    width: isOpen ? 240 : 40,
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
    transform: isOpen ? "rotate(0deg)" : "rotate(180deg)",
    transition: "transform 0.3s",
  };

  const contentStyle = {
    display: isOpen ? "block" : "none",
    padding: "8px 12px",
    maxHeight: "60vh",
    overflowY: "auto",
  };

  const layerItemStyle = {
    display: "flex",
    alignItems: "center",
    marginBottom: 8,
    cursor: "pointer",
    transition: "background 0.2s",
    borderRadius: 4,
    padding: "4px",
  };

  const textStyle = { flex: 1, fontSize: 14, userSelect: "none" };

  const removeBtnStyle = {
    background: "none",
    border: "none",
    padding: 4,
    marginLeft: 8,
    cursor: "pointer",
    color: "#000",        // black
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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {isOpen && <strong>Capas</strong>}
        <button
          style={toggleBtnStyle}
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Contraer panel" : "Expandir panel"}
        >
          ⮜
        </button>
      </div>

      <div style={contentStyle}>
        {layers.length === 0 && (
          <p style={{ fontStyle: "italic", margin: "8px 0" }}>
            No hay capas cargadas
          </p>
        )}

        {layers.map((entry) => (
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
              onClick={() => onToggleVisibility(entry.id)}
            >
              {entry.name}
            </span>
            {/* Remove layer Button */}
            <button
              style={removeBtnStyle}
              onClick={() =>  onRemoveLayer(entry.id)}
              title="Eliminar capa"
            >
              🗑️
            </button>
          </div>
        ))}

        {layers.length > 0 && (
          <button
            style={centerBtnStyle}
            onClick={onCenterView}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#019875")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#00b894")}
          >
            Centrar vista
          </button>
        )}
      </div>
    </div>
  );
};

export default LayerPanel;
