// src/components/BatchEditModal.jsx
import React, { useState, useEffect } from "react";

/**
 * BatchEditModal:
 *   - layers: array de entradas de capa, cada entrada tiene:
 *       { id, name, layer (FeatureLayer), layerView, selectedIds: [...OBJECTID], ... }
 *   - onCancel: callback para cerrar el modal sin aplicar cambios
 *   - onApply: callback cuando el usuario confirma la edición en lote. 
 *       Se le pasa (layerIndex, fieldName, newValueRaw).
 */
const BatchEditModal = ({ layers, onCancel, onApply }) => {
  // Filtramos las capas que tienen features seleccionadas
  const layersWithSelection = layers
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => Array.isArray(entry.selectedIds) && entry.selectedIds.length > 0);

  // Estado local:
  const [selectedLayerIdx, setSelectedLayerIdx] = useState(
    layersWithSelection.length > 0 ? layersWithSelection[0].idx : null
  );
  const [fieldList, setFieldList] = useState([]); // lista de campos del layer seleccionado
  const [selectedField, setSelectedField] = useState("");
  const [inputValue, setInputValue] = useState("");

  // Cuando cambie selectedLayerIdx, actualizamos el listado de campos
  useEffect(() => {
    if (selectedLayerIdx == null) {
      setFieldList([]);
      setSelectedField("");
      return;
    }
    const entry = layers[selectedLayerIdx];
    if (!entry || !entry.layer) {
      setFieldList([]);
      setSelectedField("");
      return;
    }
    // Obtener fields de FeatureLayer
    // entry.layer.fields es un array de objetos FieldDefinition
    // Filtramos campos no editables: omitimos OBJECTID y campos sin editable?
    const allFields = entry.layer.fields || [];
    // Suponemos que OBJECTID es entry.layer.objectIdField; lo omitimos
    const objectIdField = entry.layer.objectIdField;
    const editableFields = allFields.filter((f) => f.name !== objectIdField);
    setFieldList(editableFields);
    if (editableFields.length > 0) {
      setSelectedField(editableFields[0].name);
    } else {
      setSelectedField("");
    }
    setInputValue("");
  }, [selectedLayerIdx, layers]);

  // Si no hay capas con selección, no mostramos modal
  if (layersWithSelection.length === 0) {
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
            textAlign: "center",
          }}
        >
          <p>No hay features seleccionadas en ninguna capa.</p>
          <button
            style={{
              padding: "6px 12px",
              backgroundColor: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={onCancel}
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // Conteo total seleccionado en la capa actual
  const currentEntry = layers[selectedLayerIdx];
  const selectedCount = Array.isArray(currentEntry.selectedIds)
    ? currentEntry.selectedIds.length
    : 0;

  // Handler de Apply: llama onApply con layerIndex, fieldName y valor raw
  const handleApply = () => {
    if (!selectedField) {
      window.alert("Selecciona un campo para editar.");
      return;
    }
    if (inputValue == null || inputValue === "") {
      // Podríamos permitir valor null? Aquí requerimos no vacío
      const confirmado = window.confirm(
        "El valor está vacío; se establecerá como null. ¿Continuar?"
      );
      if (!confirmado) return;
    }
    onApply(selectedLayerIdx, selectedField, inputValue);
  };

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
          width: "320px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ margin: "0 0 10px" }}>Edición en lote</h2>

        {/* Selector de capa si hay más de una con selección */}
        {layersWithSelection.length > 1 && (
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px" }}>
              Capa:
            </label>
            <select
              style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
              value={selectedLayerIdx}
              onChange={(e) => setSelectedLayerIdx(Number(e.target.value))}
            >
              {layersWithSelection.map(({ entry, idx }) => (
                <option key={idx} value={idx}>
                  {entry.name} ({entry.selectedIds.length})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mostrar conteo de seleccionados para la capa actual */}
        <p style={{ margin: "0 0 12px" }}>
          {`Features seleccionadas: ${selectedCount}`}
        </p>

        {/* Selector de campo */}
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px" }}>
            Campo a editar:
          </label>
          <select
            style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
            value={selectedField}
            onChange={(e) => setSelectedField(e.target.value)}
          >
            {fieldList.map((f) => (
              <option key={f.name} value={f.name}>
                {f.alias || f.name} ({f.type})
              </option>
            ))}
          </select>
        </div>

        {/* Input dinámico según tipo de campo */}
        {selectedField && (() => {
          // Obtener definición del campo
          const fieldDef = currentEntry.layer.fields.find(
            (f) => f.name === selectedField
          );
          if (!fieldDef) return null;
          // Dependiendo de fieldDef.type, elegimos input
          switch (fieldDef.type) {
            case "integer":
            case "small-integer":
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor (entero):
                  </label>
                  <input
                    type="number"
                    step="1"
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              );
            case "double":
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor (decimal):
                  </label>
                  <input
                    type="number"
                    step="any"
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              );
            case "date":
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor (fecha):
                  </label>
                  <input
                    type="date"
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              );
            case "string":
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor (texto):
                  </label>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              );
            case "boolean":
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor (booleano):
                  </label>
                  <select
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  >
                    <option value="">-- seleccionar --</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
              );
            default:
              // Otros tipos: tratamos como texto
              return (
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px" }}>
                    Nuevo valor:
                  </label>
                  <input
                    type="text"
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                </div>
              );
          }
        })()}

        {/* Botones */}
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
            onClick={handleApply}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchEditModal;
