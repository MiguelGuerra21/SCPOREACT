// src/components/TopMenu.jsx
import React, { useRef, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FaBars } from "react-icons/fa";
import LayerPanel from "./LayerPanel";
import styles from './TopMenu.module.css';
 
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
      <div className ={styles.iconButton} style={{ top: isAndroid ? 35 : 8 }} onClick={() => toggleMenu(!menuOpen)}>
        <FaBars size={20} color="#333" />
      </div>

      {/* dropdown panel */}
      <div className={styles.panelStyle} style={{top: (isAndroid ? 35 : 8) + 40 + 8, display: menuOpen ? "block" : "none"}}>
        {menuItems.map(({ label, action }) => (
          <div
            key={label}
            className={styles.itemStyle}
            onClick={() => { action(); toggleMenu(false); }}
            onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            {label}
          </div>
        ))}
 
        <div className={styles.layerPanelStyle}>
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
        <div className={styles.modalBackdrop}>
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>Leyenda de controles</h3>
            <ul className={styles.modalList}>
              <li><strong>Cargar un shapefile:</strong> Para cargar un shapefile todos sus archivos deben estár agrupados en un zip</li>
              <li><strong>Modo Online/Offline:</strong> El modo online permite el uso de mapa en directo, en offline solo se nos permite la navegación en un canvas blanco</li>
              <li><strong>Desplazar:</strong> Arrastrar el mapa con el ratón</li>
              <li><strong>Zoom:</strong> Rueda del ratón o controles de zoom</li>
              <li><strong>Selección individual:</strong> Ctrl + click sobre un objeto</li>
              <li><strong>Multiselección:</strong> Shift + arrastrar caja sobre objetos</li>
            </ul>
            <button className={styles.closeModalBtn} onClick={() => setShowControls(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
 
