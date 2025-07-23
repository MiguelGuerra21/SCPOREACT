// BatchEditModal.jsx
import { useState, useEffect, useMemo } from "react";

export default function BatchEditModal({ layers, onCancel, onApply }) {

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
    const lw = layersWithSel.find(l => l.idx === selectedLayerIdx);
    if (!lw) return [];
    return lw.entry.layer.fields
      .map(f => f.name)
      .filter(name => /^Fecha\s+ET\s*\d+$/i.test(name))
      .map(name => {
        const num = parseInt(name.match(/\d+$/)[0], 10);
        const etapaField = `Etapa ${String(num).padStart(2, "0")}`; // <-- CAMBIO
        return {
          field: name,      // p.ej. "Fecha ET03"
          num,              // 3
          etapaField,       // "Etapa 03"
          label: `Etapa ${num}`
        };
      })
      .sort((a, b) => a.num - b.num);
  }, [layersWithSel, selectedLayerIdx]);

  // 4) Filtrar sólo las etapas cuyo nombre real no esté vacío
  useEffect(() => {
    const lw = layersWithSel.find(l => l.idx === selectedLayerIdx);
    if (!lw || !allEtapas.length) {
      setAvailableEtapas([]);
      return;
    }
    const { entry } = lw;
    const oid0 = entry.selectedIds[0];

    // **Usamos ahora etapaField** para el outFields:
    const nameFields = allEtapas.map(e => e.etapaField);

    const q = entry.layer.createQuery();
    q.where = `${entry.layer.objectIdField} = ${oid0}`;
    q.outFields = nameFields;

    entry.layer.queryFeatures(q)
      .then(res => {
        const attrs = res.features[0]?.attributes || {};
        // filtrado: sólo los que efectivamente tienen nombre
        const valid = allEtapas.filter(e => {
          const val = attrs[e.etapaField];      // <-- CAMBIO
          return val != null && String(val).trim() !== "";
        });
        setAvailableEtapas(valid.length ? valid : allEtapas);
        setSelectedField(valid[0]?.field || allEtapas[0]?.field || "");
      })
      .catch(() => {
        setAvailableEtapas(allEtapas);
        setSelectedField(allEtapas[0]?.field || "");
      });
  }, [layersWithSel, selectedLayerIdx, allEtapas]);

  // 5) Pre‑llenar la primera fecha
  useEffect(() => {
    if (!selectedField) return;
    const lw = layersWithSel.find(l => l.idx === selectedLayerIdx);
    if (!lw) return;
    const { entry } = lw;
    const oid0 = entry.selectedIds[0];
    entry.layer.queryFeatures({
      where: `OBJECTID = ${oid0}`,
      outFields: [selectedField]
    })
      .then(res => {
        let raw = res.features[0]?.attributes[selectedField];
        let formatted = "";
        if (raw != null) {
          if (typeof raw === "number") {
            const d = new Date(raw);
            if (!isNaN(d)) formatted = d.toISOString().slice(0, 10);
          } else {
            const d = new Date(raw);
            formatted = !isNaN(d) ? d.toISOString().slice(0, 10) : String(raw).slice(0, 10);
          }
        }
        setDateValue(formatted);
      })
      .catch(() => setDateValue(""));
  }, [selectedField, selectedLayerIdx, layersWithSel]);

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
            if (!isNaN(d)) formatted = d.toISOString().slice(0, 10);
          }
          // si es string
          else if (typeof raw === "string") {
            const d = new Date(raw);
            formatted = !isNaN(d) ? d.toISOString().slice(0, 10) : raw.slice(0, 10);
          }
        }
        setDateValue(formatted);
      })
      .catch(() => setDateValue(""));
  }, [selectedLayerIdx, selectedField, layersWithSel]);

  // 7) Si no hay nada que mostrar
  if (!layersWithSel.length || !allEtapas.length) return null;

  // 8) Estilos
  const fieldGroupStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 4,               // espacio entre label y control
    marginBottom: 12      // espacio entre grupos de campos
  };
  const labelStyle = {
    fontSize: 14,
    margin: 0,
    marginBottom: 4,
    textAlign: "left"
  };
  const controlStyle = {
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #ccc",
    boxSizing: "border-box"
  };

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
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Etapa a editar:</label>
            <select
              style={controlStyle}
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
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>
              Fecha para “{availableEtapas.find(e => e.field === selectedField)?.label}”:
            </label>
            <input
              type="date"
              style={controlStyle}
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
