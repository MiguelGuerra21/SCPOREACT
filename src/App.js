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

  // State para múltiples capas
  const [layers, setLayers] = useState([]);
  // Ref para reflejar layers en event listeners
  const layersRef = useRef([]);
  // Contador único de IDs de capa
  const layerIdRef = useRef(0);

  // Ref para el handle de drag
  const dragHandleRef = useRef(null);

  // Estado de loading
  const [loading, setLoading] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // State para el número de seleccionados total
  const [selectedCount, setSelectedCount] = useState(0);

  // Cerrar menú al hacer click fuera
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

  // Inicializar mapa una sola vez
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

    // Quitar controles de zoom predeterminados
    view.when(() => {
      view.ui.remove("zoom");
    });

    // Adjuntar SHIFT+drag box selection
    view.when(() => {
      if (dragHandleRef.current) {
        return;
      }
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
                color: [0, 255, 255, 0.2], // cyan semitransparente
                outline: {
                  color: [0, 0, 255, 1], // borde azul
                  width: 2,
                },
              },
            });
            view.graphics.add(boxGraphic);
          } else if (event.action === "update" && dragOrigin) {
            const [x0, y0] = dragOrigin;
            const x1 = event.x,
              y1 = event.y;
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
            const x1 = event.x,
              y1 = event.y;
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

            // Query y actualizar selección en cada capa visible
            let total = 0;
            const currentLayers = layersRef.current;
            for (let entry of currentLayers) {
              const { layerView, visible, highlightHandle } = entry;
              if (visible && layerView) {
                try {
                  const query = layerView.createQuery();
                  query.geometry = queryExt;
                  // Por defecto spatialRelationship intersecta
                  const result = await layerView.queryFeatures(query);
                  // Extraemos OBJECTIDs seleccionados
                  const ids = result.features.map(f => f.attributes.OBJECTID);
                  entry.selectedIds = ids; // actualizamos selección interna
                  // Removemos highlight previo
                  if (highlightHandle) {
                    highlightHandle.remove();
                  }
                  // Highlight de las features seleccionadas
                  if (ids.length > 0) {
                    // Podemos resaltar directamente result.features
                    entry.highlightHandle = layerView.highlight(result.features);
                  } else {
                    entry.highlightHandle = null;
                  }
                  total += ids.length;
                } catch (err) {
                  console.error("Error querying layer in box selection:", err);
                }
              } else {
                // no visible o layerView no listo: limpiamos highlight y selectedIds
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

  // Reflejar layers state en layersRef
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Lógica para CTRL+click acumulativo
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const handleCtrlClick = async (event) => {
      if (!event.native.ctrlKey) return;
      // Hit test para obtener gráfico bajo cursor
      const hit = await view.hitTest(event);
      if (!hit.results.length) return;
      // Encontrar el resultado cuyo layerView corresponda a alguna de nuestras capas
      const result = hit.results.find(r =>
        layersRef.current.some(entry => entry.layerView && r.graphic.layer === entry.layer)
      );
      if (!result) return;
      const graphic = result.graphic;
      const layer = result.graphic.layer;
      // Encontrar entry correspondiente
      const entry = layersRef.current.find(e => e.layer === layer);
      if (!entry) return;
      const oid = graphic.getAttribute("OBJECTID");
      if (oid == null) return;
      // Toggle en entry.selectedIds
      const prevIds = entry.selectedIds || [];
      let newIds;
      if (prevIds.includes(oid)) {
        newIds = prevIds.filter(id => id !== oid);
      } else {
        newIds = [...prevIds, oid];
      }
      entry.selectedIds = newIds;
      // Actualizar highlight en esa capa:
      if (entry.highlightHandle) {
        entry.highlightHandle.remove();
        entry.highlightHandle = null;
      }
      if (newIds.length > 0) {
        // Query las features seleccionadas por OBJECTID
        try {
          const query = entry.layerView.createQuery();
          query.objectIds = newIds;
          query.returnGeometry = true;
          const resultSel = await entry.layerView.queryFeatures(query);
          if (resultSel.features.length) {
            entry.highlightHandle = entry.layerView.highlight(resultSel.features);
          }
        } catch (err) {
          console.error("Error querying selected features by OBJECTID:", err);
        }
      }
      // Recalcular selectedCount total de todas las capas:
      let total = 0;
      for (let e of layersRef.current) {
        if (Array.isArray(e.selectedIds)) {
          total += e.selectedIds.length;
        }
      }
      setSelectedCount(total);
    };

    view.on("click", handleCtrlClick);
    return () => {
      view.off("click", handleCtrlClick);
    };
  }, []);

  // Util: convertir geometría GeoJSON a ArcGIS
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

  // Helper: generar color distinto según índice de capa
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

  // Cargar shapefile ZIP
  const handleFileOpen = async (file) => {
    if (!file || !viewRef.current) return;
    const view = viewRef.current;

    // Reservar ID de capa antes de operaciones async
    const newId = layerIdRef.current;
    layerIdRef.current += 1;

    // Derive nombre y verificar duplicado
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
    const exists = layersRef.current.some(
      (entry) => entry.name === nameWithoutExt
    );
    if (exists) {
      window.alert("No puedes cargar dos veces la misma capa");
      return;
    }

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
        console.warn("No valid features found in the shapefile:", file.name);
        return;
      }

      // Campos dinámicos
      const firstProps = geojson.features[0]?.properties || {};
      const dynamicFields = Object.keys(firstProps).map((key) => ({
        name: key,
        alias: key,
        type: "string",
      }));

      // Generar color
      const [r, g, b] = generateColorForIndex(newId);
      const fillColor = [r, g, b, 0.3];
      const outlineColor = [r, g, b, 1];

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
            color: fillColor,
            outline: { color: outlineColor, width: 2 },
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

      view.map.add(featureLayer);
      await featureLayer.when();

      // Zoom a la extensión
      const extentResult = await featureLayer.queryExtent();
      if (extentResult?.extent) {
        await view.goTo({ target: extentResult.extent, padding: 50 });
      }

      const layerView = await view.whenLayerView(featureLayer);

      const newEntry = {
        id: newId,
        name: nameWithoutExt || `Layer ${newId}`,
        layer: featureLayer,
        layerView: layerView,
        visible: true,
        highlightHandle: null,
        selectedIds: [],            // inicialmente sin selección
        extent: extentResult?.extent || null,
      };
      setLayers((prev) => [...prev, newEntry]);
    } catch (error) {
      console.error("Error processing shapefile:", file.name, error);
    }
  };

  // Toggle visibilidad de capa
  const toggleLayerVisibility = (id) => {
    setLayers((prev) =>
      prev.map((entry) => {
        if (entry.id === id) {
          const newVis = !entry.visible;
          if (entry.layer) {
            entry.layer.visible = newVis;
          }
          if (!newVis && entry.highlightHandle) {
            entry.highlightHandle.remove();
            entry.highlightHandle = null;
          }
          // Si ocultamos capa, limpiamos selección interna:
          if (!newVis) {
            entry.selectedIds = [];
          }
          return { ...entry, visible: newVis };
        }
        return entry;
      })
    );
    // Recalcular selectedCount en caso de cambios:
    let total = 0;
    layersRef.current.forEach(e => {
      if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
    });
    setSelectedCount(total);
  };

  // Limpiar mapa con confirmación
  const handleClearMap = () => {
    const confirmed = window.confirm(
      "¿Estás seguro de que quieres limpiar todas las capas del mapa?"
    );
    if (!confirmed) return;

    const view = viewRef.current;
    if (view) {
      for (let entry of layersRef.current) {
        if (entry.layer) {
          view.map.remove(entry.layer);
        }
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

  const handleCloseApp = () => {
    const confirmed = window.confirm(
    "¿Estás seguro de que quieres cerrar la aplicación?\n" +
    "Los cambios no guardados se perderán"
  );
  if (confirmed) {
    window.close();
  }
  setMenuOpen(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
    setMenuOpen(false);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Centrar vista al extent combinado de capas visibles
  const handleCenterView = async () => {
    const view = viewRef.current;
    if (!view) return;
    const currentLayers = layersRef.current;
    let unionExtent = null;
    for (let entry of currentLayers) {
      if (entry.visible && entry.extent) {
        if (!unionExtent) {
          unionExtent = entry.extent;
        } else {
          unionExtent = unionExtent.union(entry.extent);
        }
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

  return (
    <div>
      {/* CSS spinner */}
      <style>
        {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        `}
      </style>

      {/* Input oculto para múltiples archivos */}
      <input
        type="file"
        accept=".zip"
        multiple
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            setLoading(true);
            (async () => {
              await Promise.all(
                Array.from(files).map((file) => handleFileOpen(file))
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

      {/* Overlay de carga con label y spinner */}
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

      {/* Conteo de seleccionados, con botón “Deseleccionar todo” */}
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
              // Deseleccionar todo:
              layersRef.current.forEach(entry => {
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

      {/* Panel de capas en el lado izquierdo */}
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
        {/* Botón de centrar capas */}
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
