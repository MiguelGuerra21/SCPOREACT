// src/components/SelectedCountBanner.jsx
import React from "react";

const SelectedCountBanner = ({ count, onDeselectAll, onBatchEdit, hasPolygons }) => {
  if (count === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        right: 10,
        backgroundColor: "white",
        padding: "6px 12px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        zIndex: 1000,
      }}
    >
      <div>Seleccionados: {count}</div>
      <hr style={{ margin: "4px 0" }} />
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          style={{ padding: "4px 8px", cursor: "pointer" }}
          onClick={onDeselectAll}
        >
          Deseleccionar todo
        </button>
        {hasPolygons && (
          <button
            style={{ padding: "4px 8px", cursor: "pointer" }}
            onClick={onBatchEdit}
          >
            Editar atributos
          </button>
        )}
      </div>
    </div>
  );
};

export default SelectedCountBanner;
