// src/components/AppContainer.jsx
import React, { useState, useRef, useEffect } from "react";
import { StatusBar } from "@capacitor/status-bar";
import JSZip from "jszip";
import shpjs from "shpjs";
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { saveAs } from "file-saver";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import Map from "@arcgis/core/Map";
import Extent from "@arcgis/core/geometry/Extent";
import { Filesystem, Directory } from "@capacitor/filesystem";
import TopMenu from "./TopMenu";
import FileLoader from "./FileLoader";
import MapViewWrapper from "./MapViewWrapper";
import LayerPanel from "./LayerPanel.jsx";
import SelectedCountBanner from "./SelectedCountBanner";
import LoadingOverlay from "./LoadingOverlay";
import ExportModal from "./ExportModal";
import BatchEditModal from "./BatchEditModal";
import { Capacitor } from "@capacitor/core";
import {StatusBar} from "@capacitor/status-bar";


const AppContainer = () => {
    // ----- Estados y refs -----
    const [layers, setLayers] = useState([]);       // lista de entradas de capa
    const [topOffset, setTopOffset] = useState(0);
    const layersRef = useRef([]);                   // ref sincronizado a layers para acceso en closures
    const layerIdRef = useRef(0);                   // para asignar id incremental a cada capa
    const [loading, setLoading] = useState(false);  // overlay de carga mientras se procesan archivos
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedCount, setSelectedCount] = useState(0);
    const [batchEditOpen, setBatchEditOpen] = useState(false);
    
    // Ref al MapView (instancia de ArcGIS MapView)
    const viewRef = useRef(null);

    // Refs para almacenar el estado inicial de la vista (center, zoom, extent)
    const initialCenterRef = useRef(null);
    const initialZoomRef = useRef(null);
    const initialExtentRef = useRef(null);

    // Ref para el input de archivos
    const fileInputRef = useRef(null);

    const isAndroid = Capacitor.getPlatform() === "android"; // Detectar si es Android

    const androidStoragePermissionGranted = false;

    // Compute if any selected features are polygons
    const hasPolygons = layers.some(entry =>
        entry.selectedIds.length > 0 &&
        entry.layer.geometryType === 'polygon'
    );

    // Dentro de AppContainer:
    const handleBatchEditApply = async (layerIndex, fieldName, newValueRaw) => {
        const entry = layers[layerIndex];
        if (!entry) {
            window.alert("Error interno: capa no encontrada.");
            return;
        }
        const { layer, layerView, selectedIds } = entry;
        if (!selectedIds || !selectedIds.length) {
            window.alert("No hay features seleccionadas en la capa.");
            setBatchEditOpen(false);
            return;
        }
        // Obtener definición del campo
        const fieldDef = layer.fields.find((f) => f.name === fieldName);
        if (!fieldDef) {
            window.alert("Campo no encontrado.");
            return;
        }
        // Parsear newValueRaw según tipo
        let parsedValue = null;
        switch (fieldDef.type) {
            case "integer":
            case "small-integer":
                parsedValue = parseInt(newValueRaw, 10);
                if (isNaN(parsedValue)) {
                    window.alert("Valor inválido para campo entero.");
                    return;
                }
                break;
            case "double":
                parsedValue = parseFloat(newValueRaw);
                if (isNaN(parsedValue)) {
                    window.alert("Valor inválido para campo numérico.");
                    return;
                }
                break;
            case "date":
                if (!newValueRaw) {
                    parsedValue = null;
                } else {
                    // newValueRaw viene de <input type="date">: "YYYY-MM-DD"
                    const d = new Date(newValueRaw);
                    if (isNaN(d.getTime())) {
                        window.alert("Fecha inválida.");
                        return;
                    }
                    // ArcGIS JS API acepta Date
                    parsedValue = d;
                }
                break;
            case "boolean":
                if (newValueRaw === "true") parsedValue = true;
                else if (newValueRaw === "false") parsedValue = false;
                else {
                    window.alert("Selecciona true o false para campo booleano.");
                    return;
                }
                break;
            case "string":
                parsedValue = newValueRaw;
                break;
            default:
                parsedValue = newValueRaw;
        }

        try {
            // -------------------------------
            // 1) Consulta previa con queryFeatures para ver valores antiguos
            const query = layer.createQuery();
            query.where = "1=1";
            query.returnGeometry = false;
            query.outFields = ["*"];
            let resultsBefore;
            try {
                resultsBefore = await layer.queryFeatures(query);
                console.log(
                    "DEBUG antes de editar, atributos de todas las features:",
                    resultsBefore.features.map((f) => ({
                        OBJECTID: f.attributes.OBJECTID,
                        valor: f.attributes[fieldName]
                    }))
                );
            } catch (err) {
                console.error("Error en queryFeatures antes de editar:", err);
            }
            // -------------------------------
            // 2) Editar atributos en layer.source
            const updates = selectedIds.map(oid => ({
                attributes: {
                    OBJECTID: oid,
                    [fieldName]: parsedValue
                }
            }));

            const editResult = await entry.layer.applyEdits({
                updateFeatures: updates
            });

            // ADD ERROR CHECKING HERE
            if (editResult.updateFeaturesResults) {
                editResult.updateFeaturesResults.forEach(result => {
                    if (!result.success) {
                        console.error("Failed to update feature:", result.error);
                        // Optional: show specific error to user
                    }
                });
            }
            // -------------------------------
            // 3) Consulta posterior con queryFeatures para verificar nuevos valores
            let resultsAfter;
            try {
                // Reusar mismo query
                resultsAfter = await layer.queryFeatures(query);
                console.log(
                    "DEBUG después de editar, atributos de todas las features:",
                    resultsAfter.features.map((f) => ({
                        OBJECTID: f.attributes.OBJECTID,
                        valor: f.attributes[fieldName]
                    }))
                );
            } catch (err) {
                console.error("Error en queryFeatures después de editar:", err);
            }
            // -------------------------------
            // 4) Forzar redraw del mapa
            const view = viewRef.current;
            if (view && typeof view.requestRender === "function") {
                view.requestRender();
            } else {
                // fallback: alternar visibilidad
                entry.layer.visible = false;
                entry.layer.visible = true;
            }
            // -------------------------------
            // 5) Si el popup está abierto sobre una feature editada, cerrarlo y reabrir para mostrar nuevo valor
            if (view && view.popup.open) {
                const sel = view.popup.selectedFeature;
                if (sel) {
                    const oidSel = sel.attributes?.OBJECTID;
                    if (selectedIds.includes(oidSel)) {
                        const loc = view.popup.location;
                        view.popup.close();
                        // Reabrir popup en la misma feature para que muestre atributos actualizados
                        view.popup.open({
                            features: [sel],
                            location: loc
                        });
                    }
                }
            }
            // -------------------------------
            window.alert(
                `Se actualizaron ${selectedIds.length} feature(s) en "${entry.name}".`
            );
        } catch (err) {
            console.error("Error al editar atributos en lote:", err);
            window.alert("Error al aplicar edición en lote: " + err.message);
        } finally {
            setBatchEditOpen(false);
        }
    };


    // Sincronizar layersRef.current siempre que cambie layers
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    useEffect(() => {
        const ajustarOffset = async () => {
            try {
                await StatusBar.setOverlaysWebView({ overlay: true });
                const isAndroid = /Android/i.test(navigator.userAgent);
                if (isAndroid) {
                    setTopOffset(28); // Ajusta este valor si el solapamiento persiste
                }
            } catch (e) {
                console.warn("No se pudo ajustar la barra de estado:", e);
            }
        };
        ajustarOffset();
    }, []);

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
            // 1. Leer el ArrayBuffer del ZIP
            const arrayBuffer = await file.arrayBuffer();

            // 2. Usar JSZip para inspeccionar contenido
            const zip = await JSZip.loadAsync(arrayBuffer);
            // Revisar si existe al menos un archivo con extensión .prj (case-insensitive)
            const fileNames = Object.keys(zip.files); // nombres de rutas dentro del zip
            const hasPrj = fileNames.some((name) =>
                name.toLowerCase().endsWith(".prj")
            );
            if (!hasPrj) {
                window.alert(
                    "No se puede mostrar una capa no geolocalizada junto a las localizadas"
                );
                return;
            }

            // 3. Si tiene .prj, continuar con shpjs
            const geojson = await shpjs(arrayBuffer);
            if (!geojson || !geojson.features?.length) {
                console.warn("No valid features found in shapefile:", file.name);
                return;
            }

            // 4. Convertir features a source de ArcGIS, con filtrado de fechas sentinela
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
                            // Detectar fecha sentinela: shapefile vacío suele dar año 1899 o similar
                            if (yr < 1900) {
                                propsClean[key] = null;
                            } else {
                                propsClean[key] = value;
                            }
                        } else {
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

            // 5. Preparar campos dinámicos
            const firstProps = geojson.features[0]?.properties || {};
            const dynamicFields = Object.entries(firstProps).map(([key, value]) => {
                let type;
                if (typeof value === "number") type = "double";
                else if (typeof value === "boolean") type = "boolean";
                else if (value instanceof Date) type = "date";
                else type = "string";
                return { name: key, alias: key, type };
            });

            // 6. Definir colores y geometryType
            const [r, g, b] = generateColorForIndex(newId);
            const fillColor = [r, g, b, 0.3];
            const outlineColor = [r, g, b, 1];
            const geomType0 = geojson.features[0]?.geometry?.type;
            let geometryType = "polygon";
            if (geomType0 === "Point") geometryType = "point";
            else if (
                geomType0 === "LineString" ||
                geomType0 === "MultiLineString"
            )
                geometryType = "polyline";
            else geometryType = "polygon";

            // 7. Crear FeatureLayer
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

            // 8. Agregar capa al mapa
            view.map.add(featureLayer);
            await featureLayer.when();
            // Centrar extensión de la capa cargada
            const extentResult = await featureLayer.queryExtent();
            if (extentResult?.extent) {
                await view.goTo({ target: extentResult.extent, padding: 50 });
            }
            const layerView = await view.whenLayerView(featureLayer);
            // 9. Actualizar estado con la nueva capa
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

    const generateGeoJSON = async (layer) => {
        const query = layer.createQuery();
        query.where = "1=1";
        query.returnGeometry = true;
        query.outFields = ["*"];
        const results = await layer.queryFeatures(query);
        console.log("DEBUG: primeros 5 attributes completos:", results.features.slice(0, 5).map(f => f.attributes));

        return {
            type: "FeatureCollection",
            features: results.features
                .map((f) => {
                    const geom = arcgisToGeoJSON(f.geometry);
                    if (!geom) return null;
                    return {
                        type: "Feature",
                        geometry: geom,
                        properties: f.attributes,
                    };
                })
                .filter(Boolean), // Remove null features
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
        const query = layer.createQuery();
        query.where = "1=1";
        query.returnGeometry = true;
        query.outFields = ["*"];
        const result = await layer.queryFeatures(query);
        const geojson = {
            type: "FeatureCollection",
            features: result.features
                .map((f) => {
                    let geom = f.geometry;
                    if (geom.spatialReference?.isWebMercator) {
                        geom = webMercatorToGeographic(geom);
                    }
                    let coords;
                    switch (geom.type) {
                        case "point":
                            coords = [geom.x, geom.y];
                            break;
                        case "polyline":
                            coords =
                                geom.paths.length === 1 ? geom.paths[0] : geom.paths;
                            break;
                        case "polygon":
                            coords = geom.rings;
                            break;
                        default:
                            return null;
                    }
                    return {
                        type: "Feature",
                        geometry: Array.isArray(coords[0][0])
                            ? { type: "Polygon", coordinates: coords }
                            : { type: "LineString", coordinates: coords },
                        properties: f.attributes,
                    };
                })
                .filter(Boolean),
        };

        if (!geojson.features.length) {
            alert("No hay entidades válidas para exportar.");
            return;
        }

        await loadShpWriteFromCDN();
        const zipBlob = await window.shpwrite.zip(geojson, { outputType: "blob" });
        if (!zipBlob || zipBlob.size < 100) {
            alert("Archivo generado inválido.");
            return;
        }

        const fileName = `${name}.zip`;

        if (isAndroid) {
            try {
                const perm = await Filesystem.requestPermissions();
                if (perm.publicStorage === 'granted' || perm === 'granted') {
                    // continuar
                } else {
                    alert("Permiso de almacenamiento no concedido.");
                    return;
                }
            } catch (err) {
                console.error("Error solicitando permisos:", err);
                alert("No se pudieron solicitar permisos de almacenamiento.");
                return;
            }

            try {
                const buf = await zipBlob.arrayBuffer();
                // const b64 = btoa(
                //     new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), "")
                // );
                const b64 = await blobToBase64(zipBlob);
                const path = fileName;
                await Filesystem.writeFile({
                    path,
                    data: b64,
                    directory: Directory.Documents,
                    recursive: true,
                });
                alert(`Shapefile guardado en ${path}`);
            } catch (err) {
                console.error("Error almacenando en disco:", err);
                alert("Error al guardar en dispositivo: " + err.message);
            }
        } else {
            saveAs(zipBlob, fileName);
        }
    };

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

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

    // ----- Exportar como GeoJSON: prompt -----
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
            {/* FileLoader oculto */}
            <FileLoader
                ref={fileInputRef}
                accept=".zip"
                multiple
                onFilesSelected={async (files) => {
                    setLoading(true);
                    for (let f of files) await handleFileOpen(f);
                    setLoading(false);
                }}
            />

            {/* Menu */}
            <TopMenu
                style={{ top: `${topOffset}px` }}
                menuOpen={menuOpen}
                toggleMenu={() => setMenuOpen((o) => !o)}
                onOpenFiles={() => { fileInputRef.current.click(); setMenuOpen(false); }}
                onExportSHP={() => { setExportModalOpen(true); setMenuOpen(false); }}
                onExportGeoJSON={() => { exportLayerAsGeoJSON(layers[0]); setMenuOpen(false); }}
                onClearMap={handleClearMap}
                onCloseApp={handleCloseApp}
            />

            {loading && <LoadingOverlay />}

            <MapViewWrapper
                layersRef={layersRef}
                setSelectedCount={setSelectedCount}
                onViewReady={(v) => (viewRef.current = v)}
                initialViewRefs={{ centerRef: initialCenterRef, zoomRef: initialZoomRef, extentRef: initialExtentRef }}
            />

            <LayerPanel
                layers={layers}
                onToggleVisibility={toggleLayerVisibility}
                onCenterView={() => { }}
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
                    onCancel={() => setExportModalOpen(false)}
                    onConfirm={(idx) => {
                        exportLayerAsShapefile(layers[idx]);
                        setExportModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default AppContainer;