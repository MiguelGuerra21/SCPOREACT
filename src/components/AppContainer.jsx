import React, { useState, useRef, useEffect, useCallback } from "react";
import JSZip from "jszip";
import shpjs from "shpjs";
import { saveAs } from "file-saver";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import TopMenu from "./TopMenu";
import FileLoader from "./FileLoader";
import MapViewWrapper from "./MapViewWrapper";
import SelectedCountBanner from "./SelectedCountBanner";
import LoadingOverlay from "./LoadingOverlay";
import ExportModal from "./ExportModal";
import BatchEditModal from "./BatchEditModal";
import { createExportWorker } from '../workers/createExportWorker';
import SCPOLogger from "../utils/SCPOLogger";
import { COLOR_PALETTE, COLOR_SIN_ESTADO } from "../utils/ColorPalette.jsx";
import URLConfig from "../utils/URLConfig"; // Importa la configuración de URLs
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';



const AppContainer = () => {
    // ----- Estados y refs -----
    const [layers, setLayers] = useState([]);
    const layersRef = useRef([]);
    const layerIdRef = useRef(0);
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
    const [stateColors, setStateColors] = useState({});
    const [hiddenStates, setHiddenStates] = useState({});


    // Ref al MapView
    const viewRef = useRef(null);

    // Refs para almacenar el estado inicial de la vista (center, zoom, extent)
    const initialCenterRef = useRef(null);
    const initialZoomRef = useRef(null);
    const initialExtentRef = useRef(null);

    // Ref para el input de archivos
    const fileInputRef = useRef(null);

    useEffect(() => {
        SCPOLogger.init();
    }, []);

    // ----- Funciones de filtrado por estado -----
    const handleToggleStateVisibility = useCallback((layerId, estado, isHidden) => {
        setHiddenStates(prev => {
            const newState = { ...prev };
            if (!newState[layerId]) newState[layerId] = {};
            newState[layerId][estado] = isHidden;
            return newState;
        });

        // Actualizar la capa correspondiente
        const layerEntry = layersRef.current.find(l => l.id === layerId);
        if (layerEntry) {
            updateLayerFilter(layerEntry, estado, isHidden);
        }
    }, []);

    const updateLayerFilter = useCallback((layerEntry, estado, isHidden) => {
        if (!layerEntry?.layer) return;

        try {
            const currentDefinition = layerEntry.layer.definitionExpression || "";
            let newDefinition;

            if (isHidden) {
                if (currentDefinition.includes("Estado <>")) {
                    newDefinition = `${currentDefinition} AND Estado <> '${estado}'`;
                } else if (currentDefinition) {
                    newDefinition = `${currentDefinition} AND Estado <> '${estado}'`;
                } else {
                    newDefinition = `Estado <> '${estado}'`;
                }
            } else {
                newDefinition = currentDefinition
                    .replace(`AND Estado <> '${estado}'`, '')
                    .replace(`Estado <> '${estado}'`, '')
                    .replace(/^\s*AND\s*/, '')
                    .replace(/\s*AND\s*$/, '');

                if (!newDefinition.trim()) newDefinition = null;
            }

            layerEntry.layer.definitionExpression = newDefinition;
        } catch (error) {
            console.error("Error updating layer filter:", error);
        }
    }, []);

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

    function detectarEstado(props, fechaCampos) {
        // 1. Handle undefined inputs
        if (!fechaCampos || !Array.isArray(fechaCampos)) {
            return "Sin estado";
        }

        // 2. Check for empty fechaCampos
        if (fechaCampos.length === 0) {
            return "Sin estado";
        }

        // 3. Handle missing props
        if (!props || typeof props !== 'object') {
            return "Sin estado";
        }

        // 4. Process fechaCampos in reverse order
        for (let i = fechaCampos.length - 1; i >= 0; i--) {
            const fechaCampo = fechaCampos[i];

            // 5. Skip if field doesn't exist in properties
            if (!props.hasOwnProperty(fechaCampo)) {
                continue;
            }

            const fechaVal = props[fechaCampo];
            if (!esFechaValida(fechaVal)) continue;

            const etapaNumero = parseInt(fechaCampo.match(/\d+/)?.[0], 10);
            if (!etapaNumero) return "Sin estado";

            const etapaCampo = `Etapa ${etapaNumero.toString().padStart(2, "0")}`;

            // 6. Handle missing etapaCampo property
            const estadoVal = props.hasOwnProperty(etapaCampo)
                ? props[etapaCampo]
                : "";

            return estadoVal && estadoVal.trim() !== ""
                ? estadoVal.trim()
                : "Sin estado";
        }
        return "Sin estado";
    }

    const recalculateStatesInBatch = async (layer, featureIds, fechaCampos) => {
        try {
            // Query all features that need updating
            const query = layer.createQuery();
            query.objectIds = featureIds;
            query.outFields = ["*"];
            query.returnGeometry = false;
            const { features } = await layer.queryFeatures(query);

            // Prepare updates
            const updates = features.map(feature => {
                const newState = detectarEstado(feature.attributes, fechaCampos);
                return {
                    attributes: {
                        fid: feature.attributes.fid,
                        Estado: newState
                    }
                };
            });

            // Apply all updates at once
            await layer.applyEdits({ updateFeatures: updates });
        } catch (error) {
            console.error("Error recalculating states in batch:", error);
        }
    };

    async function handleBatchEditApply(layerIndex, fieldName, isoDateString) {
        const entry = layers[layerIndex];
        if (!entry) {
            alert("Capa no encontrada");
            return;
        }
        const { layer, selectedIds, fechaCampos } = entry;
        if (!selectedIds.length) {
            alert("Nada seleccionado");
            return;
        }

        // 1) Extraer número de etapa
        const m = fieldName.match(/ET\s*0*?(\d+)$/i);
        const selNum = m ? parseInt(m[1], 10) : null;
        if (selNum == null) {
            alert("Campo inválido");
            return;
        }

        // *** LOG: inicio batch edit ***
        SCPOLogger.log({
            timestamp: new Date().toISOString(),
            credentials: 'omit',
            user: "Usuario1",
            action: "Batch edit apply",
            info: `Layer "${entry.name}" (ID ${entry.id}): editing ${selectedIds.length} feature(s), ` +
                `target stage "${fieldName}", date "${isoDateString}".`
        });

        // 2) Detectar todos los "Fecha ETnn" ≤ selNum junto a su "Etapa NN"
        const allFecha = layer.fields
            .filter(f => {
                const t = f.name.match(/^Fecha\s+ET\s*0*?(\d+)$/i);
                return t && parseInt(t[1], 10) <= selNum;
            })
            .map(f => {
                const num = parseInt(f.name.match(/\d+$/)[0], 10);
                return {
                    name: f.name,
                    nameField: `Etapa ${String(num).padStart(2, "0")}`,
                    num,
                    type: f.type
                };
            });


        // 3) Query
        const q = layer.createQuery();
        q.where = `${layer.objectIdField} IN (${selectedIds.join(",")})`;
        q.outFields = [layer.objectIdField, ...allFecha.map(f => f.nameField), ...allFecha.map(f => f.name)];
        q.returnGeometry = false;
        const res = await layer.queryFeatures(q);

        // 4) Parsear la fecha elegida
        const chosenTime = Date.parse(isoDateString);

        // 5) Construir updates con logs
        const updates = res.features.map(feat => {
            const attrs = { OBJECTID: feat.attributes[layer.objectIdField] };

            allFecha.forEach(f => {
                const curDate = feat.attributes[f.name];
                const isEmptyDate = !curDate || curDate === "" || curDate === 0;

                const etapaNameValue = feat.attributes[f.nameField];
                const isEmptyName = etapaNameValue === "" ||
                    etapaNameValue === null ||
                    etapaNameValue === undefined;

                // Skip entirely if name is empty
                if (isEmptyName) {
                    return; // Skip to next fecha field
                }

                // Only process if name has value
                if (f.num === selNum) {
                    // Always update target etapa if name exists
                    attrs[f.name] = f.type === "date" ? chosenTime : isoDateString;
                } else if (f.num < selNum && isEmptyDate) {
                    // Only update previous etapas if date is empty
                    attrs[f.name] = f.type === "date" ? chosenTime : isoDateString;
                } else {
                }
            });

            return { attributes: attrs };
        });

        // *** LOG: antes de applyEdits, cuántos updates ***
        SCPOLogger.log({
            timestamp: new Date().toISOString(),
            credentials: 'omit',
            user: "Usuario1",
            action: "Batch edit apply",
            info: `Prepared ${updates.length} update(s) for layer "${entry.name}".`
        });

        if (!updates.length) {
            alert("Nada que actualizar");
            return;
        }

        // 6) Aplicar edits
        try {
            const result = await layer.applyEdits({ updateFeatures: updates });
            const fails = (result.updateFeaturesResults || []).filter(r => !r.success);
            if (fails.length) alert("Algunas no se actualizaron");

            // *** LOG: resultados de edición ***
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Batch edit apply",
                info: `applyEdits complete: ${result} succeeded, ${fails} failed.`
            });

            // 7) Recalcular estados
            const oids = updates.map(u => u.attributes.OBJECTID);
            await recalculateStatesInBatch(layer, oids, fechaCampos);

            // *** LOG: estados recalculados ***
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Batch edit apply",
                info: `Recalculated Estado for ${oids.length} feature(s) on layer "${entry.name}".`
            });
        }
        catch (err) {
            // *** LOG: error ***
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Batch edit apply error",
                info: `Error applying batch edits: ${err.message}`
            });
            console.error(err);
            alert("Error al actualizar: " + err.message);
        }

        // 8) Cerrar modal
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
        const oidField = layer.objectIdField;
        const updates = selectedIds.map((oid) => ({
            attributes: {
                [oidField]: oid,
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

        // Recalculate estado in batch
        try {
            const entry = layers[layerIndex];
            await recalculateStatesInBatch(
                entry.layer,
                updates.map(u => u.attributes.fid),
                entry.fechaCampos
            );
        } catch (error) {
            console.error("Error recalculating states:", error);
        }

        // close & reopen the modal para que re‑consulte y pinte bien
        setBatchEditOpen(false);
        setTimeout(() => setBatchEditOpen(true), 0);
    }

    // Sincronizar layersRef.current siempre que cambie layers
    useEffect(() => {
        layersRef.current = layers;
    }, [layers]);

    // Convierte geometría GeoJSON a geometría ArcGIS (point/polyline/polygon)
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
    async function toArrayBuffer(file) {
        if (!file) throw new Error("No file provided to toArrayBuffer");
        if (typeof file.arrayBuffer === "function") {
            try {
                return await file.arrayBuffer();
            } catch (err) {
                console.warn("file.arrayBuffer() falló, usando FileReader fallback:", err);
            }
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (e) => reject(e);
            reader.readAsArrayBuffer(file);
        });
    }
    function uint8ToBase64(u8) {
        let CHUNK_SIZE = 0x8000;
        let index = 0;
        let result = '';
        while (index < u8.length) {
            const chunk = u8.subarray(index, Math.min(index + CHUNK_SIZE, u8.length));
            result += String.fromCharCode.apply(null, chunk);
            index += CHUNK_SIZE;
        }
        return btoa(result);
    }

    async function saveZipUniversal(zipUint8Array, filename = "export.zip") {
        try {
            if (window.Capacitor && typeof window.Capacitor.getPlatform === "function" && window.Capacitor.getPlatform() !== "web") {
                const base64 = uint8ToBase64(zipUint8Array);

                const writeRes = await Filesystem.writeFile({
                    path: `exports/${filename}`,
                    data: base64,
                    directory: Directory.Documents,
                    recursive: true
                });

                return { success: true, path: writeRes.uri || writeRes.path };
            }
        } catch (err) {
            console.warn("Capacitor save fallback falló:", err);

            try {
                await Toast.show({
                    text: `Error al guardar: ${err.message || 'Permiso denegado'}`,
                });
            } catch (_) { }

            return { success: false, error: err.message };
        }

        // Fallback en web
        try {
            const blob = new Blob([zipUint8Array], { type: "application/zip" });
            saveAs(blob, filename);
            return { success: true };
        } catch (err) {
            console.warn("saveAs falló:", err);
            await Toast.show({ text: `Error al descargar en web: ${err.message}` });
        }

        return { success: false, error: "No se pudo guardar el archivo" };
    }

    async function safeCreateExportWorker() {
        // 1) intenta la factory empaquetada (si existe)
        try {
            const w = await createExportWorker();
            console.log("createExportWorker() ok");
            return w;
        } catch (err) {
            console.warn("createExportWorker() falló:", err);
        }

        // 2) intenta worker estático en /export-worker.js (must be added to public)
        try {
            const w = new Worker('/export-worker.js'); // NO 'module' para máxima compatibilidad en WebView
            console.log("Worker('/export-worker.js') creado correctamente");
            return w;
        } catch (err) {
            console.warn("new Worker('/export-worker.js') falló:", err);
        }

        // 3) fallback "fake" que devuelve error controlado (no bloqueará el hilo con algo pesado)
        const fake = {
            onmessage: null,
            onerror: null,
            postMessage(payload) {
                console.error("No hay worker disponible en este entorno. Mensaje recibido:", payload);
                setTimeout(() => {
                    if (fake.onmessage) fake.onmessage({ data: { type: 'error', message: 'No worker available - fallback failed' } });
                }, 0);
            },
            terminate() { /* noop */ }
        };
        return fake;
    }
    //Exportar como shapefile
    async function exportLayerAsShapefile(entry, { workerTimeoutMs = 60000 } = {}) {
        try {
            const { layer, name, fechaCampos } = entry;

            /* --------------------------------------------------------------------------- */

            // 1) Query features
            const q = layer.createQuery();
            q.where = "1=1";
            q.returnGeometry = true;
            q.outFields = ["*"];

            let arcFeatures;
            try {
                const result = await layer.queryFeatures(q);
                arcFeatures = result.features || [];
                if (arcFeatures.length === 0) {
                    throw new Error("La capa no contiene features para exportar");
                }
            } catch (err) {
                console.error("Error en queryFeatures:", err);
                throw new Error(`Error al consultar features: ${err.message}`);
            }

            // 2) Convertir a GeoJSON con validación
            const features = arcFeatures.map((f, idx) => {
                // Preservar el fid original - CORRECCIÓN: Eliminar la referencia a propsClean
                const fid = f.attributes.fid || f.attributes.FID || f.attributes.OBJECTID || (idx + 1);

                try {
                    let geometry = null;
                    if (f.geometry) {
                        const geom = f.geometry;
                        switch (geom.type) {
                            case "point":
                                geometry = {
                                    type: "Point",
                                    coordinates: [geom.x, geom.y]
                                };
                                break;
                            case "polyline":
                                geometry = {
                                    type: "MultiLineString",
                                    coordinates: geom.paths || [[[0, 0]]]
                                };
                                break;
                            case "polygon":
                                geometry = {
                                    type: "Polygon",
                                    coordinates: geom.rings || [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
                                };
                                break;
                        }
                    }
                    if (!geometry) {
                        geometry = { type: "Point", coordinates: [0, 0] };
                    }

                    const props = {
                        fid: fid,
                        ...f.attributes
                    };

                    fechaCampos?.forEach(field => {
                        const raw = f.attributes[field];
                        if (raw instanceof Date) {
                            props[field] = raw.toISOString();
                        } else if (raw) {
                            props[field] = new Date(raw).toISOString() || null;
                        }
                    });

                    return {
                        type: "Feature",
                        id: fid,
                        geometry,
                        properties: props
                    };
                } catch (err) {
                    console.warn("Error al procesar feature:", err, f && f.attributes);
                    return null;
                }
            }).filter(Boolean);

            if (features.length === 0) {
                throw new Error("No se pudo convertir ninguna feature a GeoJSON válido");
            }

            // 3) Limpiar propiedades - Versión CORREGIDA
            const cleanFeatures = features.map(f => ({
                type: "Feature",
                geometry: f.geometry,
                properties: Object.fromEntries(
                    Object.entries(f.properties).map(([key, val]) => [key, val != null ? val : ""])
                )
            }));

            // 3.5) Filtrado de buenas/bad features
            const goodFeatures = cleanFeatures; // Mantiene TODAS las features

            if (goodFeatures.length === 0) throw new Error("Todas las features están inválidas tras normalización (polígonos con rings corruptos)");

            // 4) Crear worker mediante helper empaquetable (module worker + fallback)
            let worker;
            try {
                worker = await safeCreateExportWorker();
            } catch (err) {
                console.error("No se pudo obtener un worker:", err);
                throw err;
            }

            // Timeout/Promise para la respuesta del worker
            // --- Reemplazar por este bloque ---
            const result = await new Promise(async (resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    try { if (worker && typeof worker.terminate === 'function') worker.terminate(); } catch (_) { }
                    reject(new Error("Tiempo de espera agotado al generar el Shapefile"));
                }, workerTimeoutMs);

                // manejadores para worker local (si se usa)
                const attachWorkerHandlers = (w) => {
                    w.onmessage = (e) => {
                        const data = e.data;
                        //console.log('[worker msg]', data);
                        if (data?.type === 'done') {
                            clearTimeout(timeoutId);
                            try { w.terminate(); } catch (_) { }
                            let zipBytes = data.zip;
                            if (zipBytes instanceof ArrayBuffer) zipBytes = new Uint8Array(zipBytes);
                            else if (ArrayBuffer.isView(zipBytes)) zipBytes = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
                            if (!zipBytes || !(zipBytes instanceof Uint8Array) || zipBytes.length === 0) {
                                return reject(new Error("Formato de datos inválido del worker: zip missing/invalid"));
                            }
                            return resolve({ ...data, zip: zipBytes });
                        } else if (data?.type === 'error') {
                            // worker devolvió error
                            console.error('[worker error]', data.message, data.stack);
                            // no reject inmediatamente: dejamos que la lógica lo maneje
                            clearTimeout(timeoutId);
                            try { w.terminate(); } catch (_) { }
                            return reject(new Error(data.message || 'Worker reported error'));
                        } else {
                            // otros mensajes (debug/progress) -> ignorar
                            // console.log('[worker debug]', data);
                        }
                    };

                    w.onerror = (err) => {
                        clearTimeout(timeoutId);
                        try { w.terminate(); } catch (_) { }
                        reject(new Error(`Error en worker: ${err?.message || String(err)}`));
                    };
                };

                // reconstrucción del BACKEND_URL
                let BACKEND_URL = URLConfig.BACKEND_URL || null;
                try {
                    const mod = await import('../utils/URLConfig');
                    BACKEND_URL = mod.BACKEND_URL ?? mod.default?.BACKEND_URL ?? BACKEND_URL;
                } catch (err) {
                    console.warn('[export] No se pudo cargar URLConfig dinámicamente:', err);
                }

                // intento de resolución dinámica (probe)
                try {
                    const resolved = await resolveBackendUrlCandidateList({
                        urlConfig: { BACKEND_URL },
                        envOverrides: {
                            devIpEnv: (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_DEV_IP : undefined),
                            androidIpEnv: (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_ANDROID_IP : undefined),
                            port: (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_PORT : '3002'),
                            forceHttps: false
                        }
                    });
                    if (resolved) BACKEND_URL = resolved;
                } catch (e) {
                    console.warn('[export] resolveBackendUrlCandidateList falló:', e);
                }

                console.log('[export] usando BACKEND_URL =', BACKEND_URL);

                // Si hay BACKEND_URL intentamos usar la API remota primero
                if (BACKEND_URL) {
                    const candidates = [
                        `${BACKEND_URL.replace(/\/$/, '')}/api/export`,
                        `${BACKEND_URL.replace(/\/$/, '')}/export`,
                        `${BACKEND_URL.replace(/\/$/, '')}/api/export-shapefile`
                    ];

                    for (const url of candidates) {
                        try {
                            // POST JSON y esperar arraybuffer o JSON con base64
                            const payload = {
                                geojson: { type: "FeatureCollection", features: goodFeatures },
                                layerName: entry.name,
                                options: {
                                    encoding: "UTF-8",
                                    maxFieldSize: 254,
                                    strictMode: true,
                                    preserveFids: true,
                                    fidFieldName: 'fid'
                                }
                            };

                            const res = await fetch(url, {
                                method: 'POST',
                                credentials: 'omit',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });

                            if (!res || (res.status >= 400 && res.status !== 202)) {
                                // intentar siguiente candidate
                                console.warn('[export] remote export endpoint rejected', url, res && res.status);
                                continue;
                            }

                            // intentar leer como arrayBuffer
                            try {
                                const ab = await res.arrayBuffer();
                                const zipBytes = new Uint8Array(ab);
                                if (!zipBytes || zipBytes.length === 0) throw new Error('Empty arrayBuffer from remote');
                                clearTimeout(timeoutId);
                                return resolve({ zip: zipBytes, metadata: { backendUrl: url, method: 'remote-arraybuffer' } });
                            } catch (abErr) {
                                // no arraybuffer; tal vez sea JSON con base64
                                try {
                                    const json = await res.json();
                                    const b64 = json && (json.base64 || json.zipBase64 || json.zip);
                                    if (b64 && typeof b64 === 'string') {
                                        // decode base64
                                        const binary = atob(b64.replace(/\s/g, ''));
                                        const len = binary.length;
                                        const bytes = new Uint8Array(len);
                                        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                                        clearTimeout(timeoutId);
                                        return resolve({ zip: bytes, metadata: { backendUrl: url, method: 'remote-json-base64' } });
                                    }
                                } catch (jsonErr) {
                                    console.warn('[export] remote response parsing failed', jsonErr);
                                }
                            }
                        } catch (netErr) {
                            console.warn('[export] remote export failed at', url, netErr);
                            // try next url
                        }
                    } // end for candidates

                    // Si llegamos aquí, la API remota no respondió correctamente -> fallback a worker local
                    console.warn('[export] No se pudo exportar remotamente, probando worker local');
                }

                // Intentar worker local (fallback)
                try {
                    const localWorker = await safeCreateExportWorker();
                    if (!localWorker || typeof localWorker.postMessage !== 'function') {
                        clearTimeout(timeoutId);
                        return reject(new Error('No local worker available'));
                    }
                    worker = localWorker; // reasigna para que onerror/terminate puedan usarlo
                    attachWorkerHandlers(worker);

                    // Enviar datos al worker local
                    try {
                        worker.postMessage({
                            geojson: { type: "FeatureCollection", features: goodFeatures },
                            layerName: entry.name,
                            backendUrl: BACKEND_URL, // null o url; worker puede usarlo si lo necesita
                            options: {
                                encoding: "UTF-8",
                                maxFieldSize: 254,
                                strictMode: true,
                                preserveFids: true,
                                fidFieldName: 'fid'
                            }
                        });
                    } catch (pmErr) {
                        clearTimeout(timeoutId);
                        try { worker.terminate(); } catch (_) { }
                        return reject(new Error(`No se pudo postMessage al worker local: ${pmErr.message || pmErr}`));
                    }
                } catch (werr) {
                    clearTimeout(timeoutId);
                    return reject(werr);
                }
            });
            // --- fin del bloque ---


            // 5) Validar resultado solo si es un file válido y crear Blob
            if (!result || !result.zip || !(result.zip instanceof Uint8Array) || result.zip.length === 0) {
                throw new Error("Export falló: ZIP inválido o vacío (worker/backend no generó nada)");
            }

            let blob;
            try {
                blob = new Blob([result.zip], { type: 'application/zip' });
                if (blob.size === 0) throw new Error("El Blob generado está vacío");
            } catch (err) {
                throw new Error(`Error al crear el archivo ZIP: ${err.message}`);
            }

            // 6) Logging y guardar
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Export shapefile",
                info: `Exportado "${name}" como ${entry.name}.zip (${goodFeatures.length} features, ${blob.size} bytes)`,
                details: { features: goodFeatures.length, originalFeatures: arcFeatures.length, skipped: arcFeatures.length - goodFeatures.length }
            });

            //saveAs(blob, `${entry.name}.zip`);
            const saveRes = await saveZipUniversal(result.zip, `${entry.name}.zip`);
            if (!saveRes?.success) {
                throw new Error(`Falló al guardar ZIP: ${saveRes?.error || 'desconocido'}`);
            }
            try {
                const isMobile = window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() !== 'web';
                if (saveRes?.success && isMobile) {
                    const rawPath = saveRes.displayPath ?? saveRes.path ?? '';
                    const displayPath = (rawPath || '').replace(/^file:\/\//, '');
                    await Toast.show({
                        text: `Exportado: ${entry.name}.zip\nGuardado en: ${displayPath || 'Documents/exports'}`
                    });
                }
            } catch (tErr) {
                console.warn('Toast falló:', tErr);
            }
        } catch (err) {
            console.error("Error en exportLayerAsShapefile:", err);
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Export shapefile - ERROR",
                info: `Error al exportar "${entry?.name || 'unknown'}": ${err.message}`,
                error: { name: err.name, stack: err.stack, message: err.message }
            });
            throw err;
        }
    }

    // Llamar a esto para resolver la URL del backend disponible.
    // Opciones/orden de prioridad:
    // 1) IP guardada en localStorage (clave: 'EXPORT_BACKEND_URL')
    // 2) valor de URLConfig.BACKEND_URL (si existe)
    // 3) env vars devIp/androidIp
    // 4) direcciones comunes: 10.0.2.2, 10.0.3.2, 127.0.0.1
    // 5) si todo falla devuelve la original URLConfig.BACKEND_URL o null
    async function probeUrl(url, timeoutMs = 1200) {
        try {
            // Añadir cache buster
            const probeUrl = url + (url.includes('?') ? '&' : '?') + 'r=' + Date.now();
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);

            // use no-cors so CORS won't reject; network errors will reject
            await fetch(probeUrl, { method: 'GET', mode: 'no-cors', signal: controller.signal });
            clearTimeout(id);
            return true; // si fetch resolvió -> host accesible
        } catch (err) {
            return false;
        }
    }

    async function resolveBackendUrlCandidateList({ urlConfig, envOverrides } = {}) {
        // urlConfig = URLConfig (importado) o string
        // envOverrides = { devIpEnv, androidIpEnv, port }
        const candidates = [];

        // 1) previously saved by user or run
        const saved = localStorage.getItem('EXPORT_BACKEND_URL');
        if (saved) candidates.push(saved);

        // 2) explicit from URLConfig (si existe)
        if (typeof urlConfig === 'string') {
            candidates.push(urlConfig);
        } else if (urlConfig && urlConfig.BACKEND_URL) {
            candidates.push(urlConfig.BACKEND_URL);
        }

        // 3) env overrides passed in (useful at runtime)
        const devIp = envOverrides?.devIpEnv || (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_DEV_IP : null);
        const androidIp = envOverrides?.androidIpEnv || (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_ANDROID_IP : null);
        const port = envOverrides?.port || (typeof process !== 'undefined' ? process.env.REACT_APP_EXPORT_PORT : null) || '3002';
        const scheme = (envOverrides && envOverrides.forceHttps) ? 'http' : 'http';

        if (devIp) candidates.push(`${scheme}://${devIp}:${port}`);
        if (androidIp) candidates.push(`${scheme}://${androidIp}:${port}`);

        // 4) emulator / common fallbacks
        candidates.push(`${scheme}://10.0.2.2:${port}`);
        candidates.push(`${scheme}://10.0.3.2:${port}`); // genymotion
        candidates.push(`${scheme}://127.0.0.1:${port}`);
        candidates.push(`${scheme}://localhost:${port}`);

        // 5) unique: try to derive host from window.location (if not file://)
        if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.protocol && !window.location.protocol.startsWith('file')) {
            const host = window.location.hostname;
            candidates.unshift(`${window.location.protocol}//${host}:${port}`); // prefer same host if webpage served
        }

        // Remove duplicates while preserving order
        const seen = new Set();
        const uniq = candidates.filter(c => {
            if (!c) return false;
            if (seen.has(c)) return false;
            seen.add(c);
            return true;
        });

        // Probe sequentially with short timeout
        for (const c of uniq) {
            try {
                const ok = await probeUrl(c, 1200); // 1.2s each
                if (ok) {
                    // save for next time
                    try { localStorage.setItem('EXPORT_BACKEND_URL', c); } catch (_) { }
                    return c;
                }
            } catch (e) {
                // ignore and try next
            }
        }

        // nothing found
        return urlConfig?.BACKEND_URL ?? null;
    }

    function toArrayBuffer(file) {
        // Some Android WebViews don't provide file.arrayBuffer()
        if (file.arrayBuffer && typeof file.arrayBuffer === 'function') {
            return file.arrayBuffer();
        }
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onerror = () => { fr.abort(); reject(new Error('FileReader error')); };
            fr.onload = () => resolve(fr.result);
            fr.readAsArrayBuffer(file);
        });
    }
    //Abrir un archivo
    const handleFileOpen = async (file) => {

        const view = viewRef.current;
        if (!file || !view) return;

        //Control del tamaño del archivo
        const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

        if (file.size > MAX_BYTES) {
            const mb = (file.size / (1024 * 1024)).toFixed(1);
            window.alert(
                `El archivo pesa ${mb} MB, que supera el límite de 10 MB.\n` +
                `Por favor reduce su tamaño antes de cargarlo.`
            );

            // --- LOG: archivo rechazado por tamaño ---
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Open shapefile rejected",
                info: `Attempted to load "${file.name}" of ${mb} MB (>10 MB limit)`
            });

            return;
        }

        const newId = layerIdRef.current++;
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

        // --- LOG: start opening ---
        SCPOLogger.log({
            timestamp: new Date().toISOString(),
            credentials: 'omit',
            user: "Usuario1",
            action: "Open shapefile",
            info: `Started opening shapefile "${file.name}". Size: ${file.size} bytes.`
        });

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
            //const arrayBuffer = await file.arrayBuffer(); version original
            const arrayBuffer = await toArrayBuffer(file);
            const zip = await JSZip.loadAsync(arrayBuffer);


            // Leer encoding de .cpg (o UTF-8 por defecto)
            let encoding = "UTF-8";
            const cpgEntry = Object.keys(zip.files).find(n => n.toLowerCase().endsWith(".cpg"));
            if (cpgEntry) {
                const txt = (await zip.file(cpgEntry).async("string")).trim();
                encoding = txt || encoding;
            }



            // Parsear con shpjs
            const geojson = await shpjs(arrayBuffer, { encoding });

            // --- LOG: after parse ---
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Open shapefile",
                info: `Successfully parsed "${file.name}". ` +
                    `Features: ${geojson.features.length}. ` +
                    `Detected encoding: ${encoding}.`
            });

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




            // --- Recopilar estados ---
            geojson.features.forEach((f) => {
                estadosSet.add(detectarEstado(f.properties, fechaCampos));
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


            const buildStateColorMap = (estadosUnicos) => {
                const map = {};
                // 1) Extraemos solo los coreStates en orden:
                const coreStates = estadosUnicos.filter(e =>
                    e !== "Sin estado" &&
                    e.trim().toLowerCase() !== "liberado" &&
                    e.trim().toLowerCase() !== "rechazado"
                );
                const stateColorMap = {};
                coreStates.forEach((estado, i) => {
                    // i irá de 0,1,2… por cada estado detectado
                    map[estado.trim().toLowerCase()] = COLOR_PALETTE[i];
                });

                // 2) Liberado/Rechazado y Sin estado siempre a las posiciones fijas
                map["liberado"] = COLOR_PALETTE[12];
                map["rechazado"] = COLOR_PALETTE[13];
                map["sin estado"] = COLOR_SIN_ESTADO;

                return map;
            };

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


            // --- Detectar tipo de geometría ---
            const geomType0 = geojson.features[0]?.geometry?.type;
            let geometryType = "polygon";
            if (geomType0 === "Point") geometryType = "point";
            else if (geomType0 === "LineString" || geomType0 === "MultiLineString") geometryType = "polyline";


            const stateColorMap = buildStateColorMap(estadosUnicos);


            // Crea los únicosValueInfos usando el map recién construido
            // construyes tus uniqueValueInfos:
            const uniqueValueInfos = estadosUnicos.map(estado => {
                // Normalizamos la llave a minúsculas:
                const key = estado.toLowerCase();
                const rgb = stateColorMap[key] || COLOR_SIN_ESTADO;
                const fillColor = [...rgb, 0.5];
                const outlineColor = key === "sin estado"
                    ? [0, 0, 0, 1]
                    : [...rgb, 1];

                let symbol;
                if (geometryType === "point") {
                    symbol = {
                        type: "simple-marker",
                        size: "8px",
                        style: "circle",
                        color: fillColor,
                        outline: { color: outlineColor, width: 1 }
                    };
                } else if (geometryType === "polyline") {
                    symbol = {
                        type: "simple-line",
                        color: outlineColor,
                        width: 2
                    };
                } else {
                    symbol = {
                        type: "simple-fill",
                        color: fillColor,
                        outline: { color: outlineColor, width: 1.5 }
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
                objectIdField: "fid",
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
                        // handle Date, number, or ISO string all in one go:
                        expression: `
var v = $feature["${f.originalName}"];
if (IsEmpty(v)) {
  return "";
}
return Text(Date(v), "DD/MM/YYYY");
`
                    })),
                    content: [{
                        type: "fields",
                        fieldInfos: dynamicFields.map(fld => {
                            const fecha = fechaFields.find(x => x.originalName === fld.name);
                            if (fecha) {
                                return {
                                    fieldName: `expression/${fecha.exprName}`,
                                    label: fld.alias
                                };
                            }
                            return {
                                fieldName: fld.name,
                                label: fld.alias
                            };
                        })
                    }]
                }
            });
            featureLayer.source.on('addfeature', (e) => {
                const geom = e.feature.getGeometry();
                if (geom) geom.transform('EPSG:4326', 'EPSG:3857'); // Convierte si es necesario
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
                        const update = updates.find(u => u.featureId === feature.attributes.fid);
                        return {
                            attributes: {
                                fid: feature.attributes.fid,
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
            const oidField = featureLayer.objectIdField;
            for (let i = 0; i < total; i += batchSize) {
                const batch = allFeatures.slice(i, i + batchSize)
                    .map((f) => {
                        const geometry = convertGeometry(f.geometry);
                        if (!geometry) return null;

                        const propsRaw = f.properties || {};
                        const propsClean = {
                            fid: f.properties?.fid || f.attributes?.fid || f.id, // Prioriza el fid original
                            ...propsRaw
                        };
                        Object.entries(propsRaw).forEach(([key, value]) => {
                            if (value instanceof Date) {
                                const yr = value.getFullYear();
                                propsClean[key] = yr < 1900 ? null : value;
                            } else {
                                propsClean[key] = value;
                            }
                        });

                        // Asignar Estado
                        propsClean.Estado = detectarEstado(propsClean, fechaCampos);

                        return {
                            geometry,
                            attributes: { [oidField]: objectIdCounter++, ...propsClean },
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
                stateColors: stateColorMap,
                fechaCampos,
                etapaCampos,
                // Funciones de actualización
                updateFeatureState,
                batchUpdateFeatureStates,
                // Función para recalcular estado basado en fechas
                recalculateState: async (featureIds) => {
                    if (!Array.isArray(featureIds) || featureIds.length === 0) return;

                    await recalculateStatesInBatch(featureLayer, featureIds, fechaCampos);
                },
                cleanup: () => {
                    featureLayer.off("refresh", handleLayerUpdates);
                    featureLayer.off("edits", handleLayerUpdates);
                }
            };

            setLayers((prev) => [...prev, newEntry]);

        } catch (err) {
            SCPOLogger.log({
                timestamp: new Date().toISOString(),
                credentials: 'omit',
                user: "Usuario1",
                action: "Open shapefile error",
                info: `Error opening "${file.name}": ${err.message}`
            });
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
            view
                .goTo({
                    center: [-3.7038, 40.4168],
                    zoom: 5
                })
                .catch(err =>
                    console.error("Error al centrar en España tras limpiar:", err)
                );
        }
        // Limpiar estado React
        setLayers([]);
        layersRef.current = [];
        setSelectedCount(0);
        setMenuOpen(false);
    };
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
                onToggleStateVisibility={handleToggleStateVisibility}
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