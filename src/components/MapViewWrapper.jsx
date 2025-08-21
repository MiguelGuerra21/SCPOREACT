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

const MapViewWrapper = ({
  layersRef,
  setSelectedCount,
  onViewReady,
  initialViewRefs,
}) => {
  const mapDiv = useRef(null);
  const dragHandleRef = useRef(null);
  const clickHandleRef = useRef(null);

  // Estado para el modo multi-selección y su ref
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [onlineMode, setOnlineMode] = useState(false);
  const [showModeOptions, setShowModeOptions] = useState(false);
  const mapRef = useRef(null);
  const viewRef = useRef(null);
  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;
  const shiftPressedRef = useRef(false); //estado global de la tecla Shift
  // Detectamos la plataforma (una sola vez)
  const platform = Capacitor.getPlatform();
  const isAndroid = Capacitor.getPlatform() === 'android';

  // Función para cambiar el modo
  const changeMode = (isOnline) => {
    if (!mapRef.current || !viewRef.current) return;
    
    setOnlineMode(isOnline);
    setShowModeOptions(false);
    
  // elimina capas base actuales
  mapRef.current.basemap?.baseLayers.toArray().forEach(l =>
    mapRef.current.basemap.baseLayers.remove(l)
  );
    
    if (isOnline) {
      // 1) Asigna el basemap online
      mapRef.current.basemap = Basemap.fromId("streets-navigation-vector");
      // Solo si no hay capas cargadas, hacemos zoom a Españita
    if (layersRef.current.length === 0) {
      setTimeout(() => {
        viewRef.current.goTo({
          center: [-3.7038, 40.4168], // Madrid
          zoom: 5
        }).catch(err => console.warn("goTo Spain falló:", err));
      }, 500);
    }
    } else {
      // Modo offline - cargar mapa blanco
      const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '')   ;
      const isAndroid = Capacitor.getPlatform() === 'android';
      const urlTemplate = `${publicUrl ? publicUrl + '/' : ''}tiles/blank.png`;

      const lastUrl = isAndroid
        ? `${publicUrl}/tiles/blank.png`  // En Android (Capacitor WebView) usar ruta relativa
        : `${window.location.origin}${publicUrl}/tiles/blank.png`; // En navegador usar origin

        console.log("[MapViewWrapper] Modo offline activado, cargando mapa blanco desde:", urlTemplate);

      const tileLayer = new WebTileLayer({
        urlTemplate: urlTemplate,
        subDomains: [],
        tileInfo: {
          size: 256,
          dpi: 96,
          format: "png",
          origin: {
            x: -20037508.342787,
            y: 20037508.342787,
          },
          spatialReference: {
            wkid: 102100
          },
          lods: [
            { level: 0,  resolution: 156543.033928, scale: 591657527.591555 },
            { level: 1,  resolution: 78271.516964,  scale: 295828763.795777 },
            { level: 2,  resolution: 39135.758482,  scale: 147914381.897889 },
            { level: 3,  resolution: 19567.879241,  scale: 73957190.948944 },
            { level: 4,  resolution: 9783.9396205,  scale: 36978595.474472 },
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
            {level: 21, resolution: 0.0746455354345, scale: 282.124294 },
            {level: 22, resolution: 0.0373227677173, scale: 141.062147 },
            { level: 23, resolution: 0.0186613838586, scale: 70.5310735 },
          ]
        }
      });
      
      mapRef.current.basemap = new Basemap({
        baseLayers: [tileLayer]
      });
    }
  };

  // Selección con Shift
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

  // Efecto para cerrar el menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModeOptions && !event.target.closest('.mode-selector-container')) {
        setShowModeOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showModeOptions]);

  // Efecto para inicializar el mapa y la vista
  useEffect(() => {
    if (!mapDiv.current) return;

    // 1. Mapa VACÍO (modo offline por defecto)
    const map = new Map({ basemap: null });
    mapRef.current = map; // Guardar referencia al mapa

    // 2. Cargar mapa blanco (modo offline)
    const host = window.location.origin;            
    const publicUrl = process.env.PUBLIC_URL || ""; 
    const urlTemplate = `${host}${publicUrl}/tiles/blank.png`;

    const tileLayer = new WebTileLayer({
      urlTemplate: urlTemplate,
      subDomains: [], // evita que intente usar dominios estilo a,b,c
      tileInfo: {
        size: 256,
        dpi: 96,
        format: "png",
        origin: {
          x: -20037508.342787,
          y: 20037508.342787,
        },
        spatialReference: {
          wkid: 102100
        },
        lods: [
          { level: 0,  resolution: 156543.033928, scale: 591657527.591555 },
          { level: 1,  resolution: 78271.516964,  scale: 295828763.795777 },
          { level: 2,  resolution: 39135.758482,  scale: 147914381.897889 },
          { level: 3,  resolution: 19567.879241,  scale: 73957190.948944 },
          { level: 4,  resolution: 9783.9396205,  scale: 36978595.474472 },
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
          {level: 21, resolution: 0.0746455354345, scale: 282.124294 },
          {level: 22, resolution: 0.0373227677173, scale: 141.062147 },
          { level: 23, resolution: 0.0186613838586, scale: 70.5310735 },
        ]
      }
    });
    map.basemap = new Basemap({
      baseLayers: [tileLayer]
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
        snapToZoom: true
      }
    });
    viewRef.current = view;

    view.when(() => {
      // Notificar al contenedor
      onViewReady?.(view);

      // Guardar estado inicial
      if (initialViewRefs) {
        initialViewRefs.centerRef.current = view.center.clone
          ? view.center.clone()
          : view.center;
        initialViewRefs.zoomRef.current = view.zoom;
        initialViewRefs.extentRef.current = view.extent.clone
          ? view.extent.clone()
          : view.extent;
      }

      // Quitar widget Zoom
      view.ui.remove("zoom");

      //Desactivar auto open del popup
      view.popup.autoOpenEnabled = false;

      // ——— BOX-SELECTION ———
      let dragOrigin = null;
      let boxGraphic = null;

      dragHandleRef.current = view.on("drag", async (event) => {
        const wantsBox =
          event.button === 0 &&
          (
            (["web", "electron"].includes(platform) && shiftPressedRef.current) ||
            (["android", "ios"].includes(platform) && multiSelectModeRef.current)
          );

        if (!wantsBox) {
          // Cancelar gráfico si se suelta shift antes del mouse
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

          // Query y resaltar en cada capa visible
          let total = 0;
          for (let entry of layersRef.current) {
            const { layerView, visible, highlightHandle } = entry;
            if (visible && layerView) {
              try {
                const q = layerView.createQuery();
                q.geometry = queryExt;
                const result = await layerView.queryFeatures(q);
                const ids = result.features.map(f => f.attributes.fid);
                entry.selectedIds = ids;
                highlightHandle?.remove(); 
                entry.highlightHandle = ids.length
                 ? layerView.highlight(result.features) 
                 : null;
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

      // ——— CLICK MÚLTIPLE (Ctrl+Click o multiSelectMode) ———
      clickHandleRef.current = view.on("click", async (event) => {
        const wantsSelectionClick =
          (["web", "electron"].includes(platform) && event.native.ctrlKey) ||
          (["android", "ios"].includes(platform) && multiSelectModeRef.current);

        // if it’s a Ctrl+Click (or mobile multiselect), only do highlight toggling
        if (wantsSelectionClick) {
          event.stopPropagation();

          const hit = await view.hitTest(event);
          if (!hit.results.length) return;
          const result = hit.results.find(r =>
            layersRef.current.some(e => e.layerView && r.graphic.layer === e.layer)
          );
          if (!result) return;

          const graphic = result.graphic;
          const entry = layersRef.current.find(e => e.layer === graphic.layer);
          if (!entry) return;

          const oid = graphic.getAttribute("fid");
          if (oid == null) return;

          const prevIds = entry.selectedIds || [];
          const newIds = prevIds.includes(oid)
            ? prevIds.filter(id => id !== oid)
            : [...prevIds, oid];

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

          // recalculate total
          let total = 0;
          for (let e of layersRef.current) {
            if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
          }
          setSelectedCount(total);

          return; // do NOT open popup
        }

        // otherwise it’s a normal click → show popup
        const hit = await view.hitTest(event);
        if (!hit.results.length) return;
        const result = hit.results.find(r =>
          layersRef.current.some(e => e.layerView && r.graphic.layer === e.layer)
        );
        if (!result) return;

        const graphic = result.graphic;
        view.popup.open({
          features: [graphic],
          location: event.mapPoint
        });
      });
    });

    // Cleanup al desmontar
    return () => {
      dragHandleRef.current?.remove();
      clickHandleRef.current?.remove();
      view.destroy();
    };
  }, []); // <-- vacío para inicializar solo una vez

  return (
    <>
      {/* Botón de multiselección solo en móvil */}
      {["android", "ios"].includes(platform) && (
        <button
          onClick={() => setMultiSelectMode(!multiSelectMode)}
          style={{
            position: "absolute", 
            right: 20, 
            top: "220px", 
            zIndex: 1002,
            padding: "10px 15px", 
            borderRadius: "20px",
            backgroundColor: multiSelectMode ? "#007AFF" : "#ccc",
            color: "white", 
            border: "none", 
            fontWeight: "bold",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {multiSelectMode ? "Modo Normal" : "Multiselección"}
        </button>
      )}

      {/* Nuevo botón de modo online/offline */}
      <div className="mode-selector-container" style={{
        position: "absolute",
        right: "20px",
        bottom: "20px",
        zIndex: 1002,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end"
      }}>
        {showModeOptions && (
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "10px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
            marginBottom: "10px",
            width: "180px"
          }}>
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                cursor: "pointer",
                backgroundColor: !onlineMode ? "#f0f0f0" : "transparent",
                borderRadius: "4px"
              }}
              onClick={() => changeMode(false)}
            >
              <FaPlugCircleXmark style={{ marginRight: "8px", color: "#666" }} />
              <span>Modo Offline</span>
              {!onlineMode && (
                <div style={{
                  marginLeft: "auto",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: "#007AFF"
                }} />
              )}
            </div>
            <div 
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
                cursor: "pointer",
                backgroundColor: onlineMode ? "#f0f0f0" : "transparent",
                borderRadius: "4px",
                marginTop: "4px"
              }}
              onClick={() => changeMode(true)}
            >
              <FaPlugCircleCheck style={{ marginRight: "8px", color: "#666", size: "lg" }} />
              <span>Modo Online</span>
              {onlineMode && (
                <div style={{
                  marginLeft: "auto",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  backgroundColor: "#007AFF"
                }} />
              )}
            </div>
          </div>
        )}
        
        <button
          onClick={() => setShowModeOptions(!showModeOptions)}
          style={{
            padding: "10px",
            borderRadius: "50%",
            backgroundColor: "#fff",
            color: "#007AFF",
            border: "none",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "40px",
            height: "40px"
          }}
          title="Cambiar modo de mapa"
        >
          <FaCog size={20} />
        </button>
      </div>

      <div ref={mapDiv} style={{ width: "100%", height: "calc(100vh - 35px)" }} />
    </>
  );
};

export default MapViewWrapper;
