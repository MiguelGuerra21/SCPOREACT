// src/components/LayerPanel.jsx
import React from "react";

const LayerPanel = ({ layers, onToggleVisibility, onCenterView }) => {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: 10,
        backgroundColor: "white",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        zIndex: 1000,
        maxHeight: "60vh",
        overflowY: "auto",
        minWidth: "180px",
      }}
    >
      <strong>Capas</strong>
      {layers.length ? (
        layers.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "6px",
            }}
          >
            <input
              type="checkbox"
              checked={entry.visible}
              onChange={() => onToggleVisibility(entry.id)}
            />
            <span style={{ marginLeft: "6px" }}>{entry.name}</span>
          </div>
        ))
      ) : (
        <div style={{ marginTop: "6px", fontStyle: "italic" }}>
          No hay capas cargadas
        </div>
      )}
      <button
        style={{
          marginTop: "10px",
          width: "100%",
          padding: "6px",
          cursor: "pointer",
        }}
        onClick={onCenterView}
      >
        Centrar capas
      </button>
    </div>
  );
};

export default LayerPanel;
