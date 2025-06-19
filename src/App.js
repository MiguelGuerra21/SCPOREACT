import React, { useEffect, useRef, useState } from "react";
import MapView from "@arcgis/core/views/MapView";
import Map from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import "@arcgis/core/assets/esri/themes/light/main.css";
import shp from "shpjs";

const App = () => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const fileInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!mapDiv.current) return;

    const map = new Map({ basemap: "streets-vector" });
    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [-100, 40],
      zoom: 4,
    });
    viewRef.current = view;

    return () => view.destroy();
  }, []);

  const convertGeometry = (geo) => {
    const type = geo.type.toLowerCase();
    switch (type) {
      case "point":
        return { type: "point", x: geo.coordinates[0], y: geo.coordinates[1] };
      case "linestring":
        return { type: "polyline", paths: [geo.coordinates] };
      case "polygon":
        return { type: "polygon", rings: geo.coordinates };
      default:
        console.warn("Tipo no soportado:", type);
        return null;
    }
  };

  const handleFileOpen = async (file) => {
    if (!file || !viewRef.current) return;
    setMenuOpen(false);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);

      const features = geojson.features.map((f, i) => {
        const geometry = convertGeometry(f.geometry);
        if (!geometry) return null;

        return {
          geometry,
          attributes: {
            OBJECTID: i,
            ...f.properties,
          },
        };
      }).filter(Boolean);

      if (features.length === 0) {
        console.warn("No valid features found in the shapefile");
        return;
      }

      const firstProps = geojson.features[0]?.properties || {};
      const dynamicFields = Object.keys(firstProps).map(key => ({
        name: key,
        alias: key,
        type: "string",
      }));

      const featureLayer = new FeatureLayer({
        source: features,
        objectIdField: "OBJECTID",
        geometryType: "polygon",
        spatialReference: { wkid: 4326 },
        fields: [
          { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
          ...dynamicFields,
        ],
        renderer: {
          type: "simple",
          symbol: {
            type: "simple-fill",
            color: [0, 0, 255, 0.3],
            outline: { color: [0, 0, 255], width: 1 },
          },
        },
        popupTemplate: {
          title: "Atributos",
          content: [{
            type: "fields",
            fieldInfos: dynamicFields.map(f => ({ fieldName: f.name })),
          }],
        },
      });

      viewRef.current.map.removeAll();
      viewRef.current.map.add(featureLayer);

      await featureLayer.when();
      const extent = await featureLayer.queryExtent();
      
      if (extent && extent.extent) {
        await viewRef.current.goTo({
          target: extent.extent,
          padding: 50
        });
      } else {
        console.warn("Could not get valid extent from feature layer");
      }
    } catch (error) {
      console.error("Error processing shapefile:", error);
    }
  };

  const handleClearMap = () => {
    if (viewRef.current) {
      viewRef.current.map.removeAll();
    }
    setMenuOpen(false);
  };

  const handleCloseApp = () => {
    window.close();
    setMenuOpen(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
    setMenuOpen(false);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <div>
      {/* Hidden file input */}
      <input 
        type="file" 
        accept=".zip" 
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files[0]) {
            handleFileOpen(e.target.files[0]);
          }
        }} 
      />
      
      {/* Menu Bar */}
      <div style={{
        backgroundColor: '#f0f0f0',
        padding: '5px',
        borderBottom: '1px solid #ccc',
        position: 'relative'
      }}>
        <div ref={menuRef} style={{ display: 'inline-block' }}>
          <button 
            style={{
              padding: '5px 10px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer'
            }}
            onClick={toggleMenu}
          >
            Archivo
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute',
              backgroundColor: 'white',
              border: '1px solid #ccc',
              boxShadow: '2px 2px 5px rgba(0,0,0,0.2)',
              zIndex: 1000,
              minWidth: '150px'
            }}>
              <div 
                style={{ 
                  padding: '5px 10px', 
                  cursor: 'pointer', 
                  ':hover': { backgroundColor: '#f0f0f0' } 
                }}
                onClick={triggerFileInput}
              >
                Abrir nuevo
              </div>
              <div 
                style={{ 
                  padding: '5px 10px', 
                  cursor: 'pointer', 
                  ':hover': { backgroundColor: '#f0f0f0' } 
                }}
                onClick={handleClearMap}
              >
                Limpiar mapa
              </div>
              <div style={{ height: '1px', backgroundColor: '#ccc', margin: '5px 0' }}></div>
              <div 
                style={{ 
                  padding: '5px 10px', 
                  cursor: 'pointer', 
                  ':hover': { backgroundColor: '#f0f0f0' } 
                }}
                onClick={handleCloseApp}
              >
                Cerrar
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: "calc(100vh - 37px)" }} ref={mapDiv}></div>
    </div>
  );
};

export default App;