import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";

const MAPBOX_TOKEN = (import.meta.env as Record<string, string | undefined>)["VITE_MAPBOX_TOKEN"];
const DOHA_CENTER: [number, number] = [51.531, 25.2854];

/**
 * Staff-facing coordinate picker: shared by the property and development
 * drawers. Shows a draggable Q-Bay-branded marker at the current lat/long;
 * clicking or dragging updates the numeric fields via onChange. Coordinate
 * entry stays the source of truth - this is just a faster way to set it.
 */
export function MapboxPicker({
  latitude,
  longitude,
  onChange,
  className,
  readOnly = false,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
  /** View-only preview (property/development detail pages) - no click-to-place, no drag. */
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    if (readOnly && (latitude == null || longitude == null)) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const hasCoords = latitude != null && longitude != null;
    const center: [number, number] = hasCoords ? [longitude!, latitude!] : DOHA_CENTER;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center,
      zoom: hasCoords ? 14 : 9,
      dragRotate: false,
      pitchWithRotate: false,
      scrollZoom: !readOnly,
      attributionControl: true,
    });
    mapRef.current = map;
    if (!readOnly) map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const el = document.createElement("div");
    el.style.width = "20px";
    el.style.height = "20px";
    el.style.borderRadius = "50%";
    el.style.background = "#0A4623";
    el.style.border = "3px solid #C9BA9E";
    el.style.boxShadow = "0 1px 6px rgba(0,0,0,0.4)";
    el.style.cursor = readOnly ? "default" : "grab";

    const marker = new mapboxgl.Marker({ element: el, draggable: !readOnly }).setLngLat(center);
    if (hasCoords) marker.addTo(map);
    markerRef.current = marker;

    if (!readOnly) {
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLngLat();
        onChangeRef.current?.(lat, lng);
      });

      map.on("click", (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        onChangeRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise once; external lat/long edits are synced below, not by re-creating the map
  }, []);

  // Keep the marker in sync if lat/long change from the numeric inputs directly.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (latitude == null || longitude == null) {
      marker.remove();
      return;
    }
    marker.setLngLat([longitude, latitude]).addTo(map);
    map.easeTo({ center: [longitude, latitude] });
  }, [latitude, longitude]);

  if (!MAPBOX_TOKEN || (readOnly && (latitude == null || longitude == null))) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-canvas px-4 py-8 text-center ${className ?? ""}`}>
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {!MAPBOX_TOKEN
            ? "Set VITE_MAPBOX_TOKEN to enable the map picker - coordinates can still be entered manually above."
            : "No coordinates set yet."}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full rounded-lg" />
      {!readOnly && <p className="mt-1.5 text-[11px] text-muted-foreground">Click the map to place the marker, or drag it to adjust.</p>}
    </div>
  );
}
