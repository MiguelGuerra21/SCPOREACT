// src/components/SelectedCountBanner.jsx
import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";

const SelectedCountBanner = ({
  count,
  onDeselectAll,
  onBatchEdit,
  hasPolygons,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isAndroid = Capacitor.getPlatform() === "android";

  if (count === 0) return null;

  const containerStyle = {
    position: "absolute",
    bottom: isAndroid ? 40 : 60,
    right: 16,
    width: isOpen ? 200 : 40,
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
    display: isOpen ? "flex" : "none",
    justifyContent: "space-around",
    alignItems: "center",
    padding: "12px",
    gap: 8,
  };

  const editButtonStyle = {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // subtle vertical gradient from a deeper green to a lighter one
    background: "linear-gradient(180deg, #28a745 0%, #1fa85a 100%)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.2s",
  };
  const deselectButtonStyle = {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fd7e14",   // orange
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.2s",
  };

  const iconStyle = { fontSize: 24, color: "#fff", lineHeight: 1 };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {isOpen && <span>Seleccionados: {count}</span>}
        <button
          style={toggleBtnStyle}
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Contraer" : "Expandir"}
        >
          ⮜
        </button>
      </div>

      <div style={contentStyle}>
        {/* Editar atributos */}
        {hasPolygons && (
          <button
            style={editButtonStyle}
            onClick={onBatchEdit}
            title="Editar atributos"
            onMouseEnter={e => e.currentTarget.style.background = "linear-gradient(180deg, #238636 0%, #1b7b4a 100%)"}
            onMouseLeave={e => e.currentTarget.style.background = "linear-gradient(180deg, #28a745 0%, #1fa85a 100%)"}
          >
<span style={{ fontSize: 24, color: "#fff" }}>🖉</span>
          </button>
        )}
        {/* Deseleccionar todo */}
        <button
          style={deselectButtonStyle}
          onClick={onDeselectAll}
          title="Deseleccionar todo"
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e56b08")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fd7e14")}
        >
<span style={{ fontSize: 24, color: "#fff" }}>✘</span>
          </button>
      </div>
    </div>
  );
};

export default SelectedCountBanner;
