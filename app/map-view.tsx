'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  type Coordinate,
  type GraphData,
  type Poi,
  type Route,
} from '@/lib/recommender';
import { courseDirections, type MapPosition } from '@/lib/navigation';

type Props = {
  graph: GraphData;
  origin: Coordinate;
  destination: Poi | null;
  routes: Pick<Route, 'geometry'>[];
  navigation?: boolean;
  directionUntil?: number;
  location?: MapPosition | null;
  follow?: boolean;
  overviewRequest?: number;
  onPan?: () => void;
  selected: number;
  picking: boolean;
  onOrigin: (point: Coordinate) => void;
  onSelect: (index: number) => void;
};
export default function MapView(props: Props) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null),
    api = useRef<typeof Leaflet | null>(null),
    locationLayer = useRef<Leaflet.LayerGroup | null>(null);
  const movingMap = useRef(false);
  const current = useRef(props);
  useEffect(() => {
    current.current = props;
  }, [props]);
  const [ready, setReady] = useState(false),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    let disposed = false,
      observer: ResizeObserver | undefined;
    import('leaflet')
      .then((L) => {
        if (disposed || !element.current) return;
        api.current = L;
        const m = L.map(element.current, {
          preferCanvas: true,
          zoomControl: false,
        });
        map.current = m;
        const [w, s, e, n] = props.graph.bbox;
        m.fitBounds([
          [s, w],
          [n, e],
        ]);
        m.setMaxBounds([
          [s - 0.04, w - 0.04],
          [n + 0.04, e + 0.04],
        ]);
        L.control.zoom({ position: 'bottomright' }).addTo(m);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
          .on('tileerror', () => setTileError(true))
          .addTo(m);
        const nodes = new Map(props.graph.nodes.map((node) => [node.id, node]));
        L.polyline(
          props.graph.edges.map((edge) => {
            const a = nodes.get(edge.from)!,
              b = nodes.get(edge.to)!;
            return [
              [a.lat, a.lon],
              [b.lat, b.lon],
            ] as Leaflet.LatLngTuple[];
          }),
          { color: '#789276', weight: 1, opacity: 0.1, interactive: false },
        ).addTo(m);
        layer.current = L.layerGroup().addTo(m);
        locationLayer.current = L.layerGroup().addTo(m);
        m.on('dragstart zoomstart', () => {
          if (!movingMap.current) current.current.onPan?.();
        });
        m.on('click', (e) => {
          if (current.current.picking)
            current.current.onOrigin([e.latlng.lng, e.latlng.lat]);
        });
        observer = new ResizeObserver(() => m.invalidateSize());
        observer.observe(element.current);
        setReady(true);
      })
      .catch(() => setTileError(true));
    return () => {
      disposed = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, [props.graph]);
  useEffect(() => {
    const L = api.current,
      m = map.current,
      group = layer.current;
    if (!ready || !L || !m || !group) return;
    group.clearLayers();
    const latLng = (c: Coordinate): Leaflet.LatLngTuple => [c[1], c[0]];
    const drawOrder = props.routes
      .map((route, i) => ({ route, i }))
      .sort(
        (a, b) =>
          Number(a.i === props.selected) - Number(b.i === props.selected),
      );
    for (const { route, i } of drawOrder) {
      const active = i === props.selected;
      if (active)
        L.polyline(route.geometry.map(latLng), {
          color: '#fff',
          weight: 9,
          opacity: 0.95,
          interactive: false,
        }).addTo(group);
      L.polyline(route.geometry.map(latLng), {
        color: active ? '#284d35' : ['#284d35', '#71a671', '#a1b997'][i % 3],
        weight: active ? 5 : 3,
        opacity: active ? 1 : 0.4,
      })
        .on('click', () => current.current.onSelect(i))
        .addTo(group);
      if (active && props.navigation) {
        for (const { point, bearing } of courseDirections(
          route.geometry,
          props.directionUntil,
        )) {
          L.marker(latLng(point), {
            interactive: false,
            icon: L.divIcon({
              className: 'course-direction',
              html: `<svg viewBox="0 0 20 20" style="transform:rotate(${bearing}deg)" aria-hidden="true"><path d="M4 13 L10 7 L16 13"/></svg>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
          }).addTo(group);
        }
      }
    }
    const marker = (point: Coordinate, label: string) =>
      L.marker(latLng(point), {
        icon: L.divIcon({
          className: 'route-marker',
          html: `<span>${label}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      }).addTo(group);
    marker(props.origin, 'A');
    if (props.destination)
      marker([props.destination.lon, props.destination.lat], 'B');
    const active = props.routes[props.selected];
    const bounds = active?.geometry.length
      ? active.geometry.map(latLng)
      : [
          latLng(props.origin),
          ...(props.destination
            ? [
                [
                  props.destination.lat,
                  props.destination.lon,
                ] as Leaflet.LatLngTuple,
              ]
            : []),
        ];
    if (bounds.length) {
      movingMap.current = true;
      try {
        m.fitBounds(L.latLngBounds(bounds), {
          paddingTopLeft: props.navigation ? [35, 55] : [40, 100],
          paddingBottomRight: props.navigation ? [60, 80] : [65, 75],
          maxZoom: 16,
          animate: false,
        });
      } finally {
        movingMap.current = false;
      }
    }
  }, [
    props.routes,
    props.selected,
    props.origin,
    props.destination,
    props.navigation,
    props.directionUntil,
    props.overviewRequest,
    ready,
  ]);
  useEffect(() => {
    const L = api.current,
      m = map.current,
      group = locationLayer.current;
    if (!ready || !L || !m || !group) return;
    group.clearLayers();
    if (!props.location) return;
    const { point, accuracy } = props.location,
      center: Leaflet.LatLngTuple = [point[1], point[0]];
    L.circle(center, {
      radius: accuracy,
      color: '#3675da',
      weight: 1,
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(group);
    L.marker(center, {
      interactive: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: 'live-location-marker',
        html: '<span></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(group);
    if (props.follow) {
      movingMap.current = true;
      try {
        if (m.getZoom() < 16) m.setView(center, 17, { animate: false });
        else m.panTo(center, { animate: false });
      } finally {
        movingMap.current = false;
      }
    }
  }, [props.location, props.follow, ready]);
  return (
    <div
      className={`map-surface ${props.picking ? 'picking' : ''} ${props.navigation ? 'navigation-map' : ''}`}
    >
      <div
        className="map-canvas"
        ref={element}
        aria-label="성수·서울숲·뚝섬 실제 지도와 추천 경로"
      />
      {props.picking && (
        <div className="map-notice">지도를 눌러 출발점을 선택하세요</div>
      )}
      {tileError && (
        <div className="tile-notice">
          배경지도 연결이 원활하지 않습니다. 실제 보행망과 추천 경로는
          표시됩니다.
        </div>
      )}
      <div className="map-legend">
        <span className="legend-dot" /> 추천 경로 <span>A 출발</span>
        <span>B 목적지</span>
      </div>
    </div>
  );
}
