import React, { useState, useEffect, useMemo } from "react";
import { FaTimes } from "react-icons/fa";
import SCPOLogger from "../utils/SCPOLogger";
import styles from './BatchEditModal.module.css';

export default function BatchEditModal({
  layers,
  onCancel,
  onApply,
  onClearEtapa,
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

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedEtapaField, setSelectedEtapaField] = useState("");

  useEffect(() => {
    const firstUnfilled = availableEtapas.find((e) => !e.hasDate);
    setSelectedEtapaField(
      firstUnfilled?.dateField || availableEtapas[0]?.dateField || ""
    );
  }, [availableEtapas]);

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
      const oidField = layer.objectIdField;
      // todos los campos Fecha ETnn
      const dateFields = allEtapas.map(e => e.dateField);

      // preparar updates: asignar null a cada campo
      const updates = selectedIds.map(id => {
        const attrs = { [oidField]: id };
        dateFields.forEach(f => {
          attrs[f] = null;
        });
        attrs.Estado = 'Sin estado';
        return { attributes: attrs };
      });
      const result = await layer.applyEdits({ updateFeatures: updates });
      const fails = result.updateFeaturesResults?.filter(r => !r.success) || [];
      if (fails.length) window.alert("Algunas fechas no se pudieron borrar");

      // ─────────────── LOGGING HERE ───────────────
      SCPOLogger.log({
        timestamp: new Date().toISOString(),
        credentials : 'omit',
        user: "Usuario1",
        action: "Clear all etapas",
        info: `Cleared ${updates.length} features on layer "${lw.entry.name}", ` +
          `fields: [${dateFields.join(", ")}]`
      });
      // ─────────────────────────────────────────────

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
      const selNum = etapaInfo.num;

      // 1. Get all etapas with num <= selNum including their name fields
      const toUpdate = allEtapas.filter(e => e.num <= selNum);

      // 2. Query all needed fields (name fields + date fields)
      const outFields = [
        layer.objectIdField,
        ...toUpdate.map(e => e.dateField),
        ...toUpdate.map(e => e.nameField)
      ];

      const q = layer.createQuery();
      q.where = `${layer.objectIdField} IN (${selectedIds.join(",")})`;
      q.outFields = outFields;
      q.returnGeometry = false;

      const { features } = await layer.queryFeatures(q);
      const dateMS = Date.parse(selectedDate);

      // 3. Build updates with name field check
      const updates = features.map(feat => {
        const oid = feat.attributes[layer.objectIdField];
        const attrs = { [layer.objectIdField]: oid };

        toUpdate.forEach(e => {
          const dateValue = feat.attributes[e.dateField];
          const nameValue = feat.attributes[e.nameField];
          const isEmptyDate = !dateValue || dateValue === "" || dateValue === 0;
          const isEmptyName = !nameValue || nameValue === "" || nameValue === 0;

          // Skip if name is empty
          if (isEmptyName) return;

          // Update if:
          // - It's the target etapa, OR
          // - It's a previous etapa with empty date
          if (e.num === selNum || (e.num < selNum && isEmptyDate)) {
            attrs[e.dateField] = dateMS;
          }
        });

        return { attributes: attrs };
      });

      // Filter out updates with no changes
      const validUpdates = updates.filter(u => Object.keys(u.attributes).length > 1);

      if (validUpdates.length === 0) {
        window.alert("Nada que actualizar");
        return;
      }

      const result = await layer.applyEdits({ updateFeatures: validUpdates });
      const fails = result.updateFeaturesResults?.filter(r => !r.success) || [];
      if (fails.length) window.alert("Algunos no se actualizaron");

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
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Editor de Etapas</h2>
          <button className={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>
        <div className={styles.body}>
          {layersWithSel.length > 1 && (
            <>
              <label className={styles.label}>Capa:</label>
              <select
                className={styles.selectStyle}
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

          <label className={styles.label}>Etapas:</label>
          <div className={styles.listContainer}>
            {availableEtapas.map((e) => (
              <div key={e.dateField} className={`${styles.listItem} ${e.hasDate ? styles.filled : ""}`}>
                <label className={styles.listLabel}>
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
                    className={styles.delBtn}
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

          <label className={styles.label}>Fecha a aplicar:</label>
          <div className={styles.inputStyle}>
            <input
              type="date"
              className={styles.selectStyle}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div className={styles.footer}>
            <button className={styles.clearAllBtn} disabled={isUpdating} onClick={(handleClearAllEtapas)}>
              {isUpdating ? "Borrando..." : "Borrar todas"}
            </button>
            <button className={styles.cancelBtn} onClick={onCancel}>
              Cancelar
            </button>
            <button className={styles.applyBtn} disabled={isUpdating} onClick={handleApplyChanges}>
              {isUpdating ? "Actualizando..." : "Completar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

