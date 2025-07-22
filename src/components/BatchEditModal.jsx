// BatchEditModal.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Capacitor } from "@capacitor/core";

export default function BatchEditModal({ layers, onCancel, onApply }) {
  const isAndroid = Capacitor.getPlatform() === "android";

  // 1) Sólo capas poligonales con selección
  const layersWithSel = useMemo(() => {
    return layers
      .map((entry, idx) => ({ entry, idx }))
      .filter(({ entry }) => {
        const hasSel = (entry.selectedIds || []).length > 0;
        const isPoly = entry.layer.geometryType === "polygon";
        return hasSel && isPoly;
      });
  }, [layers]);

  // 2) Estado interno
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSel[0]?.idx ?? 0
  );
  const [selectedField, setSelectedField] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [availableEtapas, setAvailableEtapas] = useState([]);

  // 3) Todas las "Fecha ETnn" → { field, etapaNum, label }
  const allEtapas = useMemo(() => {
    if (!layersWithSel.length) return [];
    const layer = layersWithSel.find(l => l.idx === selectedLayerIdx).entry.layer;
    return layer.fields
      .map(f => f.name)
      .filter(name => /^fecha\s+et\s*\d+/i.test(name))
      .map(name => {
        const m = name.match(/\d+$/);
        const num = m ? parseInt(m[0], 10) : NaN;
        return {
          field: name,
          etapaNum: isNaN(num) ? null : num,
          label: isNaN(num) ? name : `Etapa ${num}`
        };
      })
      .filter(e => e.etapaNum !== null)
      .sort((a, b) => a.etapaNum - b.etapaNum);
  }, [layersWithSel, selectedLayerIdx]);

  // 4) Cuando cambie capa o allEtapas, recalculemos availableEtapas
  useEffect(() => {
    const layerObj = layersWithSel.find(l => l.idx === selectedLayerIdx);
    if (!layerObj || !allEtapas.length) {
      setAvailableEtapas([]);
      setSelectedField("");
      return;
    }
    const { entry } = layerObj;
    const oid0 = entry.selectedIds[0];
    // Construimos outFields: ["Etapa 1", "Etapa 2", ...]
    const nameFields = allEtapas.map(e => e.label);
    const nameFieldNames = allEtapas.map(e => `Etapa ${e.etapaNum.toString().padStart(2, "0")}`);
    const q = entry.layer.createQuery();
    q.where = `${entry.layer.objectIdField} = ${oid0}`;
    q.outFields = nameFieldNames;

    entry.layer.queryFeatures(q)
      .then(res => {
        const attrs = res.features[0]?.attributes || {};
        const filtered = allEtapas.filter(e => {
          const nameField = `Etapa ${e.etapaNum.toString().padStart(2, "0")}`;
          const value = attrs[nameField];
          return value != null && String(value).trim() !== "";
        });
        // si no hay ninguna, caemos en todas
        const valid = filtered.length ? filtered : allEtapas;
        setAvailableEtapas(valid);
        // reset selectedField si ya no existe
        if (!valid.find(e => e.field === selectedField)) {
          setSelectedField(valid[0]?.field || "");
        }
      })
      .catch(() => {
        setAvailableEtapas(allEtapas);
        setSelectedField(allEtapas[0]?.field || "");
      });
  }, [selectedLayerIdx, allEtapas, layersWithSel, selectedField]);

  // 5) Al cambiar availableEtapas por primera vez
  useEffect(() => {
    if (!selectedField && availableEtapas.length) {
      setSelectedField(availableEtapas[0].field);
    }
  }, [availableEtapas, selectedField]);

  // 6) Pre‑llenado de dateValue
  useEffect(() => {
    if (!selectedField) return;
    const layerObj = layersWithSel.find(l => l.idx === selectedLayerIdx);
    if (!layerObj) return;
    const { entry } = layerObj;
    const oid = entry.selectedIds[0];
    entry.layer.queryFeatures({
      where: `OBJECTID = ${oid}`,
      outFields: [selectedField]
    })
      .then(res => {
        const raw = res.features[0]?.attributes[selectedField];
        let formatted = "";
        if (raw != null) {
          // si es número, lo tratamos como epoch
          if (typeof raw === "number") {
            const d = new Date(raw);
            if (!isNaN(d)) formatted = d.toISOString().slice(0,10);
          }
          // si es string
          else if (typeof raw === "string") {
            const d = new Date(raw);
            formatted = !isNaN(d) ? d.toISOString().slice(0,10) : raw.slice(0,10);
          }
        }
        setDateValue(formatted);
      })
      .catch(() => setDateValue(""));
  }, [selectedLayerIdx, selectedField, layersWithSel]);

  // 7) Si no hay nada que mostrar
  if (!layersWithSel.length || !allEtapas.length) return null;

  // === JSX ===
  return (
    <div style={{
      position: "fixed", inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "center",
      zIndex: 3000
    }}>
      <div style={{
        width: 400, borderRadius: 8, overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)", backgroundColor: "#fff"
      }}>
        <div style={{
          padding: "12px 16px",
          background: "linear-gradient(90deg, #4facfe, #00f2fe)",
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Editor de Etapas</h2>
          <button
            style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}
            onClick={onCancel}
          >✕</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Selector de capa */}
          {layersWithSel.length > 1 && (
            <div>
              <label style={{ display: "block", marginBottom: 4 }}>Capa:</label>
              <select
                style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
                value={selectedLayerIdx}
                onChange={e => {
                  setSelectedLayerIdx(Number(e.target.value));
                  setSelectedField("");
                  setDateValue("");
                }}
              >
                {layersWithSel.map(({ entry, idx }) => (
                  <option key={idx} value={idx}>
                    {entry.name} ({entry.selectedIds.length})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selector de etapa */}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>Etapa a editar:</label>
            <select
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              value={selectedField}
              onChange={e => setSelectedField(e.target.value)}
            >
              {availableEtapas.map(e => (
                <option key={e.field} value={e.field}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de fecha */}
          <div>
            <label style={{ display: "block", marginBottom: 4 }}>
              Fecha para “{availableEtapas.find(e => e.field === selectedField)?.label}”:
            </label>
            <input
              type="date"
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc" }}
              value={dateValue}
              onChange={e => setDateValue(e.target.value)}
            />
          </div>

          {/* Botones */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              style={{ padding: "8px 16px", backgroundColor: "#ccc", border: "none", borderRadius: 4, cursor: "pointer" }}
              onClick={onCancel}
            >Cancelar</button>
            <button
              style={{ padding: "8px 16px", backgroundColor: "#28a745", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
              onClick={() => onApply(selectedLayerIdx, selectedField, dateValue)}
            >Aplicar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
