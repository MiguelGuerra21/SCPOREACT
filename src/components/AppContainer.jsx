// src/components/AppContainer.jsx
import React, { useState, useRef, useEffect } from "react";
import shpjs from "shpjs";
import { saveAs } from "file-saver";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Map from "@arcgis/core/Map";
import Extent from "@arcgis/core/geometry/Extent";

import TopMenu from "./TopMenu";
import FileLoader from "./FileLoader";
import MapViewWrapper from "./MapViewWrapper";
import LayerPanel from "./LayerPanel.jsx";
import SelectedCountBanner from "./SelectedCountBanner";
import LoadingOverlay from "./LoadingOverlay";
import ExportModal from "./ExportModal";

const AppContainer = () => {
    // ----- Estados y refs -----
    const [layers, setLayers] = useState([]);       // lista de entradas de capa
    const layersRef = useRef([]);                   // ref sincronizado a layers para acceso en closures
    const layerIdRef = useRef(0);                   // para asignar id incremental a cada capa
    const [loading, setLoading] = useState(false);  // overlay de carga mientras se procesan archivos
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedCount, setSelectedCount] = useState(0);

    // Ref al MapView (instancia de ArcGIS MapView)
    const viewRef = useRef(null);

    // Refs para almacenar el estado inicial de la vista (center, zoom, extent)
    const initialCenterRef = useRef(null);
    const initialZoomRef = useRef(null);
    const initialExtentRef = useRef(null);

    // Ref para el input de archivos
    const fileInputRef = useRef(null);

    // Sincronizar layersRef.current siempre que cambie layers
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    // ----- Callback que envía MapView a este contenedor -----
    // Se pasará a MapViewWrapper para que, cuando se cree el view, hagamos viewRef.current = view
    const handleViewReady = (view) => {
        viewRef.current = view;
        // Nota: el estado inicial de la vista (center/zoom/extent) se capturó en MapViewWrapper y
        // almacenó en initialCenterRef, initialZoomRef y initialExtentRef.
    };

    // ----- Funciones auxiliares -----

    // Convierte geometría GeoJSON a geometría ArcGIS (point/polyline/polygon),
// incluyendo MultiLineString y MultiPolygon
const convertGeometry = (geo) => {
  if (!geo) return null;
  const type = geo.type.toLowerCase();
  switch (type) {
    case "point":
      return {
        type: "point",
        x: geo.coordinates[0],
        y: geo.coordinates[1],
      };

    case "linestring":
      // Un solo camino (path)
      return {
        type: "polyline",
        paths: [geo.coordinates], // [ [ [x,y], [x,y], ... ] ]
      };

    case "multilinestring":
      // Varios caminos: cada elemento de coordinates es un array de puntos
      return {
        type: "polyline",
        paths: geo.coordinates, // [ [ [x1,y1],... ], [ [x2,y2],... ], ... ]
      };

    case "polygon":
      // coordinates: [ ringExterior, ringInterior1?, ... ]
      return {
        type: "polygon",
        rings: geo.coordinates, // [ [ [x,y],... ], [ [x,y],... ], ... ]
      };

    case "multipolygon":
      // coordinates: [ polygon1, polygon2, ... ]
      // donde cada polygon es [ ringExterior, ringInterior1?, ... ]
      // ArcGIS espera en `rings` un array plano de todos los anillos:
      //   rings: [ ring1, ring2, ..., ringN ]
      {
        // Aplanamos un nivel: obtenemos todos los anillos de cada polígono
        const rings = geo.coordinates.flat();
        return {
          type: "polygon",
          rings,
        };
      }

    default:
      console.warn("Tipo no soportado en convertGeometry:", type);
      return null;
  }
};


    // Genera un color distintivo según índice
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

    // Carga shp-write UMD desde CDN (window.shpwrite)
    const loadShpWriteFromCDN = () => {
        return new Promise((resolve, reject) => {
            if (window.shpwrite) return resolve();
            const script = document.createElement("script");
            script.src = "https://unpkg.com/@mapbox/shp-write@latest/shpwrite.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load shp-write"));
            document.head.appendChild(script);
        });
    };

    // ----- Manejador de apertura de archivo (shapefile ZIP) -----
    const handleFileOpen = async (file) => {
        const view = viewRef.current;
        if (!file || !view) return;
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
            // Convertir features a source de ArcGIS
            const features = geojson.features
                .map((f, i) => {
                    const geometry = convertGeometry(f.geometry);
                    if (!geometry) return null;

                    // Procesar propiedades y filtrar fechas inválidas
                    const propsRaw = f.properties || {};
                    const propsClean = {};
                    Object.entries(propsRaw).forEach(([key, value]) => {
                        if (value instanceof Date) {
                            const yr = value.getFullYear();
                            // Detectar fecha sentinela: shapefile vacío usualmente da año 1899 o similar
                            if (yr < 1900) {
                                // Reemplazamos por null para que ArcGIS acepte un valor nulo en campo date
                                propsClean[key] = null;
                            } else {
                                propsClean[key] = value;
                            }
                        } else {
                            // Si shpjs devolviera cadena para fecha, podrías intentar parsear:
                            // Por ejemplo, si value es string y quieres parsear a Date:
                            // const d = new Date(value);
                            // if (!isNaN(d.getTime()) && d.getFullYear() >= 1900) propsClean[key] = d;
                            // else propsClean[key] = null;
                            propsClean[key] = value;
                        }
                    });

                    return {
                        geometry,
                        attributes: { OBJECTID: i, ...propsClean },
                    };
                })
                .filter(Boolean);
            if (!features.length) {
                console.warn("No valid features after conversion:", file.name);
                return;
            }
            // Crear dynamicFields según primera feature
            const firstProps = geojson.features[0]?.properties || {};
            const dynamicFields = Object.entries(firstProps).map(([key, value]) => {
                let type;
                if (typeof value === "number") type = "double";
                else if (typeof value === "boolean") type = "boolean";
                else if (value instanceof Date) type = "date";
                else type = "string";
                return { name: key, alias: key, type };
            });
            const [r, g, b] = generateColorForIndex(newId);
            const fillColor = [r, g, b, 0.3];
            const outlineColor = [r, g, b, 1];
            // Detectar geometryType para FeatureLayer
            const geomType0 = geojson.features[0]?.geometry?.type;
            let geometryType = "polygon";
            if (geomType0 === "Point") geometryType = "point";
            else if (geomType0 === "LineString" || geomType0 === "MultiLineString")
                geometryType = "polyline";
            else geometryType = "polygon";
            const featureLayer = new FeatureLayer({
                source: features,
                objectIdField: "OBJECTID",
                geometryType,
                spatialReference: { wkid: 4326 },
                fields: [...dynamicFields],
                renderer: {
                    type: "simple",
                    symbol: {
                        type:
                            geometryType === "point"
                                ? "simple-marker"
                                : geometryType === "polyline"
                                    ? "simple-line"
                                    : "simple-fill",
                        color: geometryType === "point" ? [r, g, b] : fillColor,
                        outline:
                            geometryType === "polygon"
                                ? { color: outlineColor, width: 2 }
                                : null,
                        size: geometryType === "point" ? "8px" : null,
                        width: geometryType === "polyline" ? 2 : null,
                    },
                },
                popupTemplate: {
                    title: "Atributos",
                    content: [
                        {
                            type: "fields",
                            fieldInfos: dynamicFields.map((f) => ({
                                fieldName: f.name,
                                label: f.alias,
                            })),
                        },
                    ],
                },
            });
            // Agregar capa al mapa
            view.map.add(featureLayer);
            await featureLayer.when();
            // Centrar extensión de la capa cargada
            const extentResult = await featureLayer.queryExtent();
            if (extentResult?.extent) {
                await view.goTo({ target: extentResult.extent, padding: 50 });
            }
            const layerView = await view.whenLayerView(featureLayer);
            // Crear entrada y actualizar estado
            const newEntry = {
                id: newId,
                name: nameWithoutExt || `Layer ${newId}`,
                layer: featureLayer,
                layerView,
                visible: true,
                highlightHandle: null,
                selectedIds: [],
                extent: extentResult?.extent || null,
            };
            setLayers((prev) => [...prev, newEntry]);
        } catch (err) {
            console.error("Error processing shapefile:", file.name, err);
            window.alert("Error al procesar shapefile: " + err.message);
        }
    };

    // ----- Handler para cuando se seleccionan archivos en el input -----
    const handleFileLoad = async (files) => {
        setLoading(true);
        for (const f of files) {
            // procesar secuencialmente o en paralelo con Promise.all:
            // await handleFileOpen(f);
            // Para procesar en paralelo: await Promise.all(files.map(f=>handleFileOpen(f)));
            await handleFileOpen(f);
        }
        setLoading(false);
    };

    // ----- Exportar capa como Shapefile -----
    const generateGeoJSON = async (layer) => {
        const query = layer.createQuery();
        query.returnGeometry = true;
        query.outFields = ["*"];
        const results = await layer.queryFeatures(query);
        return {
            type: "FeatureCollection",
            features: results.features
                .map((f) => ({
                    type: "Feature",
                    geometry: arcgisToGeoJSON(f.geometry),
                    properties: f.attributes,
                }))
                .filter((f) => f.geometry),
        };
    };
    const arcgisToGeoJSON = (geometry) => {
        if (!geometry || !geometry.type) return null;
        switch (geometry.type) {
            case "point":
                return { type: "Point", coordinates: [geometry.x, geometry.y] };
            case "polyline":
                // Si paths tiene varias rutas, producimos MultiLineString
                if (geometry.paths.length === 1) {
                    return { type: "LineString", coordinates: geometry.paths[0] };
                } else {
                    return { type: "MultiLineString", coordinates: geometry.paths };
                }
            case "polygon":
                return { type: "Polygon", coordinates: geometry.rings };
            default:
                return null;
        }
    };
    const exportLayerAsShapefile = async (entry) => {
        const { layer, name } = entry;
        if (!layer) {
            alert("No hay capa para exportar.");
            return;
        }
        const geojson = await generateGeoJSON(layer);
        await loadShpWriteFromCDN();
        if (!geojson.features.length) {
            alert("No hay entidades válidas para exportar.");
            return;
        }
        try {
            const zipBlob = await window.shpwrite.zip(geojson, {
                outputType: "blob",
            });
            if (!zipBlob || zipBlob.size < 100) {
                alert("Archivo generado vacío o inválido.");
                return;
            }
            saveAs(zipBlob, `${name}.zip`);
        } catch (err) {
            console.error("Error al exportar shapefile:", err);
            alert("Error al generar el archivo.");
        }
    };

    // ----- Exportar capa como GeoJSON -----
    const exportLayerAsGeoJSON = async (entry) => {
        const layerView = entry.layerView;
        if (!layerView) {
            window.alert("La capa no está lista para exportar.");
            return;
        }
        try {
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
            const geojsonFeatures = [];
            for (let feat of featuresArcGIS) {
                let geom = feat.geometry;
                if (!geom) continue;
                try {
                    if (geom.spatialReference && geom.spatialReference.isWebMercator) {
                        geom = webMercatorToGeographic(geom);
                    }
                } catch { }
                let geojsonGeom = null;
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
                        continue;
                }
                const props = { ...feat.attributes };
                geojsonFeatures.push({
                    type: "Feature",
                    geometry: geojsonGeom,
                    properties: props,
                });
            }
            if (!geojsonFeatures.length) {
                window.alert("No hay features válidas para exportar.");
                return;
            }
            const geojsonFC = { type: "FeatureCollection", features: geojsonFeatures };
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

    // ----- Toggle visibilidad capa -----
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
        // Recalcular total seleccionados
        let total = 0;
        layersRef.current.forEach((e) => {
            if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
        });
        setSelectedCount(total);
    };

    // ----- Limpiar mapa: eliminar capas y restablecer vista inicial -----
    const handleClearMap = () => {
        const confirmed = window.confirm(
            "¿Estás seguro de que quieres limpiar todas las capas del mapa?"
        );
        if (!confirmed) return;
        const view = viewRef.current;
        if (view) {
            // Eliminar todas las capas operativas
            view.map.layers.removeAll();
            // Limpiar highlights de las entradas previas
            for (let entry of layersRef.current) {
                if (entry.highlightHandle) {
                    entry.highlightHandle.remove();
                    entry.highlightHandle = null;
                }
            }
            // Restablecer vista al estado inicial capturado
            if (initialCenterRef.current && initialZoomRef.current != null) {
                view
                    .goTo({
                        center: initialCenterRef.current,
                        zoom: initialZoomRef.current,
                    })
                    .catch((err) =>
                        console.error("Error al restablecer vista inicial:", err)
                    );
            } else if (initialExtentRef.current) {
                view
                    .goTo({
                        target: initialExtentRef.current,
                    })
                    .catch((err) =>
                        console.error("Error al restablecer extensión inicial:", err)
                    );
            }
        }
        // Limpiar estado React
        setLayers([]);
        layersRef.current = [];
        setSelectedCount(0);
        setMenuOpen(false);
    };

    // ----- Cerrar app -----
    const handleCloseApp = () => {
        const confirmed = window.confirm(
            "¿Estás seguro de que quieres cerrar la aplicación?\nLos cambios no guardados se perderán"
        );
        if (confirmed) window.close();
        setMenuOpen(false);
    };

    // ----- Menú: abrir/cerrar -----
    const toggleMenu = () => setMenuOpen((o) => !o);
    const handleOpenFiles = () => {
        // Dispara el input oculto
        if (fileInputRef.current) fileInputRef.current.click();
        setMenuOpen(false);
    };

    // ----- Centrar vista a la extensión combinada -----
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
            window.alert(
                "No hay capas visibles con extensión válida para centrar."
            );
        }
    };

    // ----- Exportar como Shapefile: abrir modal -----
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const handleExportRequest = () => {
        if (layers.length === 0) {
            window.alert("No hay capas cargadas para guardar.");
            return;
        }
        setExportModalOpen(true);
    };
    const handleExportConfirm = (idx) => {
        const entry = layers[idx];
        exportLayerAsShapefile(entry);
        setExportModalOpen(false);
    };
    const handleExportCancel = () => {
        setExportModalOpen(false);
    };

    // ----- Exportar como GeoJSON: prompt (o podrías crear otro modal) -----
    const handleExportGeoJSON = () => {
        if (layers.length === 0) {
            window.alert("No hay capas cargadas para guardar.");
            return;
        }
        const opciones = layers.map((e, idx) => `${idx}: ${e.name}`).join("\n");
        const respuesta = window.prompt(
            "Seleccione el índice de la capa a guardar como GeoJSON (ejemplo: 0):\n" +
            opciones
        );
        if (respuesta == null) return;
        const idx = parseInt(respuesta, 10);
        if (isNaN(idx) || idx < 0 || idx >= layers.length) {
            window.alert("Índice inválido.");
            return;
        }
        exportLayerAsGeoJSON(layers[idx]);
    };

    // ----- JSX de render -----
    return (
        <div>
            {/* Input oculto para shapefile ZIP */}
            <FileLoader
                ref={fileInputRef}
                accept=".zip"
                multiple
                onFilesSelected={handleFileLoad}
            />

            {/* Menú superior */}
            <TopMenu
                menuOpen={menuOpen}
                toggleMenu={toggleMenu}
                onOpenFiles={handleOpenFiles}
                onExportSHP={() => {
                    handleExportRequest();
                    setMenuOpen(false);
                }}
                onExportGeoJSON={() => {
                    handleExportGeoJSON();
                    setMenuOpen(false);
                }}
                onClearMap={() => {
                    handleClearMap();
                    setMenuOpen(false);
                }}
                onCloseApp={() => {
                    handleCloseApp();
                }}
            />

            {/* Overlay de carga */}
            {loading && <LoadingOverlay />}

            {/* MapView */}
            <MapViewWrapper
                layersRef={layersRef}
                setSelectedCount={setSelectedCount}
                onViewReady={handleViewReady}
                initialViewRefs={{
                    centerRef: initialCenterRef,
                    zoomRef: initialZoomRef,
                    extentRef: initialExtentRef,
                }}
            />

            {/* Panel de capas */}
            <LayerPanel
                layers={layers}
                onToggleVisibility={toggleLayerVisibility}
                onCenterView={handleCenterView}
            />

            {/* Conteo seleccionados */}
            <SelectedCountBanner
                count={selectedCount}
                onDeselectAll={() => {
                    layersRef.current.forEach((entry) => {
                        if (entry.highlightHandle) {
                            entry.highlightHandle.remove();
                            entry.highlightHandle = null;
                        }
                        entry.selectedIds = [];
                    });
                    setSelectedCount(0);
                }}
            />

            {/* Modal Exportar Shapefile */}
            {exportModalOpen && (
                <ExportModal
                    layers={layers}
                    onCancel={handleExportCancel}
                    onConfirm={handleExportConfirm}
                />
            )}
        </div>
    );
};

export default AppContainer;
