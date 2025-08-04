// src/components/TopMenu.jsx
import React, { useRef, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FaBars } from "react-icons/fa";
import LayerPanel from "./LayerPanel";
 
export default function TopMenu({
  menuOpen,
  toggleMenu,
  onOpenFiles,
  onExportSHP,
  onClearMap,
  onCloseApp,
  layers,
  onToggleVisibility,
  onCenterView,
  onRemoveLayer,
  stateColors,
  onToggleStateVisibility
}) {
  const isAndroid = Capacitor.getPlatform() === "android";
  const containerRef = useRef(null);
 
  // new state to show/hide the controls modal
  const [showControls, setShowControls] = useState(false);
 
  // click‐outside to close main menu
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        toggleMenu(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen, toggleMenu]);
 
  const iconButton = {
    position: "absolute",
    top: isAndroid ? 35 : 8,
    left: 16,
    width: 40,
    height: 40,
    backgroundColor: "#fff",
    borderRadius: 8,
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    cursor: "pointer"
  };
 
  const panelStyle = {
    position: "absolute",
    top: (isAndroid ? 35 : 8) + 40 + 8,
    left: 16,
    width: 280,
    backgroundColor: "#fff",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: 1999,
    maxHeight: "80vh",
    overflow: "hidden",
    display: menuOpen ? "block" : "none"
  };
 
  const itemStyle = {
    padding: "12px 16px",
    cursor: "pointer",
    borderBottom: "1px solid #eee",
    transition: "background 0.2s"
  };
 
  const menuItems = [
    { label: "Abrir nuevo…", action: onOpenFiles },
    { label: "Exportar Shapefile…", action: onExportSHP },
    { label: "Mostrar controles", action: () => setShowControls(true) }, // new
    { label: "Limpiar mapa", action: onClearMap },
    ...(!isAndroid ? [{ label: "Cerrar aplicación", action: onCloseApp }] : [])
  ];
 
  return (
    <div ref={containerRef}>
      {/* toggle button */}
      <div style={iconButton} onClick={() => toggleMenu(!menuOpen)}>
        <FaBars size={20} color="#333" />
      </div>
 
      {/* dropdown panel */}
      <div style={panelStyle}>
        {menuItems.map(({ label, action }) => (
          <div
            key={label}
            style={itemStyle}
            onClick={() => { action(); toggleMenu(false); }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {label}
          </div>
        ))}
 
        <div style={{ height: 1, backgroundColor: "#ddd", margin: "4px 0" }} />
 
        <div style={{ padding: "8px" }}>
          <LayerPanel
            layers={layers}
            onToggleVisibility={onToggleVisibility}
            onCenterView={onCenterView}
            onRemoveLayer={onRemoveLayer}
            embedded={true}
            stateColors={stateColors}
            onToggleStateVisibility={onToggleStateVisibility}
          />
        </div>
      </div>
 
      {/* Controls Legend Modal */}
      {showControls && (
        <div style={modalBackdrop}>
          <div style={modalBox}>
            <h3 style={{ marginTop: 0 }}>Leyenda de controles</h3>
            <ul style={{ paddingLeft: 20 }}>
              <li><strong>Desplazar:</strong> Arrastrar el mapa con el ratón</li>
              <li><strong>Zoom:</strong> Rueda del ratón o controles de zoom</li>
              <li><strong>Selección individual:</strong> Ctrl + click sobre un objeto</li>
              <li><strong>Multiselección:</strong> Shift + arrastrar caja sobre objetos</li>
            </ul>
            <button style={closeModalBtn} onClick={() => setShowControls(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
 
// styles for the modal
const modalBackdrop = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 3000
};
 
const modalBox = {
  backgroundColor: "#fff",
  borderRadius: 8,
  padding: 20,
  width: 300,
  boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
};
 
const closeModalBtn = {
  marginTop: 16,
  padding: "8px 16px",
  backgroundColor: "#007AFF",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer"
};