import React, { useState, useEffect, useMemo } from "react";
import { FaTimes } from "react-icons/fa";

export default function BatchEditModal({
  layers,
  onCancel,
  onApply,
  onClearEtapa,
  onClearAllEtapas
}) {
  const [refreshId, setRefreshId] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const layersWithSel = useMemo(() =>
    layers
      .map((entry, idx) => ({ entry, idx }))
      .filter(
        ({ entry }) =>
          entry.selectedIds?.length > 0 &&
          entry.layer.geometryType === "polygon"
      ), [layers]);

  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSel[0]?.idx ?? 0
  );

  const allEtapas = useMemo(() => {
    const lw = layersWithSel.find((l) => l.idx === selectedLayerIdx);
    if (!lw) return [];
    return lw.entry.layer.fields
      .filter((f) => /^Fecha\s+ET\s*\d+$/i.test(f.name))
      .map((f) => {
        const num = parseInt(f.name.match(/\d+$/)[0], 10);
        return {
          dateField: f.name,
          nameField: `Etapa ${String(num).padStart(2, "0")}`,
          num,
          type: f.type
        };
      })
      .sort((a, b) => a.num - b.num);
  }, [layersWithSel, selectedLayerIdx]);

  const [availableEtapas, setAvailableEtapas] = useState([]);

  useEffect(() => {
    const lw = layersWithSel.find((l) => l.idx === selectedLayerIdx);
    if (!lw || allEtapas.length === 0) {
      setAvailableEtapas([]);
      return;
    }
    const { layer, selectedIds } = lw.entry;
    const oid = selectedIds[0];
    const q = layer.createQuery();
    q.where = `${layer.objectIdField} = ${oid}`;
    q.outFields = allEtapas.flatMap((e) => [e.nameField, e.dateField]);
    q.returnGeometry = false;

    layer.queryFeatures(q).then((res) => {
      const attrs = res.features[0]?.attributes || {};
      const newAvail = allEtapas
        .map((e) => {
          const lbl = attrs[e.nameField];
          if (!lbl || String(lbl).trim() === "") return null;
          const hasDate =
            attrs[e.dateField] != null &&
            String(attrs[e.dateField]).trim() !== "";
          return { ...e, label: String(lbl).trim(), hasDate };
        })
        .filter(Boolean);
      setAvailableEtapas(newAvail);
    });
  }, [layersWithSel, selectedLayerIdx, allEtapas, refreshId]);

  // precarga hoy en formato ISO date (AAAA-MM-DD)
const today = new Date().toISOString().slice(0, 10);
const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEtapaField, setSelectedEtapaField] = useState("");

  useEffect(() => {
    const firstUnfilled = availableEtapas.find((e) => !e.hasDate);
    setSelectedEtapaField(
      firstUnfilled?.dateField || availableEtapas[0]?.dateField || ""
    );
  }, [availableEtapas]);

  

  const selNum = parseInt(selectedEtapaField.match(/\d+$/)?.[0] || "", 10);
  const lastFilledNum = useMemo(
    () =>
      availableEtapas
        .filter((e) => e.hasDate)
        .map((e) => e.num)
        .pop() ?? null,
    [availableEtapas]
  );

  if (!layersWithSel.length || !availableEtapas.length) return null;

  // === clear all etapas internas ===
const handleClearAllEtapas = async () => {
  if (!window.confirm("¿Estás seguro de borrar TODAS las fechas de etapa de esta capa?")) return;
  setIsUpdating(true);
  try {
    const lw = layersWithSel.find((l) => l.idx === selectedLayerIdx);
    const { layer, selectedIds } = lw.entry;
    // todos los campos Fecha ETnn
    const dateFields = allEtapas.map(e => e.dateField);
    // preparar updates: asignar null a cada campo
    const updates = selectedIds.map(id => ({
      attributes: dateFields.reduce((acc, f) => {
        acc.OBJECTID = id;
        acc[f] = null;
        return acc;
      }, {})
    }));
    const result = await layer.applyEdits({ updateFeatures: updates });
    const fails = result.updateFeaturesResults?.filter(r => !r.success) || [];
    if (fails.length) window.alert("Algunas fechas no se pudieron borrar");
    setRefreshId(id => id + 1);
  } catch (err) {
    console.error(err);
    window.alert("Error al borrar fechas: " + err.message);
  } finally {
    setIsUpdating(false);
  }
};


 const handleApplyChanges = async () => {
  if (!selectedEtapaField || !selectedDate) {
    window.alert("Selecciona una etapa y una fecha");
    return;
  }

  // 1) Validar que el campo es tipo Date puro
  const etapaInfo = allEtapas.find(e => e.dateField === selectedEtapaField);
  if (!etapaInfo) return;
  if (etapaInfo.type !== "date") {
    window.alert(`El campo ${selectedEtapaField} no es de tipo Date puro`);
    return;
  }

  setIsUpdating(true);
  try {
    const lw = layersWithSel.find(l => l.idx === selectedLayerIdx);
    const { layer, selectedIds } = lw.entry;

    // 2) Etapas a procesar: todas con num ≤ selNum
    const selNum = etapaInfo.num;
    const toUpdate = allEtapas.filter(e => e.num <= selNum);
    const outFields = toUpdate.map(e => e.dateField);

    // 3) Query de todas las entidades seleccionadas para leer sus valores actuales
    const q = layer.createQuery();
    q.where       = `${layer.objectIdField} IN (${selectedIds.join(",")})`;
    q.outFields   = [layer.objectIdField, ...outFields];
    q.returnGeometry = false;
    const { features } = await layer.queryFeatures(q);

    // 4) Convertir selectedDate ("YYYY-MM-DD") a milisegundos
    const dateMS = Date.parse(selectedDate);

    // 5) Construir updates: por cada feature, actualizar:
    //    • selectedEtapaField → dateMS
    //    • cualquier toUpdate previo sin valor → dateMS
    //    • dejar intactas aquellas previas con valor
    const updates = features.map(feat => {
      const attrs = { OBJECTID: feat.attributes[layer.objectIdField] };
      toUpdate.forEach(e => {
        const curVal = feat.attributes[e.dateField];
        const isEmpty = curVal == null || curVal === "" || curVal === 0;
        if (e.dateField === selectedEtapaField || isEmpty) {
          attrs[e.dateField] = dateMS;
        }
      });
      return { attributes: attrs };
    });

    // 6) Aplicar edits
    const result = await layer.applyEdits({ updateFeatures: updates });
    const fails = result.updateFeaturesResults?.filter(r => !r.success) || [];
    if (fails.length) window.alert("Algunos no se actualizaron");

    // 7) Refresca y notifica al padre
    onApply(selectedLayerIdx, selectedEtapaField, selectedDate);
    setRefreshId(id => id + 1);
  }
  catch (err) {
    console.error(err);
    window.alert("Error al aplicar los cambios: " + err.message);
  }
  finally {
    setIsUpdating(false);
    onCancel();
  }
};

  return (
    <div style={backdrop}>
      <div style={modal}>
        <div style={header}>
          <h2 style={title}>Editor de Etapas</h2>
          <button style={closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div style={body}>
          {layersWithSel.length > 1 && (
            <>
              <label style={label}>Capa:</label>
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
            </>
          )}

          <label style={label}>Etapas:</label>
          <div style={listContainer}>
            {availableEtapas.map((e) => (
              <div key={e.dateField} style={{ ...listItem, color: e.hasDate ? "#999" : "#000" }}>
                <label style={listLabel}>
                  <input
                    type="radio"
                    name="etapa"
                    disabled={e.hasDate}
                    checked={selectedEtapaField === e.dateField}
                    onChange={() => setSelectedEtapaField(e.dateField)}
                  />
                  <span style={{ marginLeft: 8 }}>{e.label}</span>
                </label>
                {e.num === lastFilledNum && (
                  <button
                    style={delBtn}
                    onClick={() => {
                      onClearEtapa(selectedLayerIdx, e.dateField);
                      setRefreshId((id) => id + 1);
                    }}
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            ))}
          </div>

          <label style={label}>Fecha a aplicar:</label>
          <div style={inputStyle}>
            <input
              type="date"
              style={selectStyle}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div style={footer}>
            <button style={clearAllBtn} disabled= {isUpdating} onClick={(handleClearAllEtapas)}>
              {isUpdating ? "Borrando..." : "Borrar todas"}
            </button>
            <button style={cancelBtn} onClick={onCancel}>
              Cancelar
            </button>
            <button style={applyBtn} disabled={isUpdating} onClick={handleApplyChanges}>
              {isUpdating ? "Actualizando..." : "Completar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const backdrop     = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 3000 };
const modal        = { width: 420, borderRadius: 8, overflow: "hidden", backgroundColor: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" };
const header       = { padding: "12px 16px", background: "linear-gradient(90deg,#4facfe,#00f2fe)", color: "#fff", display: "flex", justifyContent: "space-between" };
const title        = { margin: 0, fontSize: 18 };
const closeBtn     = { background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" };
const body         = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const inputStyle   = { paddingRight: 16, display: "flex", flexDirection: "column", gap: 12}
const label        = { display: "block", marginBottom: 4 };
const selectStyle  = { width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", fontSize: 14 };
const listContainer= { maxHeight: 180, overflowY: "auto", border: "1px solid #ccc", borderRadius: 4, padding: 8 };
const listItem     = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" };
const listLabel    = { display: "flex", alignItems: "center", cursor: "pointer" };
const delBtn       = { marginLeft: 8, background: "none", border: "none", color: "#c00", cursor: "pointer" };
const clearAllBtn  = { marginRight: 8, padding: "6px 12px", background: "#dc3545", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" };
const footer       = { display: "flex", justifyContent: "flex-end", gap: 8 };
const cancelBtn    = { padding: "8px 16px", background: "#ccc", border: "none", borderRadius: 4 };
const applyBtn     = { padding: "8px 16px", background: "#28a745", color: "#fff", border: "none", borderRadius: 4 };
