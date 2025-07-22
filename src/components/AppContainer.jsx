// src/components/AppContainer.jsx

import React, { useState, useRef, useEffect, useMemo } from "react";
import JSZip from "jszip";
import shpjs from "shpjs";
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { saveAs } from "file-saver";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Map from "@arcgis/core/Map";
import Extent from "@arcgis/core/geometry/Extent";
import TopMenu from "./TopMenu";
import FileLoader from "./FileLoader";
import MapViewWrapper from "./MapViewWrapper";
import SelectedCountBanner from "./SelectedCountBanner";
import LoadingOverlay from "./LoadingOverlay";
import ExportModal from "./ExportModal";
import BatchEditModal from "./BatchEditModal";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import LayerPanel from "./LayerPanel";
import ExportWorker from "../workers/exportShapefile.worker.js";



const AppContainer = () => {
    // ----- Estados y refs -----
    const [layers, setLayers] = useState([]);       // lista de entradas de capa
    const [topOffset, setTopOffset] = useState(0);
    const layersRef = useRef([]);                   // ref sincronizado a layers para acceso en closures
    const layerIdRef = useRef(0);                   // para asignar id incremental a cada capa
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedCount, setSelectedCount] = useState(0);
    const [batchEditOpen, setBatchEditOpen] = useState(false);
    const [loading, setLoading] = React.useState(false);
    const [progress, setProgress] = useState(0);
    const [progressCurrent, setProgressCurrent] = useState(0);
    const [progressTotal, setProgressTotal] = useState(0);
    const [layerIndex, setLayerIndex] = useState(0);
    const [layerTotal, setLayerTotal] = useState(0);

    // Ref al MapView (instancia de ArcGIS MapView)
    const viewRef = useRef(null);

    // Refs para almacenar el estado inicial de la vista (center, zoom, extent)
    const initialCenterRef = useRef(null);
    const initialZoomRef = useRef(null);
    const initialExtentRef = useRef(null);

    // Ref para el input de archivos
    const fileInputRef = useRef(null);

    const isAndroid = Capacitor.getPlatform() === "android"; // Detectar si es Android

    // Compute if any selected features are polygons
    const hasPolygons = layers.some(entry =>
        entry.selectedIds.length > 0 &&
        entry.layer.geometryType === 'polygon'
    );

   async function handleBatchEditApply(
  layerIndex,     // índice en el array `layers`
  fieldName,      // p.ej. "Fecha ET03"
  newValueRaw     // "YYYY-MM-DD"
) {
  const entry = layers[layerIndex];
  if (!entry) { alert("Capa no encontrada"); return; }
  const { layer, selectedIds } = entry;
  if (!selectedIds.length) { alert("Nada seleccionado"); return; }

  // extraer número ETnn
  const m = fieldName.match(/ET\s*0*?(\d+)$/i);
  const selNum = m ? +m[1] : null;
  if (selNum == null) { alert("Campo inválido"); return; }

  // armar lista de campos Fecha ET ≤ selNum
  const allFecha = layer.fields
    .filter(f => {
      const t = f.name.match(/^Fecha\s*ET\s*0*?(\d+)$/i);
      return t && +t[1] <= selNum;
    })
    .map(f => ({
      name: f.name,
      type: f.type,
      num: +f.name.match(/\d+$/)[0]
    }));
  if (!allFecha.length) { alert("No hay campos Fecha ET"); return; }

  // validar input
  if (!newValueRaw) { alert("Fecha vacía"); return; }
  const d = new Date(newValueRaw);
  if (isNaN(d)) { alert("Formato fecha inválido"); return; }
  const epoch = d.getTime();

  // leer antes
  const where = selectedIds.map(id => `OBJECTID=${id}`).join(" OR ");
  const q = layer.createQuery();
  q.where = where;
  q.outFields = allFecha.map(f => f.name);
  const res = await layer.queryFeatures(q);
  const before = {};
  res.features.forEach(feat => {
    before[feat.attributes.OBJECTID] = feat.attributes;
  });

  // armar updates
  const updates = selectedIds.map(oid => {
    const prev = before[oid] || {};
    const attrs = { OBJECTID: oid };

    for (const f of allFecha) {
      const key = f.name;
      const had = prev[key];
      const nonEmpty = had != null && String(had).trim() !== "";

      if (f.num === selNum) {
        // siempre sobreescribe seleccionada
        attrs[key] = f.type === "date" ? epoch : newValueRaw;
      }
      else if (!nonEmpty) {
        // back‑fill sólo si estaba vacío
        attrs[key] = f.type === "date" ? epoch : newValueRaw;
      }
    }

    return Object.keys(attrs).length > 1 ? { attributes: attrs } : null;
  }).filter(u => u);

  if (!updates.length) {
    alert("No hay campos vacíos ni seleccionada para actualizar.");
    return;
  }

  // applyEdits
  const result = await layer.applyEdits({ updateFeatures: updates });
  if (result.updateFeaturesResults) {
    const fails = result.updateFeaturesResults.filter(r => !r.success);
    if (fails.length) alert("Algunas no se actualizaron");
  }

  // redraw + popup
  const view = viewRef.current;
  if (view?.requestRender) view.requestRender();
  else { layer.visible = false; layer.visible = true; }
  if (view?.popup.open) {
    const sel = view.popup.selectedFeature;
    if (sel && selectedIds.includes(sel.attributes.OBJECTID)) {
      const loc = view.popup.location;
      view.popup.close();
      view.popup.open({ features: [sel], location: loc });
    }
  }

  alert(`Actualizadas ${updates.length} entidad(es).`);
  setBatchEditOpen(false);
}
















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

        const stripCoords = (coords) => {
            if (!Array.isArray(coords)) return coords;
            if (typeof coords[0] === "number") {
                // Punto: [x, y, z?, m?] → solo dejamos [x, y]
                return coords.slice(0, 2);
            }
            // Recursivo para estructuras anidadas
            return coords.map(stripCoords);
        };

        const type = geo.type.toLowerCase();
        const cleanCoords = stripCoords(geo.coordinates);
        switch (type) {
            case "point":
                return {
                    type: "point",
                    x: cleanCoords[0],
                    y: cleanCoords[1],
                };

            case "linestring":
                return {
                    type: "polyline",
                    paths: [cleanCoords],
                };

            case "multilinestring":
                // Varios caminos: cada elemento de coordinates es un array de puntos
                return {
                    type: "polyline",
                    paths: cleanCoords,
                };

            case "polygon":
                // coordinates: [ ringExterior, ringInterior1?, ... ]
                return {
                    type: "polygon",
                    rings: cleanCoords,
                };

            case "multipolygon":
                {
                    const rings = cleanCoords.flat();
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

        setLoading(true);
        setProgress(0);
        setProgressCurrent(0);
        setProgressTotal(0);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);
            const fileNames = Object.keys(zip.files);
            const hasPrj = fileNames.some((name) =>
                name.toLowerCase().endsWith(".prj")
            );
            if (!hasPrj) {
                window.alert(
                    "No se puede mostrar una capa no geolocalizada junto a las localizadas"
                );
                setLoading(false);
                return;
            }

            const geojson = await shpjs(arrayBuffer);
            if (!geojson || !geojson.features?.length) {
                console.warn("No valid features found in shapefile:", file.name);
                setLoading(false);
                return;
            }

            const [r, g, b] = generateColorForIndex(newId);
            const fillColor = [r, g, b, 0.3];
            const outlineColor = [r, g, b, 1];

            const geomType0 = geojson.features[0]?.geometry?.type;
            let geometryType = "polygon";
            if (geomType0 === "Point") geometryType = "point";
            else if (geomType0 === "LineString" || geomType0 === "MultiLineString")
                geometryType = "polyline";

            const firstProps = geojson.features[0]?.properties || {};
            const dynamicFields = Object.entries(firstProps).map(([key, value]) => {
                let type;
                if (typeof value === "number") type = "double";
                else if (typeof value === "boolean") type = "boolean";
                else if (value instanceof Date) type = "date";
                else type = "string";
                return { name: key, alias: key, type };
            });

            // Crear FeatureLayer vacío
            const featureLayer = new FeatureLayer({
                source: [],
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
                    title: `${nameWithoutExt} - ID:` + "{fid}",
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

            view.map.add(featureLayer);
            await featureLayer.when();

            const batchSize = 1000;
            const allFeatures = geojson.features;
            const total = allFeatures.length;

            setProgress(0);
            setProgressCurrent(0);
            setProgressTotal(total);

            let objectIdCounter = 0;

            for (let i = 0; i < total; i += batchSize) {
                const batch = allFeatures.slice(i, i + batchSize)
                    .map((f) => {
                        const geometry = convertGeometry(f.geometry);
                        if (!geometry) return null;

                        const propsRaw = f.properties || {};
                        const propsClean = {};
                        Object.entries(propsRaw).forEach(([key, value]) => {
                            if (value instanceof Date) {
                                const yr = value.getFullYear();
                                propsClean[key] = yr < 1900 ? null : value;
                            } else {
                                propsClean[key] = value;
                            }
                        });

                        return {
                            geometry,
                            attributes: { OBJECTID: objectIdCounter++, ...propsClean },
                        };
                    })
                    .filter(Boolean);

                if (batch.length > 0) {
                    await featureLayer.applyEdits({ addFeatures: batch });
                }

                // Actualizar progreso
                setProgressCurrent((prev) => {
                    const current = Math.min(prev + batch.length, total);
                    setProgress((current / total) * 100);
                    return current;
                });

                // Pequeña pausa para no bloquear UI
                await new Promise((resolve) => setTimeout(resolve, 10));
            }

            const extentResult = await featureLayer.queryExtent();
            if (extentResult?.extent) {
                await view.goTo({ target: extentResult.extent, padding: 50 });
            }
            const layerView = await view.whenLayerView(featureLayer);

            const newEntry = {
                id: newId,
                name: nameWithoutExt || `Layer ${newId}`,
                layer: featureLayer,
                layerView,
                visible: true,
                highlightHandle: null,
                selectedIds: [],
                extent: extentResult?.extent || null,
                color: [r, g, b],
            };
            setLayers((prev) => [...prev, newEntry]);

        } catch (err) {
            console.error("Error procesando shapefile:", file.name, err);
            window.alert("Error al procesar shapefile: " + err.message);
        } finally {
            setLoading(false);
            setProgress(0);
            setProgressCurrent(0);
            setProgressTotal(0);
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

        try {
            // 1. Consultar features
            const query = layer.createQuery();
            query.where = "1=1";
            query.returnGeometry = true;
            query.outFields = ["*"];
            const result = await layer.queryFeatures(query);

            // 2. Construir GeoJSON (mantener tu lógica actual)
            const geojson = {
                type: "FeatureCollection",
                features: result.features
                    .map((f) => {
                        let geom = f.geometry;
                        if (geom.spatialReference?.isWebMercator) {
                            geom = webMercatorToGeographic(geom);
                        }

                        let geometry = null;
                        switch (geom.type) {
                            case "point":
                                geometry = { type: "Point", coordinates: [geom.x, geom.y] };
                                break;
                            case "polyline":
                                geometry = geom.paths.length > 1
                                    ? { type: "MultiLineString", coordinates: geom.paths }
                                    : { type: "LineString", coordinates: geom.paths[0] };
                                break;
                            case "polygon":
                                geometry = { type: "Polygon", coordinates: geom.rings };
                                break;
                            default:
                                return null;
                        }

                        return {
                            type: "Feature",
                            geometry,
                            properties: f.attributes,
                        };
                    })
                    .filter(Boolean),
            };

            if (!geojson.features.length) {
                alert("No hay entidades válidas para exportar.");
                return;
            }

            console.log("Iniciando generación de shapefile...");
            const worker = new ExportWorker();

            const zipBlob = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    const { type, blob, message } = e.data;

                    if (type === "done" && blob) {
                        console.log("ZIP recibido del worker, tamaño:", blob.size);
                        if (blob.size < 100) {
                            reject(new Error("Archivo generado demasiado pequeño"));
                        } else {
                            resolve(blob);
                        }
                    } else {
                        reject(new Error(message || "Error en el worker"));
                    }
                    worker.terminate();
                };

                worker.onerror = (err) => {
                    console.error("Error en worker:", err);
                    reject(err);
                    worker.terminate();
                };

                worker.postMessage({ geojson });
            });

            // 3. Guardar el archivo
            const fileName = `${name.replace(/[^a-z0-9]/gi, '_')}.zip`;

            if (window.cordova?.plugins?.safMediastore) {
                // Android
                const base64 = await blobToBase64(zipBlob);
                await window.cordova.plugins.safMediastore.writeFile({
                    data: base64,
                    filename: fileName,
                    mimeType: "application/zip"
                });
                alert("Shapefile guardado correctamente");
            } else {
                // Navegador
                saveAs(zipBlob, fileName);
            }

        } catch (err) {
            console.error("Error en exportLayerAsShapefile:", err);
            alert(`Error al exportar: ${err.message}`);
        }
    };

    // Función auxiliar para Blob a Base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }




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
    const toggleMenu = (val) =>
        setMenuOpen(o => typeof val === 'boolean' ? val : !o);

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
    const handleExportConfirm = async (idx) => {
        console.log("Exportar clickeado para capa idx:", idx, layers[idx]);
        try {
            const entry = layers[idx];
            await exportLayerAsShapefile(entry);
            console.log("Exportación completada");
        } catch (error) {
            console.error("Error en exportLayerAsShapefile:", error);
            alert("Error al exportar: " + error.message);
        }
        setExportModalOpen(false);
    };
    const handleExportCancel = () => {
        setExportModalOpen(false);
    };
    // ----- JSX de render -----
    return (
        <div>
            {/* FileLoader oculto */}
            <FileLoader
                ref={fileInputRef}
                accept=".zip"
                multiple
                onFilesSelected={async (files) => {
                    setLoading(true);
                    setLayerTotal(files.length);

                    for (let i = 0; i < files.length; i++) {
                        setLayerIndex(i + 1);
                        await handleFileOpen(files[i]);
                    }

                    setLoading(false);
                    setLayerIndex(0);
                    setLayerTotal(0);
                }}
            />

            {/* Menu */}
            <TopMenu
                menuOpen={menuOpen}
                toggleMenu={setMenuOpen}
                onOpenFiles={handleOpenFiles}
                onExportSHP={handleExportRequest}
                onClearMap={handleClearMap}
                onCloseApp={handleCloseApp}
                layers={layers}
                onToggleVisibility={toggleLayerVisibility}
                onCenterView={handleCenterView}
                onRemoveLayer={(id) => {
                    const view = viewRef.current;
                    // 1) find the entry in the ref
                    const entry = layersRef.current.find(e => e.id === id);
                    if (entry && view) {
                        // 2) remove it from the ArcGIS map
                        view.map.layers.remove(entry.layer);
                        // also clear any highlight
                        entry.highlightHandle?.remove();
                    }

                    // 3) now update your React state and layersRef
                    const newLayers = layersRef.current.filter(e => e.id !== id);
                    layersRef.current = newLayers;
                    setLayers(newLayers);

                    // 4) adjust your selected‑count if needed
                    const removedCount = entry?.selectedIds?.length || 0;
                    setSelectedCount(c => Math.max(0, c - removedCount));

                    // finally close the menu if you like
                    setMenuOpen(false);
                }}
                embedded={false}
            />

            {loading && (
                <LoadingOverlay
                    progress={progress}
                    progressCurrent={progressCurrent}
                    progressTotal={progressTotal}
                    layerIndex={layerIndex}
                    layerTotal={layerTotal}
                />
            )}
            <MapViewWrapper
                layersRef={layersRef}
                setSelectedCount={setSelectedCount}
                onViewReady={(v) => (viewRef.current = v)}
                initialViewRefs={{ centerRef: initialCenterRef, zoomRef: initialZoomRef, extentRef: initialExtentRef }}
            />

            <SelectedCountBanner
                count={selectedCount}
                hasPolygons={layers.some((e) => e.selectedIds.length && e.layer.geometryType === "polygon")}
                onDeselectAll={() => {
                    layersRef.current.forEach((e) => { e.highlightHandle?.remove(); e.selectedIds = []; });
                    setSelectedCount(0);
                }}
                onBatchEdit={() => selectedCount > 0 && setBatchEditOpen(true)}
            />

            {batchEditOpen && (
                <BatchEditModal
                    layers={layers}
                    onCancel={() => setBatchEditOpen(false)}
                    onApply={handleBatchEditApply}
                />
            )}

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