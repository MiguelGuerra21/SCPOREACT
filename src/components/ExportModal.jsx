// src/components/ExportModal.jsx
import React, { useState } from "react";

const ExportModal = ({ layers, onCancel, onConfirm }) => {
  const [idx, setIdx] = useState(0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 3000,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "20px",
          width: "300px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ margin: "0 0 10px" }}>Exportar como Shapefile</h2>
        <label style={{ display: "block", marginBottom: "8px" }}>
          Seleccione una capa:
        </label>
        <select
          style={{
            width: "100%",
            padding: "6px",
            marginBottom: "16px",
            boxSizing: "border-box",
          }}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
        >
          {layers.map((l, i) => (
            <option key={i} value={i}>
              {l.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            style={{
              padding: "6px 12px",
              backgroundColor: "#ccc",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            style={{
              padding: "6px 12px",
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={() => onConfirm(idx)}
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
