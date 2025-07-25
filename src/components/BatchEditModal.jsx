import React, { useState, useEffect, useMemo } from "react";
import { FaTimes } from "react-icons/fa";

export default function BatchEditModal({
  layers,
  onCancel,
  onApply,
  onClearEtapa
}) {

  const [refreshId, setRefreshId] = useState(0);

  // ─── Hooks │ must all come before any return ───────────────────────────────

  // 1) polygonal layers with a selection
  const layersWithSel = useMemo(() => {
    return layers
      .map((entry, idx) => ({ entry, idx }))
      .filter(
        ({ entry }) =>
          entry.selectedIds?.length > 0 &&
          entry.layer.geometryType === "polygon"
      );
  }, [layers]);

  // 2) which layer is active
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSel[0]?.idx ?? 0
  );
  const [selectedField, setSelectedField] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [availableEtapas, setAvailableEtapas] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);

  // 3) find all Fecha ETnn → num + name field
  const allEtapas = useMemo(() => {
    const lw = layersWithSel.find((l) => l.idx === selectedLayerIdx);
    if (!lw) return [];
    return lw.entry.layer.fields
      .map((f) => f.name)
      .filter((n) => /^Fecha\s+ET\s*\d+$/i.test(n))
      .map((dateField) => {
        const num = parseInt(dateField.match(/\d+$/)[0], 10);
        return {
          dateField,
          nameField: `Etapa ${String(num).padStart(2, "0")}`,
          num
        };
      })
      .sort((a, b) => a.num - b.num);
  }, [layersWithSel, selectedLayerIdx]);

  // 4) load the attributes of the first selected feature
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

    layer
      .queryFeatures(q)
      .then((res) => {
        const attrs = res.features[0]?.attributes || {};
        setAvailableEtapas(
          allEtapas
            .map((e) => {
              const lbl = attrs[e.nameField];
              if (!lbl || String(lbl).trim() === "") return null;
              return {
                ...e,
                label: String(lbl).trim(),
                hasDate:
                  attrs[e.dateField] != null &&
                  String(attrs[e.dateField]).trim() !== ""
              };
            })
            .filter(Boolean)
        );
      })
      .catch(() => {
        setAvailableEtapas([]);
      });
  }, [
    layersWithSel,
    selectedLayerIdx,
    allEtapas,
    refreshId
  ]);


  // 5) decide which etapa is selected by default
  const [selectedEtapaField, setSelectedEtapaField] = useState("");
  useEffect(() => {
    const firstUnfilled = availableEtapas.find((e) => !e.hasDate);
    setSelectedEtapaField(
      firstUnfilled?.dateField || availableEtapas[0]?.dateField || ""
    );
  }, [availableEtapas]);

  // 6) find the number of the last filled etapa
  const lastFilledNum = useMemo(
    () =>
      availableEtapas
        .filter((e) => e.hasDate)
        .map((e) => e.num)
        .pop() ?? null,
    [availableEtapas]
  );

  // ─── Early return if nothing to show ──────────────────────────────────────
  if (!layersWithSel.length || !availableEtapas.length) {
    return null;
  }

  // ─── Event handlers & derived values ──────────────────────────────────────

  // parse the selected etapa’s number
  const selNum = parseInt(
    selectedEtapaField.match(/\d+$/)?.[0] ?? "",
    10
  );
  // find the **previous** etapa in the list
  const prevEtapa = availableEtapas.find((e) => e.num === selNum - 1);

  // === Función para manejar la aplicación de cambios ===
  const handleApplyChanges = async () => {
    if (!selectedField || !dateValue) return;
    
    setIsUpdating(true);
    
    try {
      const layerObj = layersWithSel.find(l => l.idx === selectedLayerIdx);
      if (!layerObj) return;
        
      const { entry } = layerObj;
      const { selectedIds, layer } = entry;
        
      // 1. Actualizar las fechas en las features seleccionadas
      const updates = selectedIds.map(id => ({
        attributes: {
          OBJECTID: id,
          [selectedField]: new Date(dateValue).toISOString()
        }
      }));
        
      // Aplicar las actualizaciones de fecha
      await layer.applyEdits({
        updateFeatures: updates
      });
        
      // 2. Recalcular y actualizar los estados
      const stateUpdates = [];
        
      for (const featureId of selectedIds) {
        try {
          // Obtener la feature actualizada
          const query = layer.createQuery();
          query.objectIds = [featureId];
          const { features } = await layer.queryFeatures(query);
                
          if (features.length) {
            const feature = features[0];
            const props = feature.attributes;
                    
            // Encontrar la etapa correspondiente
            const etapa = allEtapas.find(e => e.field === selectedField);
            if (!etapa) continue;
                    
            // Determinar el nuevo estado
            const newState = props[etapa.etapaField] || "Sin estado";
                    
            if (props.Estado !== newState) {
              stateUpdates.push({
                featureId,
                newState
                });
            }
          }
        } catch (error) {
          console.error(`Error processing feature ${featureId}:`, error);
        }
      }
        
      // Aplicar actualizaciones de estado en lote si hay cambios
      if (stateUpdates.length > 0) {
        await entry.batchUpdateFeatureStates(stateUpdates);
      }
        
      // Notificar al componente padre
      onApply(selectedLayerIdx, selectedField, dateValue);
        
    } catch (error) {
      console.error("Error applying batch edits:", error);
      alert("Error al aplicar los cambios: " + (error.message || "Error desconocido"));
    } finally {
      setIsUpdating(false);
    }
  };

  // 7) Si no hay nada que mostrar
  if (!layersWithSel.length || !allEtapas.length) return null;
  // when “Aplicar Hoy” is clicked, stamp current datetime
  const handleApplyToday = () => {
    const nowIso = new Date().toISOString();
    onApply(selectedLayerIdx, selectedEtapaField, nowIso);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
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
              <label style={label}>Capa:</label>
              <select
                style={selectStyle}
                value={selectedLayerIdx}
                onChange={(e) => {
                  setSelectedLayerIdx(Number(e.target.value));
                  setSelectedEtapaField("");
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

          <div>
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
                      onChange={() => !e.hasDate && setSelectedEtapaField(e.dateField)}
                    />
                    <span style={{ marginLeft: 8 }}>{e.label}</span>
                  </label>
                  {/* only the last filled gets a delete button */}
                  {e.num === lastFilledNum && (
                    <button
                      style={delBtn}
                      title={`Eliminar fecha de ${e.label}`}
                      onClick={() => {
                        try {
                          if (!e.hasDate) throw new Error("Nada que eliminar");
                          onClearEtapa(selectedLayerIdx, e.dateField);
                          setRefreshId(id => id + 1);    // ← bump the counter
                        } catch (err) {
                          window.alert("No se pudo eliminar: " + err.message);
                        }
                      }}
                    >
                      <FaTimes />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={footer}>
            <button style={cancelBtn} onClick={onCancel}>Cancelar</button>
            <button style={applyBtn} onClick={handleApplyToday}>Completar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const backdrop = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 3000
};
const modal = {
  width: 420,
  borderRadius: 8,
  overflow: "hidden",
  backgroundColor: "#fff",
  boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
};
const header = {
  padding: "12px 16px",
  background: "linear-gradient(90deg,#4facfe,#00f2fe)",
  color: "#fff",
  display: "flex",
  justifyContent: "space-between"
};
const title = { margin: 0, fontSize: 18 };
const closeBtn = {
  background: "none",
  border: "none",
  color: "#fff",
  fontSize: 20,
  cursor: "pointer"
};
const body = { padding: 16, display: "flex", flexDirection: "column", gap: 12 };
const label = { display: "block", marginBottom: 4 };
const selectStyle = {
  width: "100%",
  padding: 8,
  borderRadius: 4,
  border: "1px solid #ccc",
  fontSize: 14
};
const listContainer = {
  maxHeight: 180,
  overflowY: "auto",
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: 8
};
const listItem = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 0"
};
const listLabel = { display: "flex", alignItems: "center", cursor: "pointer" };
const delBtn = {
  marginLeft: 8,
  background: "none",
  border: "none",
  color: "#c00",
  cursor: "pointer"
};
const footer = { display: "flex", justifyContent: "flex-end", gap: 8 };
const cancelBtn = {
  padding: "8px 16px",
  background: "#ccc",
  border: "none",
  borderRadius: 4
};
const applyBtn = {
  padding: "8px 16px",
  background: "#28a745",
  color: "#fff",
  border: "none",
  borderRadius: 4
};
