// src/components/MapViewWrapper.jsx
import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Extent from "@arcgis/core/geometry/Extent";
import Graphic from "@arcgis/core/Graphic";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import Basemap from "@arcgis/core/Basemap";
import { FaCog } from "react-icons/fa";
import { FaPlugCircleXmark, FaPlugCircleCheck } from "react-icons/fa6";
import styles from './MapViewWrapper.module.css';

const LODS = [
  { level: 0,  resolution: 156543.033928, scale: 591657527.591555 },
  { level: 1,  resolution: 78271.516964,  scale: 295828763.795777 },
  { level: 2,  resolution: 39135.758482,  scale: 147914381.897889 },
  { level: 3,  resolution: 19567.879241,  scale: 73957190.948944 },
  { level: 4,  resolution: 9783.9396205, scale: 36978595.474472 },
  { level: 5,  resolution: 4891.96981025, scale: 18489297.737236 },
  { level: 6,  resolution: 2445.98490513, scale: 9244648.868618 },
  { level: 7,  resolution: 1222.99245256, scale: 4622324.434309 },
  { level: 8,  resolution: 611.496226281, scale: 2311162.217155 },
  { level: 9,  resolution: 305.748113141, scale: 1155581.108577 },
  { level: 10, resolution: 152.87405657,  scale: 577790.554289 },
  { level: 11, resolution: 76.4370282852, scale: 288895.277144 },
  { level: 12, resolution: 38.2185141426, scale: 144447.638572 },
  { level: 13, resolution: 19.1092570713, scale: 72223.819286 },
  { level: 14, resolution: 9.55462853565, scale: 36111.909643 },
  { level: 15, resolution: 4.77731426782, scale: 18055.954822 },
  { level: 16, resolution: 2.38865713391, scale: 9027.977411 },
  { level: 17, resolution: 1.19432856696, scale: 4513.988705 },
  { level: 18, resolution: 0.597164283478, scale: 2256.994353 },
  { level: 19, resolution: 0.298582141739, scale: 1128.497176 },
  { level: 20, resolution: 0.149291070869, scale: 564.248588 },
  { level: 21, resolution: 0.0746455354345, scale: 282.124294 },
  { level: 22, resolution: 0.0373227677173, scale: 141.062147 },
  { level: 23, resolution: 0.0186613838586, scale: 70.5310735 },
];

const MapViewWrapper = ({
  layersRef,
  setSelectedCount,
  onViewReady,
  initialViewRefs,
}) => {
  const mapDiv = useRef(null);
  const dragHandleRef = useRef(null);
  const clickHandleRef = useRef(null);

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [onlineMode, setOnlineMode] = useState(false);
  const [showModeOptions, setShowModeOptions] = useState(false);
  const mapRef = useRef(null);
  const viewRef = useRef(null);
  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;
  const shiftPressedRef = useRef(false);
  const platform = Capacitor.getPlatform();
  const isAndroid = Capacitor.getPlatform() === 'android';

  const clearBasemap = (map) => {
    try {
      // Asignar basemap nulo para limpiar
      map.basemap = null;
    } catch (e) {
      console.warn("clearBasemap:", e);
    }
  };

const createBlankTileLayer = () => {
  const hasWindow = typeof window !== "undefined" && window.location;
  const origin = hasWindow && window.location.protocol !== "file:" ? window.location.origin : "";

  // Normaliza PUBLIC_URL (quita '.' './' y slashes finales)
  let publicUrlRaw = (process.env.PUBLIC_URL || "").trim();
  if (publicUrlRaw === "." || publicUrlRaw === "./") publicUrlRaw = "";
  // quitar slashes finales
  publicUrlRaw = publicUrlRaw.replace(/\/+$/g, "");
  // asegurar prefijo slash si no vacío
  const publicUrl = publicUrlRaw ? (publicUrlRaw.startsWith("/") ? publicUrlRaw : `/${publicUrlRaw}`) : "";

  // ruta relativa segura
  const relativePath = `${publicUrl || ""}/tiles/blank.png`.replace(/\/\/+/g, "/");
  // usar new URL para concatenar sin errores (si origin existe)
  const baseUrl = origin ? new URL(relativePath, origin).href : relativePath;

  // Añadir placeholders en query string para que WebTileLayer acepte la plantilla
  // (el server devolverá siempre el mismo blank.png aunque los params cambien)
  const urlTemplate = `${baseUrl}?z={level}&x={col}&y={row}`;

  console.debug("[MapView] createBlankTileLayer -> urlTemplate:", urlTemplate, { origin, publicUrlRaw, relativePath, baseUrl });

  const wt = new WebTileLayer({
    urlTemplate,
    subDomains: [],
    tileInfo: {
      size: 256,
      dpi: 96,
      format: "png",
      origin: { x: -20037508.342787, y: 20037508.342787 },
      spatialReference: { wkid: 102100 },
      lods: LODS,
    },
  });

  return wt;
};



  const changeMode = (isOnline) => {
    if (!mapRef.current || !viewRef.current) return;

    setOnlineMode(isOnline);
    setShowModeOptions(false);

    clearBasemap(mapRef.current);

    if (isOnline) {
  try {
    mapRef.current.basemap = Basemap.fromId("streets-navigation-vector");
  } catch (err) {
    console.warn("Basemap.fromId falló (quizá offline):", err);
    mapRef.current.basemap = null;
  }

  const doGoToSpain = () => {
    if (layersRef.current?.filter(e => e.layer.type === "feature").length === 0) {
      viewRef.current.goTo({ center: [-3.7038, 40.4168], zoom: 5 }).catch((err) => {
        console.warn("goTo Spain falló:", err);
      });
    }
  };

  if (viewRef.current) {
    // ya tenemos la vista
    viewRef.current.when(() => {
      setTimeout(doGoToSpain, 500);
    });
  } else {
    // todavía no existe la vista → esperar un poco y reintentar
    const checkInterval = setInterval(() => {
      if (viewRef.current) {
        clearInterval(checkInterval);
        viewRef.current.when(() => {
          setTimeout(doGoToSpain, 500);
        });
      }
    }, 200);
  }
}else {
      // Modo offline - blank tile, carga robusta con fallback
      const tileLayer = createBlankTileLayer();

      tileLayer.load()
        .then(() => {
          console.info("[MapView] blank tile loaded OK for template:", tileLayer.urlTemplate || "(unknown)");
          if (mapRef.current) {
            mapRef.current.basemap = new Basemap({ baseLayers: [tileLayer] });
          } else {
            console.warn("[MapView] mapRef.current no disponible al asignar basemap");
          }
        })
        .catch((err) => {
          console.error("[MapView] WebTileLayer.load() failed for template:", tileLayer.urlTemplate, err);
          // fallback seguro usando mapRef.current
          try {
            if (mapRef.current) {
              mapRef.current.basemap = new Basemap({ baseLayers: [] });
            } else {
              console.warn("[MapView] mapRef.current no disponible para fallback basemap");
            }
          } catch (e) {
            console.error("[MapView] Error asignando basemap vacío:", e);
          }
        });
    }
  };

  // Shift press handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Shift") shiftPressedRef.current = true;
    };
    const handleKeyUp = (e) => {
      if (e.key === "Shift") shiftPressedRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModeOptions && !event.target.closest(".mode-selector-container")) {
        setShowModeOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showModeOptions]);

  // Init map & view (run once)
  useEffect(() => {
    if (!mapDiv.current) return;

    // 1. Mapa vacío
    const map = new Map({ basemap: null });
    mapRef.current = map;

    // 2. Blank tileLayer robusto
    const tileLayer = createBlankTileLayer();

    tileLayer.load()
      .then(() => {
        map.basemap = new Basemap({ baseLayers: [tileLayer] });
      })
      .catch((err) => {
        console.warn("tileLayer init load fail:", err);
        try {
          map.basemap = new Basemap({ baseLayers: [] });
        } catch (e) {
          map.basemap = null;
        }
      });

    // 3. Crea la vista
    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [0, 0],
      zoom: 0,
      constraints: {
        minZoom: 2,
        maxZoom: 23,
        snapToZoom: true,
      },
    });
    viewRef.current = view;

    view.when(() => {
      onViewReady?.(view);
      view.on && view.on("layerview-create-error", (evt) => {
        console.error("[MapView] layerview-create-error:", evt && evt.error ? evt.error : evt);
      });
      if (initialViewRefs) {
        // Protege clones ante undefined
        try {
          initialViewRefs.centerRef.current = view.center?.clone ? view.center.clone() : view.center;
          initialViewRefs.zoomRef.current = view.zoom;
          initialViewRefs.extentRef.current = view.extent?.clone ? view.extent.clone() : view.extent;
        } catch (e) {
          console.warn("Error guardando initialViewRefs:", e);
        }
      }

      // Quitar widget Zoom
      try { view.ui.remove("zoom"); } catch (e) { /* ignore */ }

      // Desactivar auto open del popup
      if (view.popup) view.popup.autoOpenEnabled = false;

      // BOX-SELECTION
      let dragOrigin = null;
      let boxGraphic = null;

      dragHandleRef.current = view.on("drag", async (event) => {
        const wantsBox =
          event.button === 0 &&
          ((["web", "electron"].includes(platform) && shiftPressedRef.current) ||
            (["android", "ios"].includes(platform) && multiSelectModeRef.current));

        if (!wantsBox) {
          if (boxGraphic) {
            view.graphics.remove(boxGraphic);
            boxGraphic = null;
            dragOrigin = null;
          }
          return;
        }

        event.stopPropagation();

        if (event.action === "start") {
          dragOrigin = [event.x, event.y];
          const p = view.toMap({ x: event.x, y: event.y });
          const initRings = Array(5).fill([p.x, p.y]);
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
          const rings = [
            [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
            [Math.min(p1.x, p2.x), Math.max(p1.y, p2.y)],
            [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
            [Math.max(p1.x, p2.x), Math.min(p1.y, p2.y)],
            [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
          ];
          boxGraphic.geometry = {
            type: "polygon",
            rings: [rings],
            spatialReference: view.spatialReference,
          };
        } else if (event.action === "end" && dragOrigin) {
          view.graphics.remove(boxGraphic);
          boxGraphic = null;

          const [x0, y0] = dragOrigin;
          const [x1, y1] = [event.x, event.y];
          const p1 = view.toMap({ x: x0, y: y0 });
          const p2 = view.toMap({ x: x1, y: y1 });
          const queryExt = new Extent({
            xmin: Math.min(p1.x, p2.x),
            ymin: Math.min(p1.y, p2.y),
            xmax: Math.max(p1.x, p2.x),
            ymax: Math.max(p1.y, p2.y),
            spatialReference: view.spatialReference,
          });

          let total = 0;
          for (let entry of layersRef.current) {
            const { layerView, visible, highlightHandle } = entry;
            if (visible && layerView) {
              try {
                const q = layerView.createQuery();
                q.geometry = queryExt;
                const result = await layerView.queryFeatures(q);
                const ids = result.features.map((f) => f.attributes.fid);
                entry.selectedIds = ids;
                highlightHandle?.remove();
                entry.highlightHandle = ids.length ? layerView.highlight(result.features) : null;
                total += ids.length;
              } catch (err) {
                console.error("Error en box-selection:", err);
              }
            } else {
              entry.highlightHandle?.remove();
              entry.highlightHandle = null;
              entry.selectedIds = [];
            }
          }
          setSelectedCount(total);
          dragOrigin = null;
        }
      });

      // CLICK MULTIPLE (Ctrl+Click o multiSelectMode)
      clickHandleRef.current = view.on("click", async (event) => {
        const wantsSelectionClick =
          (["web", "electron"].includes(platform) && event.native?.ctrlKey) ||
          (["android", "ios"].includes(platform) && multiSelectModeRef.current);

        if (wantsSelectionClick) {
          event.stopPropagation();
          const hit = await view.hitTest(event);
          if (!hit.results.length) return;
          const result = hit.results.find((r) =>
            layersRef.current.some((e) => e.layerView && r.graphic.layer === e.layer)
          );
          if (!result) return;

          const graphic = result.graphic;
          const entry = layersRef.current.find((e) => e.layer === graphic.layer);
          if (!entry) return;

          const oid = graphic.getAttribute("fid");
          if (oid == null) return;

          const prevIds = entry.selectedIds || [];
          const newIds = prevIds.includes(oid) ? prevIds.filter((id) => id !== oid) : [...prevIds, oid];

          entry.selectedIds = newIds;
          entry.highlightHandle?.remove();

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

          // recalcular total
          let total = 0;
          for (let e of layersRef.current) {
            if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
          }
          setSelectedCount(total);
          return; // no abrir popup
        }

        // click normal -> popup
        const hit = await view.hitTest(event);
        if (!hit.results.length) return;
        const result = hit.results.find((r) =>
          layersRef.current.some((e) => e.layerView && r.graphic.layer === e.layer)
        );
        if (!result) return;

        const graphic = result.graphic;
        view.popup.open({
          features: [graphic],
          location: event.mapPoint,
        });
      });
    });

    // Cleanup on unmount
    return () => {
      try {
        dragHandleRef.current?.remove();
      } catch (e) {}
      try {
        clickHandleRef.current?.remove();
      } catch (e) {}
      try {
        viewRef.current?.destroy();
      } catch (e) {}
      viewRef.current = null;
      mapRef.current = null;
    };
  }, []); // init only once

  return (
    <>
      {["android", "ios"].includes(platform) && (
        <button
          onClick={() => setMultiSelectMode(!multiSelectMode)}
          className={styles.multiSelectButton}
          style={{backgroundColor: multiSelectMode ? "#007AFF" : "#ccc"}}
        >
          {multiSelectMode ? "Modo Normal" : "Multiselección"}
        </button>
      )}

      {/* Nuevo botón de modo online/offline */}
      <div className={`mode-selector-container ${styles.selectorContainer}`}>
        {showModeOptions && (
          <div className={styles.selectorOn}>
            <div className={styles.selectorOfflineOff} style={{backgroundColor: !onlineMode ? "#f0f0f0" : "transparent"}} onClick={() => changeMode(false)}>
              <FaPlugCircleXmark size={20} className={styles.iconOffline} />
              <span>Modo Offline</span>
              {!onlineMode && (
                <div className={styles.offlineDot} />
              )}
            </div>
            <div className={styles.selectorOnlineOff} style={{backgroundColor: onlineMode ? "#f0f0f0" : "transparent",}} onClick={() => changeMode(true)}
            >
              <FaPlugCircleCheck size={20} className={styles.iconOnline} />
              <span>Modo Online</span>
              {onlineMode && (
                <div className={styles.onlineDot} />
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowModeOptions(!showModeOptions)}
          className={styles.modeButton}
          title="Cambiar modo de mapa"
        >
          <FaCog size={20} />
        </button>
      </div>

      <div ref={mapDiv} className={styles.mapWindow} />
    </>
  );
};

export default MapViewWrapper;
