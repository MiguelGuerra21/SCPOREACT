// src/components/LayerPanel.jsx
import React, { useState } from "react";

const LayerPanel = ({ layers, onToggleVisibility, onCenterView }) => {
  const [isOpen, setIsOpen] = useState(true);

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
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        style={{
          alignSelf: "flex-end",
          marginBottom: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "16px",
        }}
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? "Contraer" : "Expandir"}
      >
        {isOpen ? "⮜" : "⮞"}
      </button>

      {isOpen && (
        <>
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
<span
  style={{
    width: "12px",
    height: "12px",
    backgroundColor: Array.isArray(entry.color)
      ? `rgba(${entry.color[0]}, ${entry.color[1]}, ${entry.color[2]}, 0.7)`
      : entry.color || "#ccc",
    border: "1px solid #999",
    marginLeft: "6px",
    marginRight: "6px",
    display: "inline-block",
    borderRadius: "2px",
  }}
/>
                <span>{entry.name}</span>
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
        </>
      )}
    </div>
  );
};

export default LayerPanel;
