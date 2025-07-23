// src/components/TopMenu.jsx
import React, { useRef, useEffect } from "react";
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
  stateColors
}) {
  const isAndroid = Capacitor.getPlatform() === "android";
  const containerRef = useRef(null);

  // click‐outside to close
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

  // styles
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
    top: (isAndroid ? 35 : 8) + 40 + 8, // below the icon + margin
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

  const menuItems = [
    { label: "Abrir nuevo…", action: onOpenFiles },
    { label: "Exportar Shapefile…", action: onExportSHP },
    { label: "Limpiar mapa", action: onClearMap },
    ...(!isAndroid ? [{ label: "Cerrar aplicación", action: onCloseApp }] : [])
  ];

  const itemStyle = {
    padding: "12px 16px",
    cursor: "pointer",
    borderBottom: "1px solid #eee",
    transition: "background 0.2s"
  };
  
  return (
    <div ref={containerRef}>
      {/* Small square toggle button */}
      <div style={iconButton} onClick={() => toggleMenu(!menuOpen)}>
        <FaBars size={20} color="#333" />
      </div>

      {/* Expanded panel */}
      <div style={panelStyle}>
        {/* Menu Items */}
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

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "#ddd", margin: "4px 0" }} />

        {/* LayerPanel */}
        <div style={{ padding: "8px" }}>
          <LayerPanel
            layers={layers}
            onToggleVisibility={onToggleVisibility}
            onCenterView={onCenterView}
            onRemoveLayer={onRemoveLayer}
            embedded={true} 
            stateColors={stateColors}
          />
        </div>

      </div>
    </div>
  );
}
