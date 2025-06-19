import React, { useEffect, useRef, useState } from "react";
import MapView from "@arcgis/core/views/MapView";
import Map from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Extent from "@arcgis/core/geometry/Extent";
import Graphic from "@arcgis/core/Graphic";
import "@arcgis/core/assets/esri/themes/light/main.css";
import shp from "shpjs";

const App = () => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const fileInputRef = useRef(null);
  const featureLayerRef = useRef(null);

  // Refs to store handles so we can remove them later
  const dragHandleRef = useRef(null);
  const highlightHandleRef = useRef(null);
  // Store the layerView so we don’t call whenLayerView repeatedly
  const layerViewRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [selectedCount, setSelectedCount] = useState(0);

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

  // Initialize map once
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

    return () => {
      // Cleanup view on unmount
      if (view) {
        view.destroy();
      }
    };
  }, []);

  // Utility to convert GeoJSON geometry to ArcGIS geometry
  const convertGeometry = (geo) => {
    const type = geo.type.toLowerCase();
    switch (type) {
      case "point":
        return { type: "point", x: geo.coordinates[0], y: geo.coordinates[1] };
      case "linestring":
        return { type: "polyline", paths: [geo.coordinates] };
      case "polygon":
        // GeoJSON polygon coords: [ [ [x,y], ... ] , ... ]
        return { type: "polygon", rings: geo.coordinates };
      default:
        console.warn("Tipo no soportado:", type);
        return null;
    }
  };

  // Called when user selects a file
  const handleFileOpen = async (file) => {
    if (!file || !viewRef.current) return;
    const view = viewRef.current;

    // Before adding a new layer, clear any existing layer, handles, highlights
    if (featureLayerRef.current) {
      // Remove old layer
      view.map.remove(featureLayerRef.current);
      featureLayerRef.current = null;
    }
    // Remove old drag listener
    if (dragHandleRef.current) {
      dragHandleRef.current.remove();
      dragHandleRef.current = null;
    }
    // Remove old highlight
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }
    layerViewRef.current = null;
    setSelectedCount(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);

      const features = geojson.features
        .map((f, i) => {
          const geometry = convertGeometry(f.geometry);
          return geometry
            ? { geometry, attributes: { OBJECTID: i, ...f.properties } }
            : null;
        })
        .filter(Boolean);

      if (features.length === 0) {
        console.warn("No valid features found in the shapefile");
        return;
      }

      // Build dynamic fields from first feature's properties
      const firstProps = geojson.features[0]?.properties || {};
      const dynamicFields = Object.keys(firstProps).map((key) => ({
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
          content: [
            {
              type: "fields",
              fieldInfos: dynamicFields.map((f) => ({
                fieldName: f.name,
              })),
            },
          ],
        },
      });

      featureLayerRef.current = featureLayer;
      view.map.removeAll(); // or remove previous layers
      view.map.add(featureLayer);

      // Wait until layer is ready
      await featureLayer.when();

      // Zoom to layer extent
      const extentResult = await featureLayer.queryExtent();
      if (extentResult?.extent) {
        await view.goTo({ target: extentResult.extent, padding: 50 });
      }

      // Now that the layer is added and ready, get its layerView
      const layerView = await view.whenLayerView(featureLayer);
      layerViewRef.current = layerView;

      // Attach drag listener for SHIFT+drag box selection
      // We store in dragHandleRef so we can remove later
      let dragOrigin = null;
      let boxGraphic = null; // to show rubber-band
      const dragHandle = view.on("drag", async (event) => {
        // Only handle left mouse button + Shift key
        if (event.button === 0 && event.native.shiftKey) {
          // Prevent the default zoom-on-drag
          event.stopPropagation();

          if (event.action === "start") {
            // record origin and create the boxGraphic
            dragOrigin = [event.x, event.y];
            // initial tiny box (will update in "update")
            const p = view.toMap({ x: event.x, y: event.y });
            const initRings = [
              [p.x, p.y],
              [p.x, p.y],
              [p.x, p.y],
              [p.x, p.y],
              [p.x, p.y],
            ];
            boxGraphic = new Graphic({
              geometry: {
                type: "polygon",
                rings: [initRings],
                spatialReference: view.spatialReference,
              },
              symbol: {
                type: "simple-fill",
                color: [0, 255, 255, 0.2],   // semi-transparent cyan fill
                outline: {
                color: [0, 0, 255, 1],     // solid blue border
                width: 2, 
                style: "solid", // dashed outline
                },
              },
            });
            view.graphics.add(boxGraphic);
          } else if (event.action === "update" && dragOrigin) {
            // update the box geometry as pointer moves
            const [x0, y0] = dragOrigin;
            const x1 = event.x, y1 = event.y;
            const p1 = view.toMap({ x: x0, y: y0 });
            const p2 = view.toMap({ x: x1, y: y1 });
            const xmin = Math.min(p1.x, p2.x);
            const xmax = Math.max(p1.x, p2.x);
            const ymin = Math.min(p1.y, p2.y);
            const ymax = Math.max(p1.y, p2.y);
            const rings = [
              [xmin, ymin],
              [xmin, ymax],
              [xmax, ymax],
              [xmax, ymin],
              [xmin, ymin],
            ];
            if (boxGraphic) {
              boxGraphic.geometry = {
                type: "polygon",
                rings: [rings],
                spatialReference: view.spatialReference,
              };
            }
          } else if (event.action === "end" && dragOrigin) {
            // Finalize the box, remove graphic, then query/highlight
            const [x0, y0] = dragOrigin;
            const x1 = event.x, y1 = event.y;
            // Remove the visual box
            if (boxGraphic) {
              view.graphics.remove(boxGraphic);
              boxGraphic = null;
            }
            // Build extent from two corners
            const p1 = view.toMap({ x: x0, y: y0 });
            const p2 = view.toMap({ x: x1, y: y1 });
            const queryExt = new Extent({
              xmin: Math.min(p1.x, p2.x),
              ymin: Math.min(p1.y, p2.y),
              xmax: Math.max(p1.x, p2.x),
              ymax: Math.max(p1.y, p2.y),
              spatialReference: view.spatialReference,
            });
            // Query features intersecting that extent
            const query = layerView.createQuery();
            query.geometry = queryExt;
            // Optionally adjust spatialRelationship or outFields
            const result = await layerView.queryFeatures(query);
            // Remove previous highlight
            if (highlightHandleRef.current) {
              highlightHandleRef.current.remove();
            }
            // Highlight new features
            highlightHandleRef.current = layerView.highlight(result.features);
            // Update count
            setSelectedCount(result.features.length);

            // Reset origin
            dragOrigin = null;
          }
        }
      });

      dragHandleRef.current = dragHandle;
    } catch (error) {
      console.error("Error processing shapefile:", error);
    }
  };

  const handleClearMap = () => {
    const view = viewRef.current;
    if (view) {
      view.map.removeAll();
    }
    // Cleanup refs and state
    if (dragHandleRef.current) {
      dragHandleRef.current.remove();
      dragHandleRef.current = null;
    }
    if (highlightHandleRef.current) {
      highlightHandleRef.current.remove();
      highlightHandleRef.current = null;
    }
    featureLayerRef.current = null;
    layerViewRef.current = null;
    setSelectedCount(0);
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
      <input
        type="file"
        accept=".zip"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) =>
          e.target.files[0] && handleFileOpen(e.target.files[0])
        }
      />

      <div
        style={{
          backgroundColor: "#f0f0f0",
          padding: "5px",
          borderBottom: "1px solid #ccc",
          position: "relative",
        }}
      >
        <div ref={menuRef} style={{ display: "inline-block" }}>
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
                zIndex: 1000,
                minWidth: "150px",
              }}
            >
              <div
                style={{
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
                onClick={triggerFileInput}
              >
                Abrir nuevo
              </div>
              <div
                style={{
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
                onClick={handleClearMap}
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
                style={{
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
                onClick={handleCloseApp}
              >
                Cerrar
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          backgroundColor: "white",
          padding: "6px 12px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          zIndex: 999,
        }}
      >
        Seleccionados: {selectedCount}
      </div>

      <div style={{ height: "calc(100vh - 37px)" }} ref={mapDiv}></div>
    </div>
  );
};

export default App;
