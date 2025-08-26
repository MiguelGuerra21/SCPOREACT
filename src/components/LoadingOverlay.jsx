import styles from './LoadingOverlay.module.css';

const LoadingOverlay = ({ progress, progressCurrent, progressTotal, layerIndex, layerTotal, message, mode = "load" }) => {
  return (
    <div className={styles.loadContainer}>
      <div className={styles.progressMessage}>
        {message}
        {mode === "load" && progress !== undefined && progress > 0 ? ` – ${progress.toFixed(1)}%` : ""}
        {mode === "load" && layerTotal > 0 && (
          <div className={styles.progressText}>
            {`Capa ${layerIndex} de ${layerTotal}`}
          </div>
        )}

      </div>
      <div className={styles.spinnerStyle} style={{animation: "spin 1s linear infinite"}}></div>
      {mode === "load" && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{width: `${progress}%`,}}/>
        </div>
      )}
      {/* Texto con número de features */}
      {mode === "load" && typeof progressCurrent === "number" && typeof progressTotal === "number" && (
        <div className={styles.featureText}>
          {progressCurrent.toLocaleString()} de {progressTotal.toLocaleString()} features cargados
        </div>
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingOverlay;
