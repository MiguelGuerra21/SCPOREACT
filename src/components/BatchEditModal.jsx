import React, { useState, useEffect, useMemo } from "react";
import { Capacitor } from "@capacitor/core";

export default function BatchEditModal({ layers, onCancel, onApply }) {
  const isAndroid = Capacitor.getPlatform() === "android";

  // 1) Only layers with some selected features:
  const layersWithSel = useMemo(() => {
    return layers
      .map((entry, idx) => ({ entry, idx }))
      .filter(({ entry }) => {
        // Sólo las capas con features seleccionadas...
        const hasSel = (entry.selectedIds || []).length > 0;
        // ...y que sean de tipo polígono
        const isPoly = entry.layer.geometryType === "polygon";
        return hasSel && isPoly;
      });
  }, [layers]);

  // 2) Always‑run hooks:
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSel[0]?.idx ?? 0
  );
  const [selectedField, setSelectedField] = useState("");
  const [dateValue, setDateValue] = useState("");

  // 3) Build list of “Fecha XXX” → label “Etapa XXX”
  const etapas = useMemo(() => {
    if (layersWithSel.length === 0) return [];
    const layer = layersWithSel.find(l => l.idx === selectedLayerIdx).entry.layer;
    return layer.fields
      .map(f => f.name)
      .filter(name => name.toLowerCase().startsWith("fecha "))
      .map(name => {
        const code = name.slice(6); // after "Fecha "
        return { 
          label: `Etapa ${code}`, 
          field: name 
        };
      })
      // sort by whatever numeric part you like:
      .sort((a, b) => (a.label > b.label ? 1 : -1));
  }, [layersWithSel, selectedLayerIdx]);

  // 4) Pick first field by default
  useEffect(() => {
    if (etapas.length && !etapas.find(e => e.field === selectedField)) {
      setSelectedField(etapas[0].field);
    }
  }, [etapas, selectedField]);

  // 5) Pre‑fill dateValue from first selected feature
  useEffect(() => {
    if (!selectedField) return;
    const { entry } = layersWithSel.find(l => l.idx === selectedLayerIdx);
    const oid = entry.selectedIds[0];
    entry.layer
      .queryFeatures({
        where: `OBJECTID = ${oid}`,
        outFields: [selectedField]
      })
      .then(res => {
        const v = res.features[0]?.attributes[selectedField];
        setDateValue(v ? v.toString().slice(0, 10) : "");
      })
      .catch(() => setDateValue(""));
  }, [selectedLayerIdx, selectedField, layersWithSel]);

  // 6) Nothing to do?
  if (layersWithSel.length === 0 || etapas.length === 0) {
    return null;
  }

  // UI styles (same as before)...
  const backdrop = {
    position: "fixed", inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex", justifyContent: "center", alignItems: "center",
    zIndex: 3000
  };
  const modal = {
    width: 400, borderRadius: 8, overflow: "hidden",
    boxShadow: "0 4px 16px rgba(0,0,0,0.2)", backgroundColor: "#fff"
  };
  const header = {
    padding: "12px 16px",
    background: "linear-gradient(90deg, #4facfe, #00f2fe)",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between"
  };
  const title = { margin: 0, fontSize: 18 };
  const closeBtn = { background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" };
  const body = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
  const label = { fontSize: 14, marginBottom: 4, textAlign: "left" };
  const selectStyle = { width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", fontSize: 14 };
  const inputStyle = { ...selectStyle, width: "calc(100% - 16px)" };
  const footer = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 };
  const button = { padding: "8px 16px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 14 };
  const cancelBtn = { ...button, backgroundColor: "#ccc", color: "#333" };
  const applyBtn  = { ...button, backgroundColor: "#28a745", color: "#fff" };

  function handleApply() {
    if (!selectedField || !dateValue) {
      alert("Selecciona una etapa y una fecha.");
      return;
    }
    onApply(
      selectedLayerIdx,
      selectedField,  // e.g. "Fecha ET01"
      dateValue       // "YYYY-MM-DD"
    );
  }

  const current = layersWithSel.find(l => l.idx === selectedLayerIdx);

  return (
    <div style={backdrop}>
      <div style={modal}>
        <div style={header}>
          <h2 style={title}>Editor de Etapas</h2>
          <button style={closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={body}>
          {layersWithSel.length > 1 && (
            <div>
              <div style={label}>
                Capa ({current.entry.selectedIds.length} features):
              </div>
              <select
                style={selectStyle}
                value={selectedLayerIdx}
                onChange={e => setSelectedLayerIdx(Number(e.target.value))}
              >
                {layersWithSel.map(({ entry, idx }) => (
                  <option key={idx} value={idx}>
                    {entry.name} ({entry.selectedIds.length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Etapa dropdown */}
          <div>
            <div style={label}>Etapa a editar:</div>
            <select
              style={selectStyle}
              value={selectedField}
              onChange={e => setSelectedField(e.target.value)}
            >
              {etapas.map(({ label, field }) => (
                <option key={field} value={field}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Date picker */}
          <div>
            <div style={label}>
              Fecha para “{etapas.find(e => e.field === selectedField)?.label}”:
            </div>
            <input
              type="date"
              style={inputStyle}
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
            />
          </div>

          <div style={footer}>
            <button style={cancelBtn} onClick={onCancel}>
              Cancelar
            </button>
            <button
              style={applyBtn}
              onClick={handleApply}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#218838"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#28a745"}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}