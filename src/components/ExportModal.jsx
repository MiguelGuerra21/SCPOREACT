import { useEffect, useState } from "react";
import styles from './ExportModal.module.css';

const sanitizeFilename = (name) => {
  // quitar caracteres problemáticos y limitar longitud
  const s = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')   // caracteres no válidos en nombres de fichero
    .replace(/\s+/g, '_')                    // espacios -> _
    .slice(0, 120);
  return s;
};

const ExportModal = ({ layers = [], onCancel, onConfirm }) => {
  const [idx, setIdx] = useState(0);
  const [filename, setFilename] = useState('');

  // establecer nombre por defecto cuando cambie la capa seleccionada
  useEffect(() => {
    const defaultName = layers[idx]?.name || 'export';
    const sane = sanitizeFilename(defaultName);
    setFilename(`${sane}.zip`);
  }, [idx, layers]);

  const submit = () => {
    const name = String(filename || '').trim();
    if (!name) return;
    // asegurar .zip
    const final = name.toLowerCase().endsWith('.zip') ? name : `${name}.zip`;
    onConfirm(idx, final);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const isExportDisabled = !filename || !String(filename).trim();

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

        <label className={styles.exportModalSelectLabel} style={{ marginTop: 12 }}>Nombre de archivo:</label>
        <input
          className={styles.exportModalInput || ''}
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="nombre-del-export.zip"
          aria-label="Nombre del archivo"
          style={{ width: '100%', boxSizing: 'border-box', padding: '8px', marginTop: 6 }}
        />

        <div className={styles.buttonContainer} style={{ marginTop: 14 }}>
          <button className={styles.cancelButton} onClick={onCancel}>
            Cancelar
          </button>
          <button
            className={styles.exportButton}
            onClick={submit}
            disabled={isExportDisabled}
            aria-disabled={isExportDisabled}
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
