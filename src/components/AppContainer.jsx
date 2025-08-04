// src/components/AppContainer.jsx

import React, { useState, useRef, useEffect } from "react";
import JSZip from "jszip";
import shpjs from "shpjs";
import { saveAs } from "file-saver";
import { webMercatorToGeographic } from "@arcgis/core/geometry/support/webMercatorUtils";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import TopMenu from "./TopMenu";
import FileLoader from "./FileLoader";
import MapViewWrapper from "./MapViewWrapper";
import SelectedCountBanner from "./SelectedCountBanner";
import LoadingOverlay from "./LoadingOverlay";
import ExportModal from "./ExportModal";
import BatchEditModal from "./BatchEditModal";
import ExportWorker from "../workers/exportShapefile.worker.js";




const AppContainer = () => {
    // ----- Estados y refs -----
    const [layers, setLayers] = useState([]);       // lista de entradas de capa
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


    async function handleBatchEditApply(layerIndex, fieldName, isoDateString) {
        const entry = layers[layerIndex];
        if (!entry) {
            alert("Capa no encontrada");
            return;
        }
        const { layer, selectedIds } = entry;
        if (!selectedIds.length) {
            alert("Nada seleccionado");
            return;
        }

        // 1) Extract the etapa number from the fieldName:
        const m = fieldName.match(/ET\s*0*?(\d+)$/i);
        const selNum = m ? parseInt(m[1], 10) : null;
        if (selNum == null) {
            alert("Campo inválido");
            return;
        }

        // 2) Gather all “Fecha ETnn” fields ≤ selNum
        const allFecha = layer.fields
            .filter(f => {
                const t = f.name.match(/^Fecha\s+ET\s*0*?(\d+)$/i);
                return t && parseInt(t[1], 10) <= selNum;
            })
            .map(f => ({
                name: f.name,
                num: parseInt(f.name.match(/\d+$/)[0], 10),
                type: f.type
            }));

        // 3) Query those fields for all selected features
        const q = layer.createQuery();
        q.where = `${layer.objectIdField} IN (${selectedIds.join(",")})`;
        q.outFields = [layer.objectIdField, ...allFecha.map(f => f.name)];
        q.returnGeometry = false;
        const res = await layer.queryFeatures(q);

        // 4) Parse the ISO date string once
        const chosenTime = Date.parse(isoDateString);

        // 5) Build updates: per feature
        const updates = res.features.map(feat => {
            const attrs = { OBJECTID: feat.attributes[layer.objectIdField] };
            allFecha.forEach(f => {
                const cur = feat.attributes[f.name];
                const isEmpty = cur == null || cur === "" || cur === 0;
                // set if it's the selected etapa, OR an earlier empty one
                if (f.num === selNum || (f.num < selNum && isEmpty)) {
                    // if field type is "date", use epoch millis; otherwise string
                    attrs[f.name] = f.type === "date" ? chosenTime : isoDateString;
                }
            });
            return { attributes: attrs };
        });

        if (!updates.length) {
            alert("Nada que actualizar");
            return;
        }

        // 6) Apply edits
        try {
            const result = await layer.applyEdits({ updateFeatures: updates });
            const fails = (result.updateFeaturesResults || []).filter(r => !r.success);
            if (fails.length) alert("Algunas no se actualizaron");
        } catch (err) {
            console.error(err);
            alert("Error al actualizar: " + err.message);
        }

        // 7) Close modal (ArcGIS auto-refreshes the view)
        setBatchEditOpen(false);
    }

    async function handleClearEtapa(layerIdx, dateField) {
        const entry = layers[layerIdx];
        if (!entry) return window.alert("Capa no encontrada");

        const { layer, selectedIds } = entry;
        if (!selectedIds?.length) {
            return window.alert("No hay features seleccionadas");
        }

        // Build a single update that sets that dateField to null/""
        const updates = selectedIds.map((oid) => ({
            attributes: {
                OBJECTID: oid,
                [dateField]: null
            }
        }));

        let result;
        try {
            result = await layer.applyEdits({ updateFeatures: updates });
        } catch (err) {
            console.error(err);
            return window.alert("Error al eliminar fechas: " + err.message);
        }

        // Normalizamos el array de resultados:
        const updateResults =
            result.updateFeaturesResults ??
            result.updateFeatureResults ??    // en algunas versiones
            result.updates ??                  // o si viene con otro nombre
            [];

        // Ahora sí podemos usar .some de forma segura:
        if (updateResults.some((r) => !r.success)) { }

        // force repaint
        if (entry.layer.renderer) {
            entry.layer.renderer = entry.layer.renderer.clone();
        }

        // close & reopen the modal para que re‑consulte y pinte bien
        setBatchEditOpen(false);
        setTimeout(() => setBatchEditOpen(true), 0);
    }


    // Sincronizar layersRef.current siempre que cambie layers
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

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

    function generateRedToGreenGradient(steps) {
        const colors = [];
        for (let i = 0; i < steps; i++) {
            const t = i / Math.max(steps - 1, 1); // 0 → 1
            const r = Math.round(255 * (1 - t));  // rojo decrece
            const g = Math.round(255 * t);        // verde crece
            colors.push([r, g, 0]);               // RGB
        }
        return colors;
    }

    // ----- Manejador de apertura de archivo (shapefile ZIP) -----
    const handleFileOpen = async (file) => {




        const view = viewRef.current;
        if (!file || !view) return;

        const newId = layerIdRef.current++;
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

        // Verificar duplicados usando un Set para mejor performance
        const layerNames = new Set(layersRef.current.map(layer => layer.name));
        if (layerNames.has(nameWithoutExt)) {
            window.alert("No puedes cargar dos veces la misma capa");
            return;
        }

        // Estado de carga
        setLoading(true);
        setProgress(0);
        setProgressCurrent(0);
        setProgressTotal(0);

        try {
            //Procesamiento inicial del archivo
            setLoadingMessage("Descomprimiendo archivo ZIP");
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Leer encoding de .cpg (o UTF-8 por defecto)
            let encoding = "UTF-8";
            const cpgEntry = Object.keys(zip.files).find(n => n.toLowerCase().endsWith(".cpg"));
            if (cpgEntry) {
                const txt = (await zip.file(cpgEntry).async("string")).trim();
                console.log(".cpg original:", cpgEntry, "→", txt);
                encoding = txt || encoding;
            }

            // Parsear con shpjs
            const geojson = await shpjs(arrayBuffer, { encoding });
            console.log("GEOJSON reabierto:", geojson.features[0].properties);

            setLoadingMessage("Validando archivos");
            const hasPrj = Object.keys(zip.files).some(name =>
                name.toLowerCase().endsWith(".prj")
            );
            if (!hasPrj) {
                window.alert(
                    "No se puede mostrar una capa no geolocalizada junto a las localizadas"
                );
                return;
            }

            //Parsear el shapefile
            setLoadingMessage("Parseando shapefile y construyendo features ");

            if (!geojson?.features?.length) {
                console.warn("No se encontraron features válidas en el shapefile:", file.name);
                return;
            }

            // --- Detectar campos de fecha dinámicamente ---
            function esFechaValida(val) {
                // Si el valor es null/undefined
                if (val == null) return false;

                // Si es un timestamp numérico (como 1753826400000)
                if (typeof val === 'number') {
                    // Verificamos que sea un timestamp razonable (entre 1970 y 2100)
                    const year = new Date(val).getFullYear();
                    return year >= 1900 && year <= 2100;
                }

                // Si es instancia de Date
                if (val instanceof Date) {
                    return !isNaN(val.getTime()) && val.getFullYear() >= 1900;
                }

                // Si es string
                if (typeof val === 'string' && val.trim() !== '') {
                    const d = new Date(val);
                    return !isNaN(d.getTime()) && d.getFullYear() >= 1900;
                }

                // Si es DateTime de Luxon
                if (val?.isValid && typeof val.isValid === 'function') {
                    return val.isValid() && val.year >= 1900;
                }

                // Si es Moment.js
                if (val?.isValid && typeof val.isValid === 'function' && val?.year) {
                    return val.isValid() && val.year() >= 1900;
                }

                // Para cualquier otro objeto con método getTime()
                if (val?.getTime && typeof val.getTime === 'function') {
                    const d = new Date(val.getTime());
                    return !isNaN(d.getTime()) && d.getFullYear() >= 1900;
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
                // 1) si el nombre de campo es "Fecha …", lo marcamos date
                if (/^Fecha\s+/i.test(key)) {
                    return { name: key, alias: key, type: "date" };
                }
                // 2) resto de inferencia normal
                let type;
                if (typeof value === "number") type = "double";
                else if (typeof value === "boolean") type = "boolean";
                else if (value instanceof Date) type = "date";
                else type = "string";
                return { name: key, alias: key, type };
            });

            // Asegurar que el campo Estado existe
            if (!dynamicFields.some(f => f.name === "Estado")) {
                dynamicFields.push({ name: "Estado", alias: "Estado", type: "string" });
            }

            // --- Asignar colores ---
            const estadoAColor = {};
            const gradiente = generateRedToGreenGradient(estadosUnicos.length);
            estadosUnicos.forEach((estado, i) => {
                if (estado === "Sin estado") {
                    estadoAColor[estado] = [255, 255, 255, 0.5];
                } else {
                    estadoAColor[estado] = [...gradiente[i], 0.5];
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
            // 1) Filtra sólo los campos que empiezan por "Fecha "
            const fechaFields = dynamicFields
                .filter(f => f.name.startsWith("Fecha "))
                .map(f => ({
                    originalName: f.name,
                    alias: f.alias,
                    // genera un identificador sin espacios:
                    exprName: f.name.replace(/\s+/g, "_")
                }));
            // --- Crear FeatureLayer ---
            const featureLayer = new FeatureLayer({
                source: [],
                objectIdField: "OBJECTID",
                geometryType,
                spatialReference: { wkid: 4326 },
                fields: [...dynamicFields],
                renderer: {
                    type: "unique-value",
                    field: "Estado",
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
                    title: `${nameWithoutExt} - ID {fid}`,
                    expressionInfos: fechaFields.map(f => ({
                        name: f.exprName,
                        title: f.alias,
                        expression: `
      var s = $feature["${f.originalName}"];
      if (IsEmpty(s)) return "";
      var parts = Split(s, "-");      // ["2025","08","04"]
      var d = Date(parts[0], parts[1]-1, parts[2]);
      return Text(d, "DD/MM/YYYY");
    `
                    })),
                    content: [{
                        type: "fields",
                        fieldInfos: dynamicFields.map(f => {
                            const fecha = fechaFields.find(x => x.originalName === f.name);
                            if (fecha) {
                                return { fieldName: `expression/${fecha.exprName}`, label: f.alias };
                            }
                            return { fieldName: f.name, label: f.alias };
                        })
                    }]
                }
            });




            // --- Configurar eventos para esta capa específica ---
            const handleLayerUpdates = () => {
                setLayers(prev => prev.map(layer => {
                    if (layer.id === newId) {
                        return { ...layer, version: (layer.version || 0) + 1 };
                    }
                    return layer;
                }));
            };

            featureLayer.on("refresh", handleLayerUpdates);
            featureLayer.on("edits", handleLayerUpdates);

            // --- Funciones para actualización en tiempo real ---
            const updateFeatureState = async (featureId, newState) => {
                try {
                    const query = featureLayer.createQuery();
                    query.objectIds = [featureId];
                    const { features } = await featureLayer.queryFeatures(query);

                    if (!features.length) return;

                    const feature = features[0];

                    // Actualizar el estado y recalcular la fecha más reciente
                    const updatedProps = { ...feature.attributes };
                    updatedProps.Estado = newState;

                    await featureLayer.applyEdits({
                        updateFeatures: [{
                            attributes: updatedProps,
                            geometry: feature.geometry
                        }]
                    });

                    // Refrescar la vista
                    const layerView = await view.whenLayerView(featureLayer);
                    layerView.refresh();

                } catch (error) {
                    console.error("Error updating feature state:", error);
                }
            };

            const batchUpdateFeatureStates = async (updates) => {
                try {
                    const query = featureLayer.createQuery();
                    query.objectIds = updates.map(u => u.featureId);
                    const { features } = await featureLayer.queryFeatures(query);

                    const updateFeatures = features.map(feature => {
                        const update = updates.find(u => u.featureId === feature.attributes.OBJECTID);
                        return {
                            attributes: {
                                OBJECTID: feature.attributes.OBJECTID,
                                Estado: update.newState
                            },
                            geometry: feature.geometry
                        };
                    });

                    // Aplicar los cambios y devolver el resultado
                    const result = await featureLayer.applyEdits({
                        updateFeatures
                    });

                    // No intentar refrescar manualmente - ArcGIS maneja esto automáticamente
                    return {
                        success: true,
                        updatedCount: result.updateFeatureResults?.length || 0
                    };
                } catch (error) {
                    console.error("Error batch updating feature states:", error);
                    return {
                        success: false,
                        error: error.message
                    };
                }
            };
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

                        // Asignar Estado
                        propsClean.Estado = detectarEstado(f);

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

            // --- Crear entrada de capa con funciones de actualización ---
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
                fechaCampos,
                etapaCampos,
                // Funciones de actualización
                updateFeatureState,
                batchUpdateFeatureStates,
                // Función para recalcular estado basado en fechas
                recalculateState: async (featureId) => {
                    const query = featureLayer.createQuery();
                    query.objectIds = [featureId];
                    const { features } = await featureLayer.queryFeatures(query);

                    if (!features.length) return;

                    const feature = features[0];
                    const originalProps = geojson.features.find(f =>
                        f.properties?.OBJECTID === featureId ||
                        f.properties?.FID === featureId
                    )?.properties || {};

                    // Combinar propiedades originales con las actualizadas
                    const combinedProps = { ...originalProps, ...feature.attributes };

                    // Recalcular estado
                    const newState = detectarEstado({ properties: combinedProps });

                    // Actualizar si es diferente
                    if (feature.attributes.Estado !== newState) {
                        await updateFeatureState(featureId, newState);
                    }

                    return newState;
                },
                cleanup: () => {
                    featureLayer.off("refresh", handleLayerUpdates);
                    featureLayer.off("edits", handleLayerUpdates);
                }
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

    async function exportLayerAsShapefile(entry) {
        const { layer, name, fechaCampos } = entry;

        // 1) Query
        const q = layer.createQuery();
        q.where = "1=1";
        q.returnGeometry = true;
        q.outFields = ["*"];
        const { features: arcFeatures } = await layer.queryFeatures(q);

        // 2) GeoJSON con fechas como "YYYY-MM-DD"
        const features = arcFeatures.map(f => {
            // 2.a) geometría → GeoJSON
            let geom = f.geometry;
            if (geom.spatialReference?.isWebMercator) {
                geom = webMercatorToGeographic(geom);
            }
            let geometry;
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

            // 2.b) atributos + fechas como ISO strings
            const props = { ...f.attributes };
            fechaCampos.forEach(field => {
                const raw = f.attributes[field];
                if (raw != null && raw !== "") {
                    const d = new Date(raw);
                    const Y = d.getFullYear();
                    const M = String(d.getMonth() + 1).padStart(2, "0");
                    const D = String(d.getDate()).padStart(2, "0");
                    props[field] = `${Y}-${M}-${D}`;
                } else {
                    props[field] = "";
                }
            });

            return { type: "Feature", geometry, properties: props };
        }).filter(Boolean);

        const geojson = { type: "FeatureCollection", features };

        // 3) Worker
        const worker = new ExportWorker();
        const zipBlob = await new Promise((resolve, reject) => {
            worker.onmessage = e => {
                if (e.data.type === "done") resolve(e.data.blob);
                else reject(new Error(e.data.message));
                worker.terminate();
            };
            worker.onerror = err => { reject(err); worker.terminate(); };
            // enviamos la lista de campos (por si queremos tratarlos en el worker)
            worker.postMessage({ geojson, dateFieldNames: fechaCampos });
        });

        // 4) renombrar entradas ZIP y poner .cpg
        const buf = await zipBlob.arrayBuffer();
        const origZ = await JSZip.loadAsync(buf);
        const newZ = new JSZip();
        const base = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();

        await Promise.all(Object.keys(origZ.files).map(async path => {
            const data = await origZ.file(path).async("arraybuffer");
            const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
            newZ.file(`${base}${ext}`, data);
        }));
        newZ.file(`${base}.cpg`, "CP1252");

        const final = await newZ.generateAsync({ type: "blob" });
        saveAs(final, `${base}.zip`);
    }










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
                    onClearEtapa={handleClearEtapa}
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