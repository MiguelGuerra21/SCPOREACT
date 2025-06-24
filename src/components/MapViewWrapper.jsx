// src/components/MapViewWrapper.jsx
import React, { useEffect, useRef } from "react";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Extent from "@arcgis/core/geometry/Extent";
import Graphic from "@arcgis/core/Graphic";

const MapViewWrapper = ({
  layersRef,
  setSelectedCount,
  onViewReady,
  initialViewRefs,
}) => {
  const mapDiv = useRef(null);
  const dragHandleRef = useRef(null);
  const clickHandleRef = useRef(null);

  useEffect(() => {
    if (!mapDiv.current) return;

    // 1. Crear el MapView una sola vez
    const map = new Map({ basemap: "streets-vector" });
    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [-100, 40],
      zoom: 4,
    });

    // Cuando el view está listo:
    view.when(() => {
      // Notificar al contenedor (AppContainer) solo una vez
      if (typeof onViewReady === "function") {
        onViewReady(view);
      }
      // Capturar estado inicial en refs
      if (initialViewRefs) {
        // center
        if (view.center && view.center.clone) {
          initialViewRefs.centerRef.current = view.center.clone();
        } else {
          initialViewRefs.centerRef.current = view.center;
        }
        // zoom
        initialViewRefs.zoomRef.current = view.zoom;
        // extent
        if (view.extent && view.extent.clone) {
          initialViewRefs.extentRef.current = view.extent.clone();
        }
      }
      // Quitar widget Zoom
      view.ui.remove("zoom");

      // Box-selection (SHIFT+drag)
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
              // Query y resaltar en cada capa visible
              let total = 0;
              for (let entry of layersRef.current) {
                const { layerView, visible, highlightHandle } = entry;
                if (visible && layerView) {
                  try {
                    const q = layerView.createQuery();
                    q.geometry = queryExt;
                    const result = await layerView.queryFeatures(q);
                    const ids = result.features.map(
                      (f) => f.attributes.OBJECTID
                    );
                    entry.selectedIds = ids;
                    if (highlightHandle) {
                      highlightHandle.remove();
                    }
                    if (ids.length) {
                      entry.highlightHandle = layerView.highlight(
                        result.features
                      );
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

    // Registrar CTRL+click (selección acumulativa)
    if (!clickHandleRef.current) {
      const clickHandle = view.on("click", async (event) => {
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
              entry.highlightHandle = entry.layerView.highlight(
                resultSel.features
              );
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
      });
      clickHandleRef.current = clickHandle;
    }

    // Cleanup: se ejecuta solo al desmontar MapViewWrapper
    return () => {
      // Remover handlers
      if (dragHandleRef.current) {
        dragHandleRef.current.remove();
        dragHandleRef.current = null;
      }
      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }
      // Destruir view
      view.destroy();
    };
    // <-- IMPORTANTE: deps vacío para que solo se ejecute una vez al montar
  }, []); // <<-- array de dependencias vacío

  return (
    <div
      ref={mapDiv}
      style={{ width: "100%", height: "calc(100vh - 37px)" }}
    />
  );
};

export default MapViewWrapper;
