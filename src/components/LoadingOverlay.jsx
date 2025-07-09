import React from "react";

const LoadingOverlay = ({ progress, progressCurrent, progressTotal, layerIndex, layerTotal }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(255,255,255,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2000,
        flexDirection: "column",
      }}
    >
      <div
        style={{
          marginBottom: "10px",
          fontSize: "16px",
          fontWeight: "bold",
          color: "#333",
        }}
      >
        {typeof layerIndex === "number" && typeof layerTotal === "number"
          ? `Cargando capas ${layerIndex}/${layerTotal}`
          : "Cargando capas"}
        {progress !== undefined ? ` – ${progress.toFixed(1)}%` : ""}
      </div>
      <div
        style={{
          border: "4px solid #f3f3f3",
          borderTop: "4px solid #3498db",
          borderRadius: "50%",
          width: "40px",
          height: "40px",
          animation: "spin 1s linear infinite",
          marginBottom: "10px",
        }}
      ></div>
      <div
        style={{
        width: "200px",
        height: "12px",
        backgroundColor: "#e0e0e0",
        borderRadius: "6px",
        overflow: "hidden",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
        marginBottom: "6px",
        }}
      >     
      <div
        style={{
        height: "100%",
        width: `${progress}%`,
        backgroundColor: "#3498db",
        transition: "width 0.2s ease",
      }}
      />
</div>
      {/* Texto con número de features */}
      {typeof progressCurrent === "number" && typeof progressTotal === "number" && (
        <div style={{ fontSize: "12px", color: "#555" }}>
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
