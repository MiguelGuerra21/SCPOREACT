// src/App.js
import React, { useEffect, useRef, useState } from "react";
import MapView from "@arcgis/core/views/MapView";
import Map from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Extent from "@arcgis/core/geometry/Extent";
import Graphic from "@arcgis/core/Graphic";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "@arcgis/core/assets/esri/themes/light/main.css";
import shpjs from "shpjs";

const App = () => {
  // Refs y estados
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const fileInputRef = useRef(null);
  const [layers, setLayers] = useState([]);
  const layersRef = useRef([]);
  const layerIdRef = useRef(0);
  const dragHandleRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [selectedCount, setSelectedCount] = useState(0);

  // Sincronizar layersRef con el estado
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Inicializar mapa y box-selection
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

    view.when(() => {
      // Quitar widget de zoom predeterminado
      view.ui.remove("zoom");

      // Adjuntar SHIFT+drag box selection solo una vez
      if (!dragHandleRef.current) {
        let dragOrigin = null;
        let boxGraphic = null;
        const dragHandle = view.on("drag", async (event) => {
          if (event.button === 0 && event.native.shiftKey) {
            event.stopPropagation();
            if (event.action === "start") {
              dragOrigin = [event.x, event.y];
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
                  color: [0, 255, 255, 0.2],
                  outline: { color: [0, 0, 255, 1], width: 2 },
                },
              });
              view.graphics.add(boxGraphic);
            } else if (event.action === "update" && dragOrigin) {
              const [x0, y0] = dragOrigin;
              const [x1, y1] = [event.x, event.y];
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
              const [x0, y0] = dragOrigin;
              const [x1, y1] = [event.x, event.y];
              if (boxGraphic) {
                view.graphics.remove(boxGraphic);
                boxGraphic = null;
              }
              const p1 = view.toMap({ x: x0, y: y0 });
              const p2 = view.toMap({ x: x1, y: y1 });
              const queryExt = new Extent({
                xmin: Math.min(p1.x, p2.x),
                ymin: Math.min(p1.y, p2.y),
                xmax: Math.max(p1.x, p2.x),
                ymax: Math.max(p1.y, p2.y),
                spatialReference: view.spatialReference,
              });

              // Query & resaltar en cada capa visible
              let total = 0;
              for (let entry of layersRef.current) {
                const { layerView, visible, highlightHandle } = entry;
                if (visible && layerView) {
                  try {
                    const q = layerView.createQuery();
                    q.geometry = queryExt;
                    const result = await layerView.queryFeatures(q);
                    const ids = result.features.map((f) => f.attributes.OBJECTID);
                    entry.selectedIds = ids;
                    if (highlightHandle) {
                      highlightHandle.remove();
                    }
                    if (ids.length) {
                      entry.highlightHandle = layerView.highlight(result.features);
                    } else {
                      entry.highlightHandle = null;
                    }
                    total += ids.length;
                  } catch (err) {
                    console.error("Error en box-selection:", err);
                  }
                } else {
                  if (entry.highlightHandle) {
                    entry.highlightHandle.remove();
                    entry.highlightHandle = null;
                  }
                  entry.selectedIds = [];
                }
              }
              setSelectedCount(total);
              dragOrigin = null;
            }
          }
        });
        dragHandleRef.current = dragHandle;
      }
    });

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      if (dragHandleRef.current) {
        dragHandleRef.current.remove();
        dragHandleRef.current = null;
      }
    };
  }, []);

  // CTRL+click para selección acumulativa
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handleCtrlClick = async (event) => {
      if (!event.native.ctrlKey) return;
      const hit = await view.hitTest(event);
      if (!hit.results.length) return;
      const result = hit.results.find((r) =>
        layersRef.current.some(
          (entry) => entry.layerView && r.graphic.layer === entry.layer
        )
      );
      if (!result) return;
      const graphic = result.graphic;
      const layer = graphic.layer;
      const entry = layersRef.current.find((e) => e.layer === layer);
      if (!entry) return;
      const oid = graphic.getAttribute("OBJECTID");
      if (oid == null) return;
      const prevIds = entry.selectedIds || [];
      let newIds;
      if (prevIds.includes(oid)) {
        newIds = prevIds.filter((id) => id !== oid);
      } else {
        newIds = [...prevIds, oid];
      }
      entry.selectedIds = newIds;
      // Actualizar highlight
      if (entry.highlightHandle) {
        entry.highlightHandle.remove();
        entry.highlightHandle = null;
      }
      if (newIds.length) {
        try {
          const q = entry.layerView.createQuery();
          q.objectIds = newIds;
          q.returnGeometry = true;
          const resultSel = await entry.layerView.queryFeatures(q);
          if (resultSel.features.length) {
            entry.highlightHandle = entry.layerView.highlight(resultSel.features);
          }
        } catch (err) {
          console.error("Error en CTRL+click selection:", err);
        }
      }
      // Recalcular total
      let total = 0;
      for (let e of layersRef.current) {
        if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
      }
      setSelectedCount(total);
    };
    view.on("click", handleCtrlClick);
    return () => {
      view.off("click", handleCtrlClick);
    };
  }, []);

  // Conversión GeoJSON -> ArcGIS geometry para carga
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
        console.warn("Tipo no soportado en convertGeometry:", type);
        return null;
    }
  };

  // Generar color distintivo por índice
  const generateColorForIndex = (index) => {
    const hue = (index * 60) % 360;
    const saturation = 70;
    const lightness = 50;
    const h = hue / 360;
    const s = saturation / 100;
    const l = lightness / 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  // Cargar shapefile ZIP usando shpjs
  const handleFileOpen = async (file) => {
    if (!file || !viewRef.current) return;
    const view = viewRef.current;
    const newId = layerIdRef.current++;
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    if (layersRef.current.some((e) => e.name === nameWithoutExt)) {
      window.alert("No puedes cargar dos veces la misma capa");
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shpjs(arrayBuffer);
      if (!geojson || !geojson.features?.length) {
        console.warn("No valid features found in shapefile:", file.name);
        return;
      }
      const features = geojson.features
        .map((f, i) => {
          const geometry = convertGeometry(f.geometry);
          return geometry
            ? { geometry, attributes: { OBJECTID: i, ...f.properties } }
            : null;
        })
        .filter(Boolean);
      if (!features.length) {
        console.warn("No valid features after conversion:", file.name);
        return;
      }
      
      // Extraer propiedades de la primera feature para crear dynamicFields
      const firstFeature = geojson.features[0];
      const firstProps = firstFeature?.properties || {};
      
      // Crear dynamicFields con detección de tipo
      const dynamicFields = Object.entries(firstProps).map(([name, value]) => {
        let type;
        if (typeof value === 'number') {
          type = 'double';
        } else if (typeof value === 'boolean') {
          type = 'boolean';
        } else if (value instanceof Date) {
          type = 'date';
        } else {
          type = 'string';
        }
        
        return {
          name,
          alias: name,
          type
        };
      });
      
      const [r, g, b] = generateColorForIndex(newId);
      const fillColor = [r, g, b, 0.3];
      const outlineColor = [r, g, b, 1];
      
      // Detectar geometryType dinámicamente
      const geometryType = geojson.features[0]?.geometry?.type === "Point" 
        ? "point" 
        : geojson.features[0]?.geometry?.type === "LineString" 
          ? "polyline" 
          : "polygon";

      const featureLayer = new FeatureLayer({
        source: features,
        objectIdField: "OBJECTID",
        geometryType,
        spatialReference: { wkid: 4326 },
        fields: [
          { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
          ...dynamicFields
        ],
        renderer: {
          type: "simple",
          symbol: {
            type: geometryType === "point" ? "simple-marker" : 
                  geometryType === "polyline" ? "simple-line" : "simple-fill",
            color: geometryType === "point" ? [r, g, b] : fillColor,
            outline: geometryType === "polygon" ? { color: outlineColor, width: 2 } : null,
            size: geometryType === "point" ? "8px" : null,
            width: geometryType === "polyline" ? 2 : null
          },
        },
        popupTemplate: {
          title: "Atributos",
          content: [
            {
              type: "fields",
              fieldInfos: [
                { fieldName: "OBJECTID", label: "OBJECTID" },
                ...dynamicFields.map(f => ({ fieldName: f.name, label: f.alias }))
              ],
            },
          ],
        },
      });
      
      view.map.add(featureLayer);
      await featureLayer.when();
      const extentResult = await featureLayer.queryExtent();
      if (extentResult?.extent) {
        await view.goTo({ target: extentResult.extent, padding: 50 });
      }
      const layerView = await view.whenLayerView(featureLayer);
      
      // Guardar dynamicFields con la entrada de la capa
      const newEntry = {
        id: newId,
        name: nameWithoutExt || `Layer ${newId}`,
        layer: featureLayer,
        layerView,
        visible: true,
        highlightHandle: null,
        selectedIds: [],
        extent: extentResult?.extent || null,
        dynamicFields: dynamicFields  // Almacenar campos dinámicos
      };
      setLayers((prev) => [...prev, newEntry]);
    } catch (err) {
      console.error("Error processing shapefile:", file.name, err);
      window.alert("Error al procesar shapefile: " + err.message);
    }
  };

  // Toggle visibilidad
  const toggleLayerVisibility = (id) => {
    setLayers((prev) =>
      prev.map((entry) => {
        if (entry.id === id) {
          const newVis = !entry.visible;
          if (entry.layer) entry.layer.visible = newVis;
          if (!newVis && entry.highlightHandle) {
            entry.highlightHandle.remove();
            entry.highlightHandle = null;
          }
          if (!newVis) entry.selectedIds = [];
          return { ...entry, visible: newVis };
        }
        return entry;
      })
    );
    // Recalcular total:
    let total = 0;
    layersRef.current.forEach((e) => {
      if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
    });
    setSelectedCount(total);
  };

  // Limpiar mapa
  const handleClearMap = () => {
    const confirmed = window.confirm(
      "¿Estás seguro de que quieres limpiar todas las capas del mapa?"
    );
    if (!confirmed) return;
    const view = viewRef.current;
    if (view) {
      for (let entry of layersRef.current) {
        if (entry.layer) view.map.remove(entry.layer);
        if (entry.highlightHandle) {
          entry.highlightHandle.remove();
          entry.highlightHandle = null;
        }
      }
    }
    setLayers([]);
    layersRef.current = [];
    setSelectedCount(0);
    setMenuOpen(false);
  };

  // Cerrar app
  const handleCloseApp = () => {
    const confirmed = window.confirm(
      "¿Estás seguro de que quieres cerrar la aplicación?\nLos cambios no guardados se perderán"
    );
    if (confirmed) window.close();
    setMenuOpen(false);
  };

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const triggerFileInput = () => {
    fileInputRef.current.click();
    setMenuOpen(false);
  };

  // Centrar vista
  const handleCenterView = async () => {
    const view = viewRef.current;
    if (!view) return;
    let unionExtent = null;
    for (let entry of layersRef.current) {
      if (entry.visible && entry.extent) {
        if (!unionExtent) unionExtent = entry.extent;
        else unionExtent = unionExtent.union(entry.extent);
      }
    }
    if (unionExtent) {
      try {
        await view.goTo({ target: unionExtent, padding: 50 });
      } catch (err) {
        console.error("Error al centrar vista:", err);
      }
    } else {
      window.alert("No hay capas visibles con extensión válida para centrar.");
    }
  };

  // Exportar capa a GeoJSON
  const exportLayerAsGeoJSON = async (entry) => {
    const layerView = entry.layerView;
    if (!layerView) {
      window.alert("La capa no está lista para exportar.");
      return;
    }
    try {
      // Query con todos los campos
      const query = layerView.createQuery();
      query.where = "1=1";
      query.returnGeometry = true;
      query.outFields = ["*"];
      const result = await layerView.queryFeatures(query);
      const featuresArcGIS = result.features;
      
      if (!featuresArcGIS.length) {
        window.alert("La capa no tiene features para exportar.");
        return;
      }

      // Construir GeoJSON features
      const geojsonFeatures = [];
      for (let feat of featuresArcGIS) {
        let geom = feat.geometry;
        if (!geom) continue;

        // Transformar WebMercator a Geographic si hace falta
        try {
          if (geom.spatialReference && geom.spatialReference.isWebMercator) {
            geom = webMercatorToGeographic(geom);
          }
        } catch (e) {
          console.warn("No se pudo transformar geom:", e);
        }

        // Convertir geom a GeoJSON manualmente
        let geojsonGeom = null;
        try {
          switch (geom.type) {
            case "point":
              geojsonGeom = { type: "Point", coordinates: [geom.x, geom.y] };
              break;
            case "polyline":
              if (geom.paths.length === 1) {
                geojsonGeom = { type: "LineString", coordinates: geom.paths[0] };
              } else {
                geojsonGeom = { type: "MultiLineString", coordinates: geom.paths };
              }
              break;
            case "polygon":
              geojsonGeom = { type: "Polygon", coordinates: geom.rings };
              break;
            default:
              console.warn("Geom no soportada:", geom.type);
              continue;
          }
        } catch (e) {
          console.warn("Error convirtiendo geom:", e);
          continue;
        }

        // Construir propiedades usando todos los campos
        const props = { ...feat.attributes };

        geojsonFeatures.push({ 
          type: "Feature", 
          geometry: geojsonGeom, 
          properties: props 
        });
      }

      if (!geojsonFeatures.length) {
        window.alert("No hay features válidas para exportar.");
        return;
      }

      const geojsonFC = { 
        type: "FeatureCollection", 
        features: geojsonFeatures 
      };

      // Crear y descargar GeoJSON
      const geojsonString = JSON.stringify(geojsonFC, null, 2);
      const blob = new Blob([geojsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entry.name}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error("Error en exportLayerAsGeoJSON:", err);
      window.alert("Error al exportar GeoJSON: " + err.message);
    }
  };

  // Handler "Guardar como"
  const handleGuardarComo = () => {
    if (layers.length === 0) {
      window.alert("No hay capas cargadas para guardar.");
      return;
    }
    const opciones = layers.map((e, idx) => `${idx}: ${e.name}`).join("\n");
    const texto =
      "Seleccione el índice de la capa a guardar (ejemplo: 0):\n" + opciones;
    const respuesta = window.prompt(texto);
    if (respuesta == null) return;
    const idx = parseInt(respuesta, 10);
    if (isNaN(idx) || idx < 0 || idx >= layers.length) {
      window.alert("Índice inválido.");
      return;
    }
    exportLayerAsGeoJSON(layers[idx]);
  };

  return (
    <div>
      {/* CSS spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Input oculto para shapefiles ZIP */}
      <input
        type="file"
        accept=".zip"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length) {
            setLoading(true);
            (async () => {
              await Promise.all(
                Array.from(files).map((f) => handleFileOpen(f))
              );
              setLoading(false);
            })();
          }
          e.target.value = null;
        }}
      />

      {/* Menú superior */}
      <div
        style={{
          backgroundColor: "#f0f0f0",
          padding: "5px",
          borderBottom: "1px solid #ccc",
          position: "relative",
          zIndex: 1000,
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
                zIndex: 1001,
                minWidth: "150px",
              }}
            >
              <div
                style={{ padding: "5px 10px", cursor: "pointer" }}
                onClick={triggerFileInput}
              >
                Abrir nuevo
              </div>
              <div
                style={{ padding: "5px 10px", cursor: "pointer" }}
                onClick={handleGuardarComo}
              >
                Guardar como
              </div>
              <div
                style={{ padding: "5px 10px", cursor: "pointer" }}
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
                style={{ padding: "5px 10px", cursor: "pointer" }}
                onClick={handleCloseApp}
              >
                Cerrar
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overlay de carga */}
      {loading && (
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
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
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
              Cargando capas...
            </div>
            <div
              style={{
                border: "4px solid #f3f3f3",
                borderTop: "4px solid #3498db",
                borderRadius: "50%",
                width: "40px",
                height: "40px",
                animation: "spin 1s linear infinite",
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Conteo de seleccionados con "Deseleccionar todo" */}
      {selectedCount > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            backgroundColor: "white",
            padding: "6px 12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            zIndex: 1000,
          }}
        >
          <div>Seleccionados: {selectedCount}</div>
          <hr style={{ margin: "4px 0" }} />
          <button
            style={{ padding: "4px 8px", cursor: "pointer" }}
            onClick={() => {
              layersRef.current.forEach((entry) => {
                if (entry.highlightHandle) {
                  entry.highlightHandle.remove();
                  entry.highlightHandle = null;
                }
                entry.selectedIds = [];
              });
              setSelectedCount(0);
            }}
          >
            Deseleccionar todo
          </button>
        </div>
      )}

      {/* Panel de capas en lado izquierdo */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 10,
          backgroundColor: "white",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          zIndex: 1000,
          maxHeight: "60vh",
          overflowY: "auto",
          minWidth: "180px",
        }}
      >
        <strong>Capas</strong>
        {layers.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: "6px",
            }}
          >
            <input
              type="checkbox"
              checked={entry.visible}
              onChange={() => toggleLayerVisibility(entry.id)}
            />
            <span style={{ marginLeft: "6px" }}>{entry.name}</span>
          </div>
        ))}
        {layers.length === 0 && (
          <div style={{ marginTop: "6px", fontStyle: "italic" }}>
            No hay capas cargadas
          </div>
        )}
        <button
          style={{
            marginTop: "10px",
            width: "100%",
            padding: "6px",
            cursor: "pointer",
          }}
          onClick={handleCenterView}
        >
          Centrar capas
        </button>
      </div>

      {/* Contenedor del mapa */}
      <div style={{ height: "calc(100vh - 37px)" }} ref={mapDiv}></div>
    </div>
  );
};

export default App;