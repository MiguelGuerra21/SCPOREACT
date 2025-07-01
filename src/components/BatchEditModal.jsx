// src/components/BatchEditModal.jsx
import React, { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const BatchEditModal = ({ layers, onCancel, onApply }) => {
  const isAndroid = Capacitor.getPlatform() === "android";

  // 1) Gather only layers with selected features
  const layersWithSel = layers
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => entry.selectedIds?.length > 0);

  // 2) State
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSel[0]?.idx ?? null
  );
  const [fields, setFields] = useState([]);
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");

  // 3) Populate fields when layer changes
  useEffect(() => {
    if (selectedLayerIdx == null) return;
    const entry = layers[selectedLayerIdx];
    const objectIdField = entry.layer.objectIdField;
    // TODO: later restrict which fields are editable here
    const editable = entry.layer.fields.filter(
      (f) => f.name !== objectIdField
    );
    setFields(editable);
    setFieldName(editable[0]?.name || "");
    setValue("");
  }, [selectedLayerIdx, layers]);

  // 4) If nothing selected, render nothing
  if (layersWithSel.length === 0) return null;

  const currentEntry = layers[selectedLayerIdx];
  const selectedCount = currentEntry.selectedIds.length;

  // Styles
  const backdrop = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3000,
  };
  const modal = {
    width: 400,
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    backgroundColor: "#fff",
  };
  const header = {
    padding: "12px 16px",
    background: "linear-gradient(90deg, #4facfe, #00f2fe)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };
  const title = { margin: 0, fontSize: 18 };
  const closeBtn = {
    background: "none",
    border: "none",
    color: "#fff",
    fontSize: 20,
    cursor: "pointer",
  };
  const body = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
  const label = { fontSize: 14, marginBottom: 4 , textAlign: "left" };
  const selectStyle = {
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #ccc",
    fontSize: 14,
  };
  const inputStyle = { ...selectStyle , width: "calc(100% - 16px)", padding: "8px 8px" };
  const footer = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 };
  const button = {
    padding: "8px 16px",
    borderRadius: 4,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
  };
  const cancelBtn = { ...button, backgroundColor: "#ccc", color: "#333" };
  const applyBtn = { ...button, backgroundColor: "#28a745", color: "#fff" };

  const handleApply = () => {
    if (!fieldName) {
      alert("Selecciona un campo.");
      return;
    }
    onApply(selectedLayerIdx, fieldName, value);
  };

  return (
    <div style={backdrop}>
      <div style={modal}>
        <div style={header}>
          <h2 style={title}>Edición en lote</h2>
          <button style={closeBtn} onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div style={body}>
          {layersWithSel.length > 1 && (
            <div>
              <div style={label}>Capa ({selectedCount}):</div>
              <select
                style={selectStyle}
                value={selectedLayerIdx}
                onChange={(e) => setSelectedLayerIdx(Number(e.target.value))}
              >
                {layersWithSel.map(({ entry, idx }) => (
                  <option key={idx} value={idx}>
                    {entry.name} ({entry.selectedIds.length})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div style={label}>Campo a editar:</div>
            <select
              style={selectStyle}
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
            >
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.alias || f.name} ({f.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={label}>Nuevo valor:</div>
            {(() => {
              const def = fields.find((f) => f.name === fieldName);
              if (!def) return null;
              switch (def.type) {
                case "integer":
                case "small-integer":
                  return (
                    <input
                      type="number"
                      step="1"
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  );
                case "double":
                  return (
                    <input
                      type="number"
                      step="any"
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  );
                case "date":
                  return (
                    <input
                      type="date"
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  );
                case "boolean":
                  return (
                    <select
                      style={selectStyle}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    >
                      <option value="">(nulo)</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  );
                default:
                  return (
                    <input
                      type="text"
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  );
              }
            })()}
          </div>

          <div style={footer}>
            <button style={cancelBtn} onClick={onCancel}>
              Cancelar
            </button>
            <button
              style={applyBtn}
              onClick={handleApply}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#218838")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#28a745")
              }
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchEditModal;
