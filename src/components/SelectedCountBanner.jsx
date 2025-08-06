// src/components/SelectedCountBanner.jsx
import React, { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FaChevronRight, FaChevronLeft } from "react-icons/fa";
import styles from './SelectedCountBanner.module.css';

const SelectedCountBanner = ({
  count,
  onDeselectAll,
  onBatchEdit,
  hasPolygons,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const isAndroid = Capacitor.getPlatform() === "android";
  if (count === 0) return null;

  return (
    <div className={styles.containerStyle} style={{top: isAndroid ? 100 : 70, width: isOpen ? 200 : 40,}}>
      <div className={styles.headerStyle} style={{justifyContent: isOpen ? "space-between" : "center"}}>
        {isOpen && <span>Seleccionados: {count}</span>}
        <button
          className={styles.toggleBtnStyle}
          onClick={() => setIsOpen((o) => !o)}
          aria-label={isOpen ? "Contraer" : "Expandir"}
        >
          {isOpen ? <FaChevronRight /> : <FaChevronLeft />}
        </button>
      </div>

      <div className={styles.contentStyle} style={{display: isOpen ? "flex" : "none",}}>
        {/* Editar atributos */}
        {hasPolygons && (
          <button
            className={styles.editButtonStyle}
            onClick={onBatchEdit}
            title="Editar atributos"
            onMouseEnter={e => e.currentTarget.style.background = "linear-gradient(180deg, #238636 0%, #1b7b4a 100%)"}
            onMouseLeave={e => e.currentTarget.style.background = "linear-gradient(180deg, #28a745 0%, #1fa85a 100%)"}
          >
            <span className={styles.iconStyle}>✎</span>          
          </button>
        )}
        {/* Deseleccionar todo */}
        <button
          className={styles.deselectButtonStyle}
          onClick={onDeselectAll}
          title="Deseleccionar todo"
          onMouseEnter={(e) => (e.currentTarget.style.background = "#e56b08")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#fd7e14")}
        >
          <span className={styles.iconStyle}>✘</span>
        </button>
      </div>
    </div>
  );
};

export default SelectedCountBanner;
