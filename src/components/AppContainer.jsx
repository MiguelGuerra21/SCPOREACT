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
    const [loadingMessage, setLoadingMessage] = useState("");
    const [stateColors, setStateColors] = useState({}); // <--- nuevo estado

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
  layerIndex,    // índice en el array `layers`
  fieldName,     // p.ej. "Fecha ET03"
  newValueRaw    // "YYYY-MM-DD"
) {
  // --- 1) Entrada y validaciones iniciales ---
  const entry = layers[layerIndex];
  if (!entry) {
    window.alert("Error interno: capa no encontrada.");
    return;
  }
  const { layer, selectedIds } = entry;
  if (!selectedIds?.length) {
    window.alert("No hay features seleccionadas en la capa.");
    setBatchEditOpen(false);
    return;
  }

  // --- 2) Extraer número de etapa (ETnn) ---
  const m = fieldName.match(/ET\s*0*?(\d+)$/i);
  const selNum = m ? parseInt(m[1], 10) : null;
  if (selNum == null) {
    window.alert(`Nombre de campo inválido: ${fieldName}`);
    return;
  }

  // --- 3) Listar todos los campos "Fecha ETnn" <= etapa seleccionada ---
  const allFecha = layer.fields
    .filter(f => {
      const t = f.name.match(/^Fecha\s+ET\s*0*?(\d+)$/i);
      return t && parseInt(t[1],10) <= selNum;
    })
    .map(f => ({
      name: f.name,
      type: f.type,
      num: parseInt(f.name.match(/\d+$/)[0], 10)
    }));
  if (!allFecha.length) {
    window.alert("No se encontraron campos Fecha ET.");
    return;
  }

  // --- 4) Validar la nueva fecha ---
  if (!newValueRaw) {
    window.alert("Selecciona una fecha.");
    return;
  }
  const d = new Date(newValueRaw);
  if (isNaN(d)) {
    window.alert("Formato de fecha inválido.");
    return;
  }
  const epoch = d.getTime();

  // --- 5) Leer valores actuales ---
  const where = selectedIds.map(id => `OBJECTID = ${id}`).join(" OR ");
  const q = layer.createQuery();
  q.where = where;
  q.outFields = ["*"]; // todos los campos
  q.returnGeometry = false;
  const res = await layer.queryFeatures(q);
  const beforeMap = {};
  res.features.forEach(feat => {
    beforeMap[feat.attributes.OBJECTID] = feat.attributes;
  });
  console.log("ANTES de editar (map):", beforeMap);

  // --- 6) Preparar updates respetando la lógica ---
  const updates = selectedIds
    .map(oid => {
      const prev = beforeMap[oid] || {};
      const attrs = { OBJECTID: oid };

      allFecha.forEach(f => {
        // ¿Tenía valor previo?
        const had = prev[f.name];
        const nonEmpty = had != null && String(had).trim() !== "";

        if (f.num === selNum) {
          // ❗ Siempre sobreescribo la etapa seleccionada
          attrs[f.name] = f.type === "date" ? epoch : newValueRaw;
        } else if (!nonEmpty) {
          // ✅ Relleno solo si estaba vacío
          attrs[f.name] = f.type === "date" ? epoch : newValueRaw;
        }
        //Log de los atributos que se actualizarán
        console.log(
          `OID ${oid} – campo ${f.name} – prev=`,
          had,
          "nonEmpty?",
          nonEmpty,
          "overwrite selected?",
          f.num === selNum
        );
      });

      return Object.keys(attrs).length > 1 ? { attributes: attrs } : null;
    })
    .filter(u => u);

  if (!updates.length) {
    window.alert("No hay campos vacíos ni seleccionada para actualizar.");
    return;
  }

  // --- 7) Ejecutar edits ---
  const result = await layer.applyEdits({ updateFeatures: updates });
  if (result.updateFeaturesResults) {
    const fails = result.updateFeaturesResults.filter(r => !r.success);
    if (fails.length) {
      console.error("Errores al actualizar:", fails);
      window.alert("Algunas entidades no pudieron actualizarse.");
    }
  }

  // --- 8) Forzar redraw y refrescar popup si está abierto ---
  const view = viewRef.current;
  if (view?.requestRender) view.requestRender();
  else { layer.visible = false; layer.visible = true; }
  if (view?.popup.open) {
    const selFeat = view.popup.selectedFeature;
    if (selFeat && selectedIds.includes(selFeat.attributes.OBJECTID)) {
      const loc = view.popup.location;
      view.popup.close();
      view.popup.open({ features: [selFeat], location: loc });
    }
  }

  // --- 9) Aviso al usuario ---
  window.alert(
    `Se actualizaron ${updates.length} feature(s) en "${entry.name}".`
  );
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
        // Cada estado avanza 20° en el espectro HSL desde 10° hasta 120°
        // (Si pasamos 120°, nos mantenemos en verde)
        const startHue = 10;
        const step = 20;
        const hue = Math.min(startHue + index * step, 120);

        const saturation = 90; // saturación alta para colores vivos
        const lightness = 45;  // contraste bueno

        // Convertimos HSL a RGB
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
            setLoadingMessage("Descomprimiendo archivo ZIP ");
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            setLoadingMessage("Leyendo archivos ");
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

            setLoadingMessage("Parseando shapefile y construyendo features ");
            const geojson = await shpjs(arrayBuffer);
            if (!geojson || !geojson.features?.length) {
                console.warn("No valid features found in shapefile:", file.name);
                setLoading(false);
                return;
            }

            const [r, g, b] = generateColorForIndex(newId);

            // --- Detectar campos de fecha dinámicamente ---
            // --- Detectar campos de fecha dinámicamente ---
            // --- Función para validar fecha ---
            function esFechaValida(val) {
                if (val instanceof Date) {
                    return val.getFullYear() >= 1900;
                }
                if (typeof val === "string" && val.trim() !== "") {
                    const d = new Date(val);
                    return !isNaN(d) && d.getFullYear() >= 1900;
                }
                return false;
            }

            // --- Inicializar sets ---
            const fechaCamposSet = new Set();
            const etapaCamposSet = new Set();
            const estadosSet = new Set();

            // --- Recorrer features una sola vez ---
            geojson.features.forEach((feature) => {
                const props = feature.properties;

                Object.keys(props).forEach((key) => {
                    if (key.startsWith("Fecha ")) fechaCamposSet.add(key);
                    if (key.startsWith("Etapa ")) etapaCamposSet.add(key);
                });
            });

            // --- Ordenar campos ---
            const sortByNum = (a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] ?? "0");
                const numB = parseInt(b.match(/\d+/)?.[0] ?? "0");
                return numA - numB;
            };

            const fechaCampos = Array.from(fechaCamposSet).sort(sortByNum);
            const etapaCampos = Array.from(etapaCamposSet).sort(sortByNum);


            // --- Función para detectar estado principal ---
            function detectarEstado(feature) {
                for (let i = fechaCampos.length - 1; i >= 0; i--) {
                    const fechaCampo = fechaCampos[i];
                    const fechaVal = feature.properties[fechaCampo];
                    if (!esFechaValida(fechaVal)) continue;

                    const etapaNumero = parseInt(fechaCampo.match(/\d+/)?.[0], 10);
                    if (!etapaNumero) return "Sin estado";

                    const etapaCampo = `Etapa ${etapaNumero.toString().padStart(2, "0")}`;
                    const estadoVal = feature.properties[etapaCampo];

                    return estadoVal && estadoVal.trim() !== "" ? estadoVal.trim() : "Sin estado";
                }
                return "Sin estado";
            }

            // --- Recopilar estados ---
            geojson.features.forEach((f) => {
                estadosSet.add(detectarEstado(f));
                etapaCampos.forEach((campo) => {
                    const val = f.properties[campo];
                    if (val && val.trim() !== "") estadosSet.add(val.trim());
                });
            });


            // --- Ordenar estados ---
            // Creamos una lista de estados en el orden en que aparecen las etapas
            const ordenDinamico = [];
            etapaCampos.forEach((campo) => {
                geojson.features.forEach((f) => {
                    const val = f.properties[campo];
                    if (val && !ordenDinamico.includes(val)) {
                        ordenDinamico.push(val);
                    }
                });
            });

            // Añadimos "Sin estado" al final si no está
            if (!ordenDinamico.includes("Sin estado")) {
                ordenDinamico.push("Sin estado");
            }

            const estadosUnicos = Array.from(estadosSet).sort((a, b) => {
                const indexA = ordenDinamico.indexOf(a);
                const indexB = ordenDinamico.indexOf(b);

                if (indexA === -1 && indexB === -1) return a.localeCompare(b, "es");
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;

                return indexA - indexB;
            });



            // --- Crear campos dinámicos ---
            const firstProps = geojson.features[0]?.properties || {};
            const dynamicFields = Object.entries(firstProps).map(([key, value]) => {
                let type;
                if (typeof value === "number") type = "double";
                else if (typeof value === "boolean") type = "boolean";
                else if (value instanceof Date) type = "date";
                else type = "string";
                return { name: key, alias: key, type };
            });
            dynamicFields.push({
                name: "estadoActual",
                alias: "Estado Actual",
                type: "string",
            });

            // --- Asignar colores ---
            const estadoAColor = {};
            estadosUnicos.forEach((estado, i) => {
                if (estado === "Sin estado") {
                    estadoAColor[estado] = [255, 255, 255, 0.5];
                } else {
                    const baseColor = generateColorForIndex(i);
                    estadoAColor[estado] = [...baseColor, 0.5]; // semitransparente
                }
            });
            // --- Detectar tipo de geometría ---
            const geomType0 = geojson.features[0]?.geometry?.type;
            let geometryType = "polygon";
            if (geomType0 === "Point") geometryType = "point";
            else if (geomType0 === "LineString" || geomType0 === "MultiLineString")
                geometryType = "polyline";

            // --- Construir uniqueValueInfos ---
            const uniqueValueInfos = estadosUnicos.map((estado) => {
                let symbol;
                if (estado === "Sin estado") {
                    // borde negro, sin relleno
                    symbol =
                        geometryType === "point"
                            ? {
                                type: "simple-marker",
                                size: "8px",
                                style: "circle",
                                color: [0, 0, 0, 0],
                                outline: { color: [0, 0, 0, 1], width: 1 },
                            }
                            : geometryType === "polyline"
                                ? { type: "simple-line", color: [0, 0, 0, 1], width: 2 }
                                : {
                                    type: "simple-fill",
                                    color: [0, 0, 0, 0],
                                    outline: { color: [0, 0, 0, 1], width: 2 },
                                };
                } else {
                    const baseColor = estadoAColor[estado];
                    const borderColor = baseColor
                        ? [baseColor[0], baseColor[1], baseColor[2], 1]
                        : [0, 0, 0, 1];
                    symbol =
                        geometryType === "point"
                            ? {
                                type: "simple-marker",
                                size: "8px",
                                style: "circle",
                                color: baseColor,
                                outline: { color: borderColor, width: 1 },
                            }
                            : geometryType === "polyline"
                                ? { type: "simple-line", color: borderColor, width: 2 }
                                : {
                                    type: "simple-fill",
                                    color: baseColor,
                                    outline: { color: borderColor, width: 2 },
                                };
                }
                return { value: estado, symbol, label: estado };
            });
            // --- Crear FeatureLayer ---
            const featureLayer = new FeatureLayer({
                source: [],
                objectIdField: "OBJECTID",
                geometryType,
                spatialReference: { wkid: 4326 },
                fields: [...dynamicFields],
                renderer: {
                    type: "unique-value",
                    field: "estadoActual",
                    defaultSymbol:
                        geometryType === "point"
                            ? {
                                type: "simple-marker",
                                size: "8px",
                                style: "circle",
                                color: [0, 0, 0, 0],
                                outline: { color: [0, 0, 0, 1], width: 1 },
                            }
                            : geometryType === "polyline"
                                ? { type: "simple-line", color: [0, 0, 0, 1], width: 2 }
                                : {
                                    type: "simple-fill",
                                    color: [0, 0, 0, 0],
                                    outline: { color: [0, 0, 0, 1], width: 2 },
                                },
                    uniqueValueInfos,
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
            setLoadingMessage("Agregando features al mapa ");
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

                        // Asignar estadoActual
                        propsClean.estadoActual = detectarEstado(f);

                        return {
                            geometry,
                            attributes: { OBJECTID: objectIdCounter++, ...propsClean },
                        };
                    })
                    .filter(Boolean);

                if (batch.length > 0) {
                    await featureLayer.applyEdits({ addFeatures: batch });
                }

                // Progreso
                setProgressCurrent((prev) => {
                    const current = Math.min(prev + batch.length, total);
                    setProgress((current / total) * 100);
                    return current;
                });

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
                uniqueValueInfos,
                estados: estadosUnicos,
                stateColors: estadoAColor,
            };
            setStateColors(estadoAColor);
            setLayers((prev) => [...prev, newEntry]);

        } catch (err) {
            console.error("Error procesando shapefile:", file.name, err);
            window.alert("Error al procesar shapefile: " + err.message);
        } finally {
            setLoading(false);
            setProgress(0);
            setProgressCurrent(0);
            setProgressTotal(0);
            setLoadingMessage("");
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


    const exportLayerAsShapefile = async (entry) => {
        const { layer, name } = entry;
        if (!layer) {
            alert("No hay capa para exportar.");
            return;
        }

        try {
            setLoadingMessage("Consultando entidades...");
            setProgress(0);

            // 1. Consultar features
            const query = layer.createQuery();
            query.where = "1=1";
            query.returnGeometry = true;
            query.outFields = ["*"];
            const result = await layer.queryFeatures(query);

            // 2. Construir GeoJSON
            setLoadingMessage("Construyendo GeoJSON...");
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

            // 3. Generar ZIP
            setLoadingMessage("Generando archivo ZIP...");
            const worker = new ExportWorker();
            const zipBlob = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    const { type, blob, message } = e.data;

                    if (type === "done" && blob) {
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

            // 4. Guardar el archivo
            const fileName = `${name.replace(/[^a-z0-9]/gi, '_')}.zip`;

            if (window.cordova?.plugins?.safMediastore) {
                // Android
                setLoadingMessage("Convirtiendo a base64...");
                setProgress(0);
                setProgressCurrent(0);
                setProgressTotal(zipBlob.size);
                const base64 = await blobToBase64(zipBlob, (percent, loaded, total) => {
                    setProgress(percent);
                    setProgressCurrent(loaded);
                    setProgressTotal(total);
                });
                setLoadingMessage("Guardando archivo...");
                await window.cordova.plugins.safMediastore.writeFile({
                    data: base64,
                    filename: fileName,
                    mimeType: "application/zip"
                });
                alert("Shapefile guardado correctamente");
            } else {
                // Navegador: simula progreso de guardado
                setLoadingMessage("Guardando archivo...");
                for (let i = 1; i <= 100; i += 10) {
                    setProgress(i);
                    setProgressCurrent(i);
                    setProgressTotal(100);
                    await new Promise((r) => setTimeout(r, 10));
                }
                saveAs(zipBlob, fileName);
                setProgress(100);
                setProgressCurrent(100);
                setProgressTotal(100);
            }

        } catch (err) {
            console.error("Error en exportLayerAsShapefile:", err);
            alert(`Error al exportar: ${err.message}`);
        }
        finally {
            setTimeout(() => {
                setLoading(false);
                setLoadingMessage("");
                setProgress(0);
                setProgressCurrent(0);
                setProgressTotal(0);
            }, 500); //se fija en 500 para que de tiempo a ver el 100%
        }
    };

    // Función auxiliar para Blob a Base64
    function blobToBase64(blob, onProgress) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.onerror = reject;
            reader.onprogress = (evt) => {
                if (evt.lengthComputable && typeof onProgress === "function") {
                    const percent = (evt.loaded / evt.total) * 100;
                    onProgress(percent, evt.loaded, evt.total);
                }
            };
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
        setExportModalOpen(false);
        setLoading(true);
        setLoadingMessage("Guardando archivo...");
        try {
            const entry = layers[idx];
            await exportLayerAsShapefile(entry);
        }
        catch (error) {
            console.error("Error en exportLayerAsShapefile:", error);
            alert("Error al exportar: " + error.message);
        }
        setLoading(false);
        setLoadingMessage(""); // Oculta el overlay al terminar
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
                stateColors={stateColors}
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
                    message={loadingMessage}
                    mode={loadingMessage.includes("Guardando") ||
                        loadingMessage.includes("Consultando") ||
                        loadingMessage.includes("Construyendo") ||
                        loadingMessage.includes("Exportando") ||
                        loadingMessage.includes("Convirtiendo") ||
                        loadingMessage.includes("Generando archivo ZIP") ? "export" : "load"}
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