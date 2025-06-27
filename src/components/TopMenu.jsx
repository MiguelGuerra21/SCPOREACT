// src/components/TopMenu.jsx
import React from "react";

const TopMenu = ({
  menuOpen,
  toggleMenu,
  onOpenFiles,
  onExportSHP,
  onExportGeoJSON,
  onClearMap,
  onCloseApp,
}) => {
  return (
    <div
      style={{
        backgroundColor: "#f0f0f0",
        padding: "5px",
        borderBottom: "1px solid #ccc",
        position: "relative",
        zIndex: 1000,
        paddingTop: "30px",
      }}
    >
      <div style={{ display: "inline-block" }}>
        <button
          style={{
            padding: "5px 10px",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onClick={toggleMenu}
        >
          Archivo
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              backgroundColor: "white",
              border: "1px solid #ccc",
              boxShadow: "2px 2px 5px rgba(0,0,0,0.2)",
              zIndex: 1001,
              minWidth: "180px",
            }}
          >
            <div
              style={{ padding: "5px 10px", cursor: "pointer" }}
              onClick={onOpenFiles}
            >
              Abrir nuevo
            </div>
            <div
              style={{ padding: "5px 10px", cursor: "pointer" }}
              onClick={onExportSHP}
            >
              Exportar como Shapefile...
            </div>
            <div
              style={{ padding: "5px 10px", cursor: "pointer" }}
              onClick={onExportGeoJSON}
            >
              Exportar como GeoJSON...
            </div>
            <div
              style={{ padding: "5px 10px", cursor: "pointer" }}
              onClick={onClearMap}
            >
              Limpiar mapa
            </div>
            <div
              style={{
                height: "1px",
                backgroundColor: "#ccc",
                margin: "5px 0",
              }}
            ></div>
            <div
              style={{ padding: "5px 10px", cursor: "pointer" }}
              onClick={onCloseApp}
            >
              Cerrar
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopMenu;
