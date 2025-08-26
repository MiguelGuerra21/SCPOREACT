import { useState } from "react";
import styles from './ExportModal.module.css';

const ExportModal = ({ layers, onCancel, onConfirm }) => {
  const [idx, setIdx] = useState(0);

  return (
    <div className={styles.backdropStyle}>
      <div className={styles.exportModal}>
        <h2 className={styles.exportModalTitle}>Exportar como Shapefile</h2>
        <label className={styles.exportModalSelectLabel}>Seleccione una capa:</label>
        <select
          className={styles.exportModalSelect}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
        >
          {layers.map((l, i) => (
            <option key={i} value={i}>
              {l.name}
            </option>
          ))}
        </select>
        <div className={styles.buttonContainer}>
          <button className={styles.cancelButton} onClick={onCancel}>
            Cancelar
          </button>
          <button className={styles.exportButton} onClick={() => onConfirm(idx)}>
            Exportar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
